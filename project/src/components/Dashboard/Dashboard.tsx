import { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  GraduationCap,
  School,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { academicAPI, cbtAPI, staffAPI, studentsAPI } from '../../services/api';
import type { Notice, Term } from '../../types';
import { Alert, Badge, EmptyState, PageHeader, Spinner } from '../UI/Primitives';

interface Stats {
  students: number;
  classrooms: number;
  staff: number;
  exams: number;
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const isStaff = can('school_admin', 'super_admin', 'teacher');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Each panel degrades independently — a missing current term should not
        // blank out the whole dashboard.
        const [studentStats, staffList, exams, currentTerm, pending] =
          await Promise.allSettled([
            studentsAPI.stats(),
            isStaff ? staffAPI.list({ page_size: 1 }) : Promise.reject(),
            cbtAPI.exams({ page_size: 1 }),
            academicAPI.currentTerm(),
            isStaff ? staffAPI.pendingNotices() : Promise.reject(),
          ]);

        if (cancelled) return;

        setStats({
          students:
            studentStats.status === 'fulfilled' ? studentStats.value.data.total : 0,
          classrooms:
            studentStats.status === 'fulfilled'
              ? studentStats.value.data.classrooms
              : 0,
          staff: staffList.status === 'fulfilled' ? staffList.value.data.count : 0,
          exams: exams.status === 'fulfilled' ? exams.value.data.count : 0,
        });

        if (currentTerm.status === 'fulfilled') setTerm(currentTerm.value.data);
        if (pending.status === 'fulfilled') {
          setNotices(pending.value.data.results.slice(0, 5));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isStaff]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  const cards = [
    { label: 'Students', value: stats?.students ?? 0, icon: Users, tone: 'bg-brand-50 text-brand-600' },
    { label: 'Classes', value: stats?.classrooms ?? 0, icon: School, tone: 'bg-purple-50 text-purple-600' },
    ...(isStaff
      ? [{ label: 'Staff', value: stats?.staff ?? 0, icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-600' }]
      : []),
    { label: 'Exams', value: stats?.exams ?? 0, icon: GraduationCap, tone: 'bg-green-50 text-green-600' },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.first_name || user?.username}`}
        subtitle={
          term
            ? `${term.name} — ${term.session_name} (${term.start_date} to ${term.end_date})`
            : undefined
        }
      />

      {!term && isStaff && (
        <div className="mb-6">
          <Alert kind="info">
            No current term is set. Attendance, checkouts and exams need one —
            create a session and term, and mark them current.
          </Alert>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className={`mb-3 inline-flex rounded-lg p-2 ${card.tone}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          );
        })}
      </div>

      {isStaff && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Pending on the noticeboard
          </h2>
          {notices.length === 0 ? (
            <EmptyState message="Nothing pending. " />
          ) : (
            <div className="space-y-2">
              {notices.map((notice) => (
                <div
                  key={notice.id}
                  className="flex flex-wrap items-center justify-between gap-3
                    rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{notice.title}</p>
                    <p className="truncate text-sm text-gray-500">{notice.body}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {notice.due_date && (
                      <span
                        className={`text-xs ${
                          notice.is_overdue ? 'font-medium text-red-600' : 'text-gray-500'
                        }`}
                      >
                        Due {notice.due_date}
                      </span>
                    )}
                    <Badge
                      tone={
                        notice.priority === 'high'
                          ? 'red'
                          : notice.priority === 'medium'
                            ? 'amber'
                            : 'gray'
                      }
                    >
                      {notice.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
