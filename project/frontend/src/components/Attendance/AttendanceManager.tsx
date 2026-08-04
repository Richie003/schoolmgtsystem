import { useCallback, useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { academicAPI, attendanceAPI, errorMessage } from '../../services/api';
import { describeDate, isWeekend, lastWeekday } from '../../utils/dates';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Classroom,
  Student,
  Term,
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

const STATUSES: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: 'present', label: 'Present', tone: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'absent', label: 'Absent', tone: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'late', label: 'Late', tone: 'bg-amber-100 text-amber-800 border-amber-300' },
  // Fixed colours, not brand ones: the four statuses must stay distinguishable
  // from each other whatever colour a school picks.
  { value: 'excused', label: 'Excused', tone: 'bg-slate-200 text-slate-800 border-slate-400' },
];

export default function AttendanceManager() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [classroomId, setClassroomId] = useState('');
  const [date, setDate] = useState(lastWeekday);

  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<number, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    academicAPI
      .classrooms({ page_size: 200 })
      .then(({ data }) => {
        setClassrooms(data.results);
        if (data.results.length) setClassroomId(String(data.results[0].id));
      })
      .catch(() => setError('Could not load classes.'));

    academicAPI
      .currentTerm()
      .then(({ data }) => setTerm(data))
      .catch(() =>
        setError('No current term is set. An administrator must set one first.'),
      );
  }, []);

  const weekend = isWeekend(date);
  /** True when the register already has saved marks for this class/day. */
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  const loadRegister = useCallback(async () => {
    if (!classroomId || !term) return;

    setLoading(true);
    setError('');
    try {
      const [{ data: roster }, { data: existing }] = await Promise.all([
        academicAPI.classroomStudents(Number(classroomId), { page_size: 200 }),
        attendanceAPI.list({
          classroom: classroomId,
          date,
          page_size: 200,
        }),
      ]);

      setStudents(roster.results);

      // Pre-fill from any marks already saved for this class/day, so re-opening
      // the register shows what was recorded rather than a blank sheet.
      const saved: Record<number, AttendanceStatus> = {};
      (existing.results as AttendanceRecord[]).forEach((record) => {
        saved[record.student] = record.status;
      });
      setAlreadyMarked(existing.results.length > 0);

      const seeded: Record<number, AttendanceStatus> = {};
      roster.results.forEach((student) => {
        seeded[student.id] = saved[student.id] ?? 'present';
      });
      setMarks(seeded);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the register.'));
    } finally {
      setLoading(false);
    }
  }, [classroomId, term, date]);

  useEffect(() => {
    if (!weekend) loadRegister();
    else setStudents([]);
  }, [loadRegister, weekend]);

  const setAll = (status: AttendanceStatus) => {
    setMarks(Object.fromEntries(students.map((s) => [s.id, status])));
  };

  const submit = async () => {
    if (!term) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await attendanceAPI.bulkMark({
        date,
        term: term.id,
        classroom: Number(classroomId),
        entries: students.map((s) => ({ student: s.id, status: marks[s.id] })),
      });
      setNotice(
        `Register saved — ${data.marked} student(s) marked for ${describeDate(date)}.`,
      );
      setAlreadyMarked(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the register.'));
    } finally {
      setSaving(false);
    }
  };

  const tally = STATUSES.map((status) => ({
    ...status,
    count: Object.values(marks).filter((m) => m === status.value).length,
  }));

  return (
    <div>
      <PageHeader
        title="Mark attendance"
        subtitle={
          term
            ? `${term.name} — ${term.session_name}. Pick a class and day, set each ` +
              'student’s status, then save the register.'
            : 'Pick a class and weekday to mark the register.'
        }
      />

      {!term && !error && (
        <div className="mb-4">
          <Alert kind="info">
            No current term is set, so attendance cannot be saved. Set one under
            Academics → Terms.
          </Alert>
        </div>
      )}
      {classrooms.length === 0 && !loading && (
        <div className="mb-4">
          <Alert kind="info">
            No classes exist yet. Create one under Academics → Classes.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-4"><Alert onDismiss={() => setError('')}>{error}</Alert></div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert kind="success" onDismiss={() => setNotice('')}>{notice}</Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Class">
          <select
            className={inputClass}
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
          >
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={term?.start_date}
            max={term?.end_date}
          />
          <span className="mt-1 block text-xs text-gray-500">{describeDate(date)}</span>
        </Field>
      </div>

      {weekend ? (
        <Alert kind="info">
          {describeDate(date)} is a weekend. Attendance is recorded on weekdays
          only — pick a weekday to open the register.
        </Alert>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : students.length === 0 ? (
        <EmptyState message="No active students in this class." />
      ) : (
        <>
          {alreadyMarked && (
            <div className="mb-4">
              <Alert kind="info">
                This register was already saved for {describeDate(date)}. Changing a
                status and saving again updates the existing records.
              </Alert>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-500">Mark all:</span>
            {STATUSES.map((status) => (
              <button
                key={status.value}
                onClick={() => setAll(status.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${status.tone}`}
              >
                {status.label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap gap-3 text-xs text-gray-600">
              {tally.map((t) => (
                <span key={t.value}>
                  {t.label}: <strong>{t.count}</strong>
                </span>
              ))}
            </div>
          </div>

          <TableWrap>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Admission no.
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-600">
                    {student.admission_number}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {student.full_name}
                  </td>
                  <td className="px-4 py-2">
                    <div
                      className="flex flex-wrap gap-1"
                      role="radiogroup"
                      aria-label={`Attendance for ${student.full_name}`}
                    >
                      {STATUSES.map((status) => {
                        const active = marks[student.id] === status.value;
                        return (
                          <button
                            key={status.value}
                            role="radio"
                            aria-checked={active}
                            onClick={() =>
                              setMarks((m) => ({ ...m, [student.id]: status.value }))
                            }
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition
                              ${active ? status.tone : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                          >
                            {active && <Check className="mr-1 inline h-3 w-3" />}
                            {status.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {students.length} student{students.length === 1 ? '' : 's'} in this
              register for {describeDate(date)}.
            </p>
            <Button onClick={submit} loading={saving} disabled={!term}>
              <Save className="h-4 w-4" />
              {alreadyMarked ? 'Update register' : 'Save register'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
