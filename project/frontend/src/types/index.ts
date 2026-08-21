export type Role = 'super_admin' | 'school_admin' | 'teacher' | 'student';

export interface School {
  id: number;
  name: string;
  display_name?: string;
  code: string;
  logo?: string | null;
  brand_color?: string;
}

/** What an admin may change about their school's appearance. */
export interface SchoolBranding {
  id: number;
  name: string;
  display_name: string;
  code: string;
  logo: string | null;
  brand_color: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: Role;
  phone?: string;
  avatar?: string | null;
  school: School | null;
  is_active: boolean;
  date_joined: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Classroom {
  id: number;
  name: string;
  arm: string;
  full_name: string;
  capacity: number;
  is_active: boolean;
  student_count: number;
}

export interface AcademicSession {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface Term {
  id: number;
  session: number;
  session_name: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface Student {
  id: number;
  admission_number: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  full_name: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth: string | null;
  classroom: number | null;
  classroom_name?: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  address: string;
  status: 'active' | 'graduated' | 'withdrawn';
  user: number | null;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: number;
  student: number;
  student_name: string;
  admission_number: string;
  session: number;
  term: number;
  classroom: number | null;
  date: string;
  status: AttendanceStatus;
  remark: string;
}

export interface CheckoutRecord {
  id: number;
  student: number;
  student_name: string;
  admission_number: string;
  session: number;
  term: number;
  classroom: number | null;
  date: string;
  checked_out_at: string;
  released_to: string;
  relationship: string;
  remark: string;
}

export interface StaffRole {
  id: number;
  name: string;
  description: string;
  is_teaching_role: boolean;
  staff_count: number;
}

export interface Staff {
  id: number;
  user: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  account_role: Role;
  is_active: boolean;
  staff_number: string;
  role: number | null;
  role_name?: string;
  phone: string;
  qualification: string;
  specialisation: string;
  date_employed: string | null;
  employment_status: 'active' | 'on_leave' | 'resigned';
}

export interface TeacherClassAssignment {
  id: number;
  teacher: number;
  teacher_name: string;
  classroom: number;
  classroom_name: string;
  session: number;
  term: number | null;
  is_form_teacher: boolean;
  is_active: boolean;
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  audience: 'all_staff' | 'teachers' | 'admins';
  assigned_to: number | null;
  assigned_to_name?: string;
  due_date: string | null;
  is_completed: boolean;
  is_overdue: boolean;
  created_by_name?: string;
  created_at: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export interface QuestionBank {
  id: number;
  subject: number;
  subject_name: string;
  name: string;
  description: string;
  is_active: boolean;
  question_count: number;
}

export interface Choice {
  id?: number;
  text: string;
  is_correct: boolean;
  order?: number;
}

export type QuestionType = 'single' | 'multiple';

export interface Question {
  id: number;
  bank: number;
  question_type: QuestionType;
  text: string;
  image: string | null;
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  explanation: string;
  is_active: boolean;
  choices: Choice[];
  correct_count: number;
}

// --- AI question generation ---
export type GenClassBand = 'primary' | 'jss' | 'ss';
export interface GenClassLevel { value: string; label: string; band: GenClassBand }
export interface GenLabelled { value: string; label: string }
export type GenComplexity = 'easy' | 'medium' | 'hard';
export type GenReason = 'ok' | 'disabled' | 'disabled_for_you' | 'trial_exhausted';

export interface GenStatus {
  available: boolean;
  reason: GenReason;
  remaining_trials: number;
  trial_limit?: number;
  is_enabled: boolean;
  is_premium: boolean;
  plan: 'free' | 'premium';
}

export interface GenOptions {
  class_levels: GenClassLevel[];
  exam_standards: GenLabelled[];
  complexity_levels: GenLabelled[];
  subjects: Record<GenClassBand, string[]>;
  calculation_subjects: string[];
  status: GenStatus;
}

export interface DraftOption { text: string; is_correct: boolean }
export interface DraftQuestion {
  text: string;
  options: DraftOption[];
  difficulty: GenComplexity;
  category: 'calculation' | 'reasoning';
  explanation: string;
}

export type GenJobStatus =
  | 'pending' | 'processing' | 'ready' | 'failed' | 'committed' | 'discarded';

export interface GenerationJob {
  id: number;
  status: GenJobStatus;
  class_level: string;
  exam_standard: string;
  subject_name: string;
  topics: string;
  complexity: GenComplexity;
  calculation_ratio: number;
  question_count: number;
  question_type: QuestionType;
  generated: DraftQuestion[];
  error: string;
  model_used: string;
  committed_bank: number | null;
  committed_count: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

export interface GenerationSettings {
  is_enabled: boolean;
  trial_limit: number;
  trials_used: number;
  remaining_trials: number;
  plan: 'free' | 'premium';
  is_premium: boolean;
  disabled_staff: number[];
  disabled_staff_detail: { id: number; name: string }[];
}

export interface CreateJobParams {
  class_level: string;
  exam_standard: string;
  subject_name: string;
  topics: string;
  complexity: GenComplexity;
  calculation_ratio: number;
  question_count: number;
  question_type: QuestionType;
}

export interface Exam {
  id: number;
  title: string;
  subject: number;
  subject_name: string;
  bank: number;
  bank_name: string;
  session: number;
  term: number;
  classrooms: number[];
  instructions: string;
  question_count: number;
  duration_minutes: number;
  pass_mark_percent: number;
  starts_at: string;
  ends_at: string;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  max_attempts: number;
  show_results_immediately: boolean;
  status: 'draft' | 'published' | 'closed';
  available_question_count: number;
  attempt_count: number;
  is_open: boolean;
}

/** Exam as a student sees it — no answer material. */
export interface StudentExam {
  id: number;
  title: string;
  subject_name: string;
  instructions: string;
  question_count: number;
  duration_minutes: number;
  pass_mark_percent: number;
  starts_at: string;
  ends_at: string;
  max_attempts: number;
  attempts_used: number;
  is_open: boolean;
  status: string;
}

export interface ExamAttempt {
  id: number;
  exam: number;
  exam_title: string;
  student: number;
  student_name: string;
  attempt_number: number;
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned';
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  seconds_remaining: number;
  score: number | null;
  total_marks: number;
  percentage: number | null;
  is_passed: boolean | null;
}

export interface PaperChoice {
  id: number;
  text: string;
}

export interface PaperQuestion {
  id: number;
  text: string;
  image: string | null;
  marks: number;
  question_type: QuestionType;
  /** How many options to pick. Null for single-answer questions. */
  correct_count: number | null;
  choices: PaperChoice[];
  selected_choices: number[];
}

export interface AttemptPaper {
  attempt: ExamAttempt;
  exam: {
    id: number;
    title: string;
    instructions: string;
    duration_minutes: number;
  };
  questions: PaperQuestion[];
}

export interface AttemptResult {
  id: number;
  exam: number;
  exam_title: string;
  attempt_number: number;
  status: string;
  score: number;
  total_marks: number;
  percentage: number;
  is_passed: boolean;
  submitted_at: string;
  breakdown:
    | {
        question_id: number;
        question: string | null;
        question_type?: QuestionType;
        selected: string | null;
        correct_answer: string | null;
        is_correct: boolean;
        marks_awarded: number;
        explanation: string;
      }[]
    | null;
}

export type ImportKind =
  | 'students'
  | 'staff'
  | 'questions'
  | 'attendance'
  | 'checkouts';

export interface ImportJob {
  id: number;
  kind: ImportKind;
  original_filename: string;
  status: 'pending' | 'validated' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  valid_rows: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  errors: { line: number | null; message: string }[];
  created_at: string;
}

export interface ImportPreview {
  job: ImportJob;
  columns: string[];
  preview: Record<string, string>[];
  errors: { line: number | null; message: string }[];
  summary: { total_rows: number; valid_rows: number; error_rows: number };
}

export interface ExportPreview {
  kind: string;
  columns: string[];
  total_rows: number;
  preview: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Onboarding (school signup)
// ---------------------------------------------------------------------------
// --- Results & report cards ---
export type SheetStatus = 'open' | 'submitted' | 'cumulated' | 'published';

export interface GradingComponent {
  id: number; name: string; max_score: number; order: number; is_exam: boolean;
}
export interface GradeBand {
  id: number; min_score: number; max_score: number; grade: string; remark: string; order: number;
}
export interface GradingScheme {
  id: number; name: string; is_default: boolean; is_active: boolean; total_max: number;
  components: GradingComponent[]; bands: GradeBand[];
}

export interface ResultSheet {
  id: number; classroom: number; classroom_name: string; session: number; session_name: string;
  term: number; term_name: string; scheme: number; scheme_name: string; subjects: number[];
  subject_names: string[]; status: SheetStatus; next_term_begins: string | null;
  report_count: number; student_count: number;
  submitted_at: string | null; cumulated_at: string | null; reviewed_at: string | null;
  published_at: string | null; created_at: string;
}

export interface GridCell { scores: Record<string, number>; teacher_remark: string }
export interface ResultGrid {
  sheet: ResultSheet;
  components: GradingComponent[];
  subjects: { id: number; name: string }[];
  students: { id: number; name: string; admission_number: string }[];
  rows: Record<string, Record<string, GridCell>>;
}

export interface ReportRow {
  id: number; student: number; student_name: string; admission_number: string;
  subjects_count: number; total: string | number; average: string | number; grade: string;
  position: number | null; class_size: number; class_teacher_remark: string;
  published_at: string | null;
}

export interface ReportSubject {
  subject: string; subject_id: number; scores: Record<string, number>;
  total: number; percent: number; grade: string; grade_remark: string;
  position: number | null; teacher_remark: string;
}
export interface ReportCardData {
  id: number; status: SheetStatus; published_at: string | null;
  student: { id: number; name: string; admission_number: string; photo: string | null; gender: string };
  classroom: string; term: string; session: string; next_term_begins: string | null;
  scheme: { name: string; components: GradingComponent[] };
  subjects: ReportSubject[];
  summary: {
    subjects_count: number; total: number; average: number; grade: string;
    grade_remark: string; position: number | null; class_size: number;
  };
  remarks: { class_teacher: string; principal: string };
  traits: Record<string, string>;
  attendance: { present: number; absent: number; total: number };
  template: {
    header_text: string; show_attendance: boolean; show_positions: boolean;
    show_remarks: boolean; show_traits: boolean; traits: string[];
  };
  school: { name: string; logo: string | null; brand_color: string; address: string };
}

export interface ReportTemplateSettings {
  header_text: string; show_attendance: boolean; show_positions: boolean;
  show_remarks: boolean; show_traits: boolean; traits: string[]; is_premium: boolean;
}

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface SchoolSignupRequest {
  id: number;
  school_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  message: string;
  status: SignupRequestStatus;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_note: string;
  invitation_status: InvitationStatus | null;
  created_at: string;
}

export interface SchoolInvitation {
  id: number;
  email: string;
  school_name: string;
  status: InvitationStatus;
  request: number | null;
  created_by: number | null;
  created_by_name: string | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  school: number | null;
  school_code: string | null;
  created_at: string;
}

/** Public view of an invite, for the accept-signup page. */
export interface InvitationPublic {
  email: string;
  school_name: string;
  expires_at: string;
}
