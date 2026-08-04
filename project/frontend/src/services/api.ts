import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  AcademicSession,
  AttemptPaper,
  AttemptResult,
  AttendanceRecord,
  AttendanceStatus,
  CheckoutRecord,
  Classroom,
  Exam,
  ExamAttempt,
  ExportPreview,
  ImportKind,
  ImportPreview,
  Notice,
  Paginated,
  InvitationPublic,
  CreateJobParams,
  DraftQuestion,
  GenerationJob,
  GenerationSettings,
  GenOptions,
  Question,
  QuestionBank,
  SchoolBranding,
  SchoolInvitation,
  SchoolSignupRequest,
  Staff,
  StaffRole,
  Student,
  StudentExam,
  Subject,
  TeacherClassAssignment,
  Term,
  User,
} from '../types';

// In production set VITE_API_BASE_URL to the API's public URL (the SPA and API
// live on separate servers). In dev it's left unset: the relative "/api" is
// proxied to the backend by the Vite dev server (see vite.config.ts).
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

const ACCESS_KEY = 'sms.access';
const REFRESH_KEY = 'sms.refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Refresh-on-401 with request coalescing.
 *
 * The CBT screen fires auto-saves continuously, so an access token expiring
 * mid-exam can produce a burst of simultaneous 401s. Without the shared
 * `refreshPromise` every one of them would trigger its own refresh, and with
 * ROTATE_REFRESH_TOKENS on the server all but the first would fail — logging the
 * student out mid-paper.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = tokenStore.refresh;
  if (!refresh) throw new Error('No refresh token');

  const response = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh });
  const { access, refresh: rotated } = response.data;
  tokenStore.set(access, rotated);
  return access;
}

export const onAuthFailure = { handler: null as null | (() => void) };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    const isAuthCall = original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const access = await refreshPromise;
        refreshPromise = null;

        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        refreshPromise = null;
        tokenStore.clear();
        onAuthFailure.handler?.();
      }
    }

    return Promise.reject(error);
  },
);

/** Pull a human-readable message out of a DRF error payload. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const data = (error as AxiosError<Record<string, unknown>>)?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;

  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;

  const value = data[firstKey];
  const text = Array.isArray(value) ? value[0] : value;
  // Field-specific messages already name their field in prose where it helps,
  // so only prefix keys a reader wouldn't otherwise be able to locate.
  const bare = ['non_field_errors', 'detail', 'student', 'date', 'headers', 'file'];
  const label = bare.includes(firstKey) ? '' : `${firstKey}: `;
  return `${label}${String(text)}`;
}

/**
 * Fetch every page of a paginated endpoint.
 *
 * Pickers that list "all students" must not silently stop at the page cap —
 * a 300-pupil school would quietly lose a third of its roster from the
 * dropdown, and the omission is invisible to the user.
 */
export async function fetchAll<T>(
  fetchPage: (params: Record<string, unknown>) => Promise<{ data: Paginated<T> }>,
  params: Record<string, unknown> = {},
  pageSize = 200,
): Promise<T[]> {
  const collected: T[] = [];
  let page = 1;

  // Bounded so a pagination bug can never spin forever.
  for (let guard = 0; guard < 50; guard += 1) {
    const { data } = await fetchPage({ ...params, page, page_size: pageSize });
    collected.push(...data.results);
    if (!data.next) break;
    page += 1;
  }
  return collected;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authAPI = {
  login: (username: string, password: string) =>
    api.post<{ access: string; refresh: string; user: User }>('/auth/login/', {
      username,
      password,
    }),
  me: () => api.get<User>('/auth/me/'),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password/', { current_password, new_password }),
};

// ---------------------------------------------------------------------------
// School branding
// ---------------------------------------------------------------------------
export const brandingAPI = {
  /** Readable by every member of the school; the SPA themes itself from it. */
  get: () => api.get<SchoolBranding>('/school/branding/'),

  update: (data: { brand_color?: string; display_name?: string }) =>
    api.patch<SchoolBranding>('/school/branding/', data),

  /** Logo upload needs multipart rather than JSON. */
  updateLogo: (logo: File) => {
    const form = new FormData();
    form.append('logo', logo);
    return api.patch<SchoolBranding>('/school/branding/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  removeLogo: () => {
    // An empty multipart value clears the ImageField.
    const form = new FormData();
    form.append('logo', '');
    return api.patch<SchoolBranding>('/school/branding/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ---------------------------------------------------------------------------
// Students / academic structure
// ---------------------------------------------------------------------------
export const academicAPI = {
  sessions: (params?: object) =>
    api.get<Paginated<AcademicSession>>('/sessions/', { params }),
  createSession: (data: Partial<AcademicSession>) =>
    api.post<AcademicSession>('/sessions/', data),
  updateSession: (id: number, data: Partial<AcademicSession>) =>
    api.patch<AcademicSession>(`/sessions/${id}/`, data),
  removeSession: (id: number) => api.delete(`/sessions/${id}/`),

  terms: (params?: object) => api.get<Paginated<Term>>('/terms/', { params }),
  createTerm: (data: Partial<Term>) => api.post<Term>('/terms/', data),
  updateTerm: (id: number, data: Partial<Term>) =>
    api.patch<Term>(`/terms/${id}/`, data),
  removeTerm: (id: number) => api.delete(`/terms/${id}/`),
  currentTerm: () => api.get<Term>('/terms/current/'),

  classrooms: (params?: object) =>
    api.get<Paginated<Classroom>>('/classrooms/', { params }),
  createClassroom: (data: Partial<Classroom>) =>
    api.post<Classroom>('/classrooms/', data),
  updateClassroom: (id: number, data: Partial<Classroom>) =>
    api.patch<Classroom>(`/classrooms/${id}/`, data),
  removeClassroom: (id: number) => api.delete(`/classrooms/${id}/`),
  classroomStudents: (id: number, params?: object) =>
    api.get<Paginated<Student>>(`/classrooms/${id}/students/`, { params }),
};

export const studentsAPI = {
  list: (params?: object) => api.get<Paginated<Student>>('/students/', { params }),
  get: (id: number) => api.get<Student>(`/students/${id}/`),
  create: (data: Partial<Student>) => api.post<Student>('/students/', data),
  update: (id: number, data: Partial<Student>) =>
    api.patch<Student>(`/students/${id}/`, data),
  remove: (id: number) => api.delete(`/students/${id}/`),
  stats: () => api.get('/students/stats/'),
  createAccount: (id: number, data: { username: string; password: string; email?: string }) =>
    api.post(`/students/${id}/create-account/`, data),
};

export const attendanceAPI = {
  list: (params?: object) =>
    api.get<Paginated<AttendanceRecord>>('/attendance/', { params }),
  summary: (params?: object) => api.get('/attendance/summary/', { params }),
  bulkMark: (data: {
    date: string;
    term: number;
    classroom?: number;
    entries: { student: number; status: AttendanceStatus; remark?: string }[];
  }) => api.post('/attendance/bulk-mark/', data),
};

export const checkoutsAPI = {
  list: (params?: object) =>
    api.get<Paginated<CheckoutRecord>>('/checkouts/', { params }),
  create: (data: Partial<CheckoutRecord>) =>
    api.post<CheckoutRecord>('/checkouts/', data),
  remove: (id: number) => api.delete(`/checkouts/${id}/`),
};

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
export const staffAPI = {
  list: (params?: object) => api.get<Paginated<Staff>>('/staff/', { params }),
  create: (data: object) => api.post<Staff>('/staff/', data),
  update: (id: number, data: object) => api.patch<Staff>(`/staff/${id}/`, data),
  remove: (id: number) => api.delete(`/staff/${id}/`),
  deactivate: (id: number) => api.post(`/staff/${id}/deactivate/`),
  teachers: (params?: object) =>
    api.get<Paginated<Staff>>('/staff/teachers/', { params }),

  roles: () => api.get<Paginated<StaffRole>>('/staff/roles/'),
  createRole: (data: Partial<StaffRole>) =>
    api.post<StaffRole>('/staff/roles/', data),

  assignments: (params?: object) =>
    api.get<Paginated<TeacherClassAssignment>>('/staff/assignments/', { params }),
  createAssignment: (data: Partial<TeacherClassAssignment>) =>
    api.post<TeacherClassAssignment>('/staff/assignments/', data),
  removeAssignment: (id: number) => api.delete(`/staff/assignments/${id}/`),
  myClasses: () =>
    api.get<TeacherClassAssignment[]>('/staff/assignments/my-classes/'),

  notices: (params?: object) => api.get<Paginated<Notice>>('/staff/notices/', { params }),
  pendingNotices: () => api.get<Paginated<Notice>>('/staff/notices/pending/'),
  createNotice: (data: Partial<Notice>) => api.post<Notice>('/staff/notices/', data),
  completeNotice: (id: number) => api.post<Notice>(`/staff/notices/${id}/complete/`),
  removeNotice: (id: number) => api.delete(`/staff/notices/${id}/`),
};

// ---------------------------------------------------------------------------
// CBT
// ---------------------------------------------------------------------------
export const cbtAPI = {
  subjects: (params?: object) => api.get<Paginated<Subject>>('/cbt/subjects/', { params }),
  createSubject: (data: Partial<Subject>) => api.post<Subject>('/cbt/subjects/', data),
  updateSubject: (id: number, data: Partial<Subject>) =>
    api.patch<Subject>(`/cbt/subjects/${id}/`, data),
  removeSubject: (id: number) => api.delete(`/cbt/subjects/${id}/`),

  banks: (params?: object) =>
    api.get<Paginated<QuestionBank>>('/cbt/question-banks/', { params }),
  createBank: (data: Partial<QuestionBank>) =>
    api.post<QuestionBank>('/cbt/question-banks/', data),

  questions: (params?: object) =>
    api.get<Paginated<Question>>('/cbt/questions/', { params }),
  createQuestion: (data: object) => api.post<Question>('/cbt/questions/', data),
  updateQuestion: (id: number, data: object) =>
    api.patch<Question>(`/cbt/questions/${id}/`, data),
  removeQuestion: (id: number) => api.delete(`/cbt/questions/${id}/`),

  exams: (params?: object) => api.get<Paginated<Exam>>('/cbt/exams/', { params }),
  createExam: (data: object) => api.post<Exam>('/cbt/exams/', data),
  updateExam: (id: number, data: object) => api.patch<Exam>(`/cbt/exams/${id}/`, data),
  publishExam: (id: number) => api.post<Exam>(`/cbt/exams/${id}/publish/`),
  closeExam: (id: number) => api.post<Exam>(`/cbt/exams/${id}/close/`),
  examResults: (id: number, params?: object) =>
    api.get(`/cbt/exams/${id}/results/`, { params }),
  availableExams: () => api.get<StudentExam[]>('/cbt/exams/available/'),

  attempts: (params?: object) =>
    api.get<Paginated<ExamAttempt>>('/cbt/attempts/', { params }),
  start: (exam: number) => api.post<AttemptPaper>('/cbt/attempts/start/', { exam }),
  paper: (id: number) => api.get<AttemptPaper>(`/cbt/attempts/${id}/paper/`),
  saveAnswer: (id: number, question: number, choices: number[]) =>
    api.post<{ saved: boolean; seconds_remaining: number }>(
      `/cbt/attempts/${id}/save-answer/`,
      { question, choices },
    ),
  saveAnswers: (id: number, answers: { question: number; choices: number[] }[]) =>
    api.post(`/cbt/attempts/${id}/save-answers/`, { answers }),
  submit: (id: number) => api.post<AttemptResult>(`/cbt/attempts/${id}/submit/`),
  result: (id: number) => api.get<AttemptResult>(`/cbt/attempts/${id}/result/`),
  timer: (id: number) =>
    api.get<{ status: string; seconds_remaining: number }>(`/cbt/attempts/${id}/timer/`),
};

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

/**
 * Fetch a CSV through the authenticated client and save it.
 *
 * Every file the app offers must go through here. Linking straight to an API
 * URL looks simpler but drops the bearer token, which fails with a 401 that
 * looks to the user like a permissions problem rather than a missing header.
 */
async function downloadCsv(
  path: string,
  params: Record<string, unknown>,
  filename: string,
) {
  const response = await api.get(path, { params, responseType: 'blob' });

  const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// AI question generation
// ---------------------------------------------------------------------------
export const cbtGenAPI = {
  options: () => api.get<GenOptions>('/cbt-gen/options/'),
  getSettings: () => api.get<GenerationSettings>('/cbt-gen/settings/'),
  updateSettings: (
    data: Partial<Pick<GenerationSettings, 'is_enabled' | 'trial_limit' | 'disabled_staff'>>,
  ) => api.patch<GenerationSettings>('/cbt-gen/settings/', data),

  createJob: (data: CreateJobParams) => api.post<GenerationJob>('/cbt-gen/jobs/', data),
  getJob: (id: number) => api.get<GenerationJob>(`/cbt-gen/jobs/${id}/`),
  listJobs: (params?: object) =>
    api.get<Paginated<GenerationJob>>('/cbt-gen/jobs/', { params }),
  commit: (
    id: number,
    data: {
      subject_id?: number;
      subject_name?: string;
      bank_id?: number;
      bank_name?: string;
      questions: DraftQuestion[];
    },
  ) =>
    api.post<{ created: number; bank: { id: number; name: string; subject: string } }>(
      `/cbt-gen/jobs/${id}/commit/`,
      data,
    ),
  discard: (id: number) => api.post(`/cbt-gen/jobs/${id}/discard/`),
};

export const dataioAPI = {
  upload: (kind: ImportKind, file: File, term?: number) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    if (term) form.append('term', String(term));
    return api.post<ImportPreview>('/dataio/imports/upload/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  preview: (jobId: number) => api.get<ImportPreview>(`/dataio/imports/${jobId}/preview/`),
  commit: (jobId: number) => api.post(`/dataio/imports/${jobId}/commit/`),
  jobs: (params?: object) => api.get('/dataio/imports/', { params }),

  /**
   * Blank CSV template for a dataset.
   *
   * Fetched through the API client rather than linked with an <a href>: a plain
   * browser navigation carries no Authorization header, so the endpoint —
   * which requires JWT like every other one — answered 401.
   */
  downloadTemplate: (kind: ImportKind) =>
    downloadCsv('/dataio/imports/template/', { kind }, `${kind}-import-template.csv`),

  exportPreview: (kind: ImportKind, filters: Record<string, unknown> = {}) =>
    api.get<ExportPreview>('/dataio/exports/preview/', {
      params: { kind, ...filters },
    }),

  download: (kind: ImportKind, filters: Record<string, unknown> = {}) =>
    downloadCsv('/dataio/exports/download/', { kind, ...filters }, `${kind}.csv`),
};

// ---------------------------------------------------------------------------
// Onboarding (school signup)
// ---------------------------------------------------------------------------
export const onboardingAPI = {
  // Public
  requestAccess: (data: {
    school_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone?: string;
    message?: string;
  }) => api.post<{ detail: string }>('/onboarding/requests/', data),

  validateInvite: (token: string) =>
    api.get<InvitationPublic>(`/onboarding/invite/${encodeURIComponent(token)}/`),

  acceptInvite: (
    token: string,
    data: {
      username: string;
      password: string;
      first_name: string;
      last_name: string;
      school_name?: string;
    },
    logo?: File | null,
  ) => {
    const url = `/onboarding/invite/${encodeURIComponent(token)}/accept/`;
    // A logo means an actual file upload, which has to go as multipart. Without
    // one we keep the simpler JSON body.
    if (logo) {
      const form = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) form.append(key, value);
      });
      form.append('logo', logo);
      return api.post<{ access: string; refresh: string; user: User }>(url, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post<{ access: string; refresh: string; user: User }>(url, data);
  },

  // Super admin
  requests: (params?: object) =>
    api.get<Paginated<SchoolSignupRequest>>('/onboarding/requests/', { params }),
  approveRequest: (
    id: number,
    data: { school_name?: string; email?: string; expires_days?: number } = {},
  ) => api.post<SchoolInvitation>(`/onboarding/requests/${id}/approve/`, data),
  rejectRequest: (id: number, reason?: string) =>
    api.post<SchoolSignupRequest>(`/onboarding/requests/${id}/reject/`, { reason }),

  invitations: (params?: object) =>
    api.get<Paginated<SchoolInvitation>>('/onboarding/invitations/', { params }),
  createInvitation: (data: {
    email: string;
    school_name: string;
    expires_days?: number;
  }) => api.post<SchoolInvitation>('/onboarding/invitations/', data),
  revokeInvitation: (id: number) =>
    api.post<SchoolInvitation>(`/onboarding/invitations/${id}/revoke/`),
  resendInvitation: (id: number) =>
    api.post<SchoolInvitation>(`/onboarding/invitations/${id}/resend/`),
};

export default api;
