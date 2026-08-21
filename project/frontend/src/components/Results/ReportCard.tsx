import { useRef } from 'react';
import { Download, GraduationCap } from 'lucide-react';
import type { ReportCardData } from '../../types';
import { Button } from '../UI/Primitives';
import { printElement } from '../../utils/print';

function ordinal(n: number | null): string {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A printable terminal report sheet, rendered from the API payload. */
export default function ReportCard({ data }: { data: ReportCardData }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const t = data.template;
  const accent = data.school.brand_color || '#2563eb';

  const download = () => {
    if (cardRef.current) {
      printElement(cardRef.current, `${data.student.name} — ${data.term}`);
    }
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={download}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <div
        ref={cardRef}
        className="mx-auto max-w-3xl bg-white p-6 text-gray-900 shadow-sm"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-4 rounded-t-lg p-4 text-white"
          style={{ backgroundColor: accent }}
        >
          {data.school.logo ? (
            <img src={data.school.logo} alt="" className="h-14 w-14 rounded bg-white object-contain p-1" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded bg-white/20">
              <GraduationCap className="h-7 w-7" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">{data.school.name}</h2>
            {data.school.address && <p className="truncate text-xs opacity-90">{data.school.address}</p>}
            <p className="mt-0.5 text-sm font-medium opacity-95">
              {t.header_text || 'Terminal Report Sheet'}
            </p>
          </div>
        </div>

        {/* Student meta */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-x border-gray-300 p-4 text-sm sm:grid-cols-3">
          <Meta label="Student" value={data.student.name} />
          <Meta label="Admission No." value={data.student.admission_number} />
          <Meta label="Class" value={data.classroom} />
          <Meta label="Term" value={`${data.term} · ${data.session}`} />
          <Meta label="Average" value={`${data.summary.average}%`} />
          <Meta label="Overall grade" value={`${data.summary.grade} ${data.summary.grade_remark}`} />
          {t.show_positions && (
            <Meta label="Position" value={`${ordinal(data.summary.position)} of ${data.summary.class_size}`} />
          )}
          {t.show_attendance && (
            <Meta
              label="Attendance"
              value={`${data.attendance.present}/${data.attendance.total} present`}
            />
          )}
        </div>

        {/* Subjects */}
        <div className="overflow-x-auto border-x border-gray-300">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                <th className="border border-gray-300 px-2 py-2">Subject</th>
                {data.scheme.components.map((c) => (
                  <th key={c.id} className="border border-gray-300 px-2 py-2 text-center">
                    {c.name}<span className="block text-[10px] font-normal">/{c.max_score}</span>
                  </th>
                ))}
                <th className="border border-gray-300 px-2 py-2 text-center">Total</th>
                <th className="border border-gray-300 px-2 py-2 text-center">Grade</th>
                {t.show_positions && (
                  <th className="border border-gray-300 px-2 py-2 text-center">Pos.</th>
                )}
                <th className="border border-gray-300 px-2 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <tr key={s.subject_id}>
                  <td className="border border-gray-300 px-2 py-1.5 font-medium">{s.subject}</td>
                  {data.scheme.components.map((c) => (
                    <td key={c.id} className="border border-gray-300 px-2 py-1.5 text-center">
                      {s.scores[String(c.id)] ?? '—'}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-2 py-1.5 text-center font-semibold">
                    {s.total}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">{s.grade}</td>
                  {t.show_positions && (
                    <td className="border border-gray-300 px-2 py-1.5 text-center">{s.position ?? '—'}</td>
                  )}
                  <td className="border border-gray-300 px-2 py-1.5 text-xs">{s.grade_remark}</td>
                </tr>
              ))}
              {data.subjects.length === 0 && (
                <tr>
                  <td colSpan={4 + data.scheme.components.length} className="border border-gray-300 px-2 py-4 text-center text-gray-500">
                    No subject results.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Traits (premium) */}
        {t.show_traits && t.traits.length > 0 && (
          <div className="border-x border-gray-300 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Affective & psychomotor
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {t.traits.map((name) => (
                <Meta key={name} label={name} value={data.traits[name] || '—'} />
              ))}
            </div>
          </div>
        )}

        {/* Remarks */}
        {t.show_remarks && (
          <div className="space-y-2 border-x border-gray-300 p-4 text-sm">
            <Remark label="Class teacher's remark" value={data.remarks.class_teacher} />
            <Remark label="Principal's remark" value={data.remarks.principal} />
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-lg border border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
          <span>Grading scheme: {data.scheme.name}</span>
          {data.next_term_begins && <span>Next term begins: {data.next_term_begins}</span>}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function Remark({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <p className="mt-0.5 min-h-[1.5rem] border-b border-dashed border-gray-300 pb-1">
        {value || <span className="text-gray-400">—</span>}
      </p>
    </div>
  );
}
