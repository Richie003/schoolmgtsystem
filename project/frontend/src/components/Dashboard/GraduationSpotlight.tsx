import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { studentsAPI } from '../../services/api';
import type { GraduatingResponse, Student } from '../../types';

const MAX_PER_CLASS = 14; // cap the avatar rows; the rest roll into "+N more"

/**
 * A standing reminder, for admins, of the students due to graduate or move up a
 * level. Grouped by class — each graduating class becomes a section showing
 * where its pupils head next and their faces beneath — so the whole cohort is
 * scannable at a glance. Shows itself only when there are such students in the
 * current session, and hides entirely otherwise.
 */
export default function GraduationSpotlight() {
  const [data, setData] = useState<GraduatingResponse | null>(null);

  useEffect(() => {
    studentsAPI.graduating().then(({ data }) => setData(data)).catch(() => setData(null));
  }, []);

  const groups = useMemo(() => byClass(data?.students ?? []), [data]);

  if (!data || data.count === 0) return null;

  const due = data.due;

  return (
    <section
      className={`mb-8 overflow-hidden rounded-2xl border bg-white shadow-sm ${
        due ? 'border-amber-200' : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              due ? 'bg-amber-100 text-amber-600' : 'bg-brand-50 text-brand-600'
            }`}
          >
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-gray-900">
              {due ? 'Due to graduate' : 'Graduating this session'}
            </p>
            <p className="text-xs text-gray-500">
              {due && data.term ? `${data.term} · ` : ''}{data.session ?? ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {due && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              This term
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold tabular-nums text-gray-700">
            {data.count} total
          </span>
        </div>
      </div>

      {/* One section per class */}
      <div className="divide-y divide-gray-100">
        {groups.map((g) => {
          const shown = g.students.slice(0, MAX_PER_CLASS);
          const extra = g.students.length - shown.length;
          return (
            <div key={g.className} className="px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-gray-900">{g.className}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate rounded-md bg-brand-50 px-2 py-0.5 text-sm font-medium text-brand-700">
                    {g.destination}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StageBadge stage={g.stage} />
                  <span className="text-sm text-gray-500 tabular-nums">
                    {g.students.length} pupil{g.students.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {shown.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-50 py-1 pl-1 pr-2.5"
                    title={s.admission_number}
                  >
                    <Avatar student={s} />
                    <span className="max-w-[9rem] truncate text-sm text-gray-700">{s.full_name}</span>
                  </span>
                ))}
                {extra > 0 && (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-500">
                    +{extra} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface Group {
  className: string;
  destination: string;
  stage: string;
  students: Student[];
}

function byClass(students: Student[]): Group[] {
  const map = new Map<string, Group>();
  for (const s of students) {
    const key = s.classroom_name || 'Unassigned';
    let group = map.get(key);
    if (!group) {
      group = {
        className: key,
        destination: destinationOf(s),
        stage: s.graduation_stage || 'level',
        students: [],
      };
      map.set(key, group);
    }
    group.students.push(s);
  }
  return [...map.values()];
}

function destinationOf(s: Student): string {
  if (s.graduates_to && s.graduates_to.trim()) return s.graduates_to;
  return s.graduation_stage === 'school' ? 'Graduating' : 'Next level';
}

function initials(s: Student): string {
  return `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase() || '·';
}

function Avatar({ student }: { student: Student }) {
  if (student.photo) {
    return (
      <img
        src={student.photo}
        alt=""
        className="h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[11px] font-semibold text-brand-700">
      {initials(student)}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const isFinal = stage === 'school';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isFinal ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand-700'
      }`}
    >
      {isFinal ? 'Final class' : 'Level exit'}
    </span>
  );
}
