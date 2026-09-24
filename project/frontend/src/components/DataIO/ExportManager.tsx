import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { academicAPI, cbtAPI, dataioAPI, errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type {
  AcademicSession, Classroom, ExportKind, ExportPreview, Subject, Term,
} from '../../types';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  PageHeader,
  Spinner,
  TableWrap,
  inputClass,
} from '../UI/Primitives';

const ALL_KINDS: { value: ExportKind; label: string; adminOnly?: boolean }[] = [
  { value: 'students', label: 'Students' },
  { value: 'staff', label: 'Staff' },
  { value: 'questions', label: 'Questions' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'checkouts', label: 'Checkouts' },
  { value: 'cbt', label: 'CBT results', adminOnly: true },
  { value: 'results', label: 'Result sheets', adminOnly: true },
  { value: 'report_cards', label: 'Report cards', adminOnly: true },
];

const DATE_FILTERED: ExportKind[] = ['attendance', 'checkouts'];
const RESULT_KINDS: ExportKind[] = ['cbt', 'results', 'report_cards'];
const SUBJECT_KINDS: ExportKind[] = ['cbt', 'results']; // report cards have no subject dimension

export default function ExportManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'school_admin' || user?.role === 'super_admin';
  const kinds = useMemo(
    () => ALL_KINDS.filter((k) => !k.adminOnly || isAdmin),
    [isAdmin],
  );

  const [kind, setKind] = useState<ExportKind>('students');
  const [classroom, setClassroom] = useState('');
  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    academicAPI.classrooms({ page_size: 200 })
      .then(({ data }) => setClassrooms(data.results)).catch(() => undefined);
    academicAPI.terms({ page_size: 100 })
      .then(({ data }) => setTerms(data.results)).catch(() => undefined);
    academicAPI.sessions({ page_size: 100 })
      .then(({ data }) => setSessions(data.results)).catch(() => undefined);
    cbtAPI.subjects({ page_size: 200 })
      .then(({ data }) => setSubjects(data.results)).catch(() => undefined);
  }, []);

  // Which filters apply to the current dataset.
  const isResult = RESULT_KINDS.includes(kind);
  const isDated = DATE_FILTERED.includes(kind);
  const showsClassroom = kind === 'students' || isDated || isResult;
  const showsSession = isResult;
  const showsTerm = isDated || isResult;
  const showsSubject = SUBJECT_KINDS.includes(kind);

  const filters = useCallback(() => {
    const result: Record<string, unknown> = {};
    if (showsClassroom && classroom) result.classroom = classroom;
    if (showsSession && session) result.session = session;
    if (showsTerm && term) result.term = term;
    if (showsSubject && subject) result.subject = subject;
    if (isDated) {
      if (dateFrom) result.date_from = dateFrom;
      if (dateTo) result.date_to = dateTo;
    }
    return result;
  }, [showsClassroom, classroom, showsSession, session, showsTerm, term, showsSubject, subject, isDated, dateFrom, dateTo]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await dataioAPI.exportPreview(kind, filters());
      setPreview(data);
    } catch (err) {
      setError(errorMessage(err, 'Could not build the preview.'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [kind, filters]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      await dataioAPI.download(kind, filters());
    } catch (err) {
      setError(errorMessage(err, 'Could not download the file.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Export data"
        subtitle="Preview what will be exported, then download it as CSV."
      />

      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dataset">
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as ExportKind)}
            >
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>

          {showsClassroom && (
            <Field label="Class">
              <select
                className={inputClass}
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
              >
                <option value="">All classes</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>
          )}

          {showsSession && (
            <Field label="Session">
              <select
                className={inputClass}
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                <option value="">All sessions</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          )}

          {showsTerm && (
            <Field label="Term">
              <select
                className={inputClass}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              >
                <option value="">All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} — {t.session_name}</option>
                ))}
              </select>
            </Field>
          )}

          {showsSubject && (
            <Field label="Subject">
              <select
                className={inputClass}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          )}

          {isDated && (
            <>
              <Field label="From">
                <input
                  type="date"
                  className={inputClass}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={inputClass}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

        {isResult && (
          <p className="mt-3 text-xs text-gray-500">
            Result exports include finalised (cumulated or published) sheets only, and
            can span every term — filter to narrow to one class, session or term.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={loadPreview} loading={loading}>
            <Eye className="h-4 w-4" />
            Refresh preview
          </Button>
          <Button
            onClick={download}
            loading={downloading}
            disabled={!preview || preview.total_rows === 0}
          >
            <Download className="h-4 w-4" />
            Download CSV
            {preview && preview.total_rows > 0 && ` (${preview.total_rows} rows)`}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : !preview || preview.total_rows === 0 ? (
        <EmptyState message="No rows match these filters." />
      ) : (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            Showing the first {preview.preview.length} of {preview.total_rows} row(s).
          </p>
          <TableWrap>
            <thead className="bg-gray-50">
              <tr>
                {preview.columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {column.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {preview.preview.map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {String(row[column] ?? '') || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      )}
    </div>
  );
}
