import type { ReactNode } from 'react';
import {
  Check,
  Clock,
  Lock,
  Mail,
  Pin,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';

/*
 * Hand-built UI mockups — one per feature — that render as crisp product
 * screens rather than raster screenshots. They stay sharp at any size, match
 * the dark marketing theme, re-colour with the brand palette, and never go
 * stale the way a captured screenshot would. Content is representative of the
 * real screens described on the Features page.
 */

/** Browser-ish window chrome shared by every mockup. */
function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-2 border-b border-white/10 bg-gray-950/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        <span className="ml-2 truncate text-xs font-medium text-gray-500">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Avatar({ initials, tone = 'brand' }: { initials: string; tone?: 'brand' | 'indigo' | 'amber' }) {
  const tones = {
    brand: 'bg-brand-500/20 text-brand-200',
    indigo: 'bg-indigo-500/20 text-indigo-200',
    amber: 'bg-amber-500/20 text-amber-200',
  }[tone];
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${tones}`}>
      {initials}
    </span>
  );
}

function Pill({ children, tone = 'gray' }: { children: ReactNode; tone?: 'green' | 'amber' | 'brand' | 'gray' | 'red' }) {
  const tones = {
    green: 'bg-green-500/15 text-green-300',
    amber: 'bg-amber-500/15 text-amber-300',
    brand: 'bg-brand-500/15 text-brand-300',
    red: 'bg-red-500/15 text-red-300',
    gray: 'bg-white/5 text-gray-400',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones}`}>
      {children}
    </span>
  );
}

function StudentsMock() {
  const rows = [
    { initials: 'AB', name: 'Amina Bello', adm: 'ADM/24/018', cls: 'JSS1 A', status: 'Active', tone: 'green' as const },
    { initials: 'CO', name: 'Chidi Okeke', adm: 'ADM/24/031', cls: 'JSS2 B', status: 'Active', tone: 'green' as const },
    { initials: 'TA', name: 'Tunde Adeyemi', adm: 'ADM/24/047', cls: 'JSS1 A', status: 'Checked out', tone: 'amber' as const },
    { initials: 'NU', name: 'Ngozi Umeh', adm: 'ADM/24/052', cls: 'JSS3 A', status: 'Active', tone: 'green' as const },
  ];
  return (
    <Window title="Students">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-gray-500">
          <Search className="h-3.5 w-3.5" />
          Search students…
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-brand-contrast">
          <Plus className="h-3.5 w-3.5" />
          Add
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.map((r) => (
          <div key={r.adm} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
            <Avatar initials={r.initials} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{r.name}</p>
              <p className="truncate text-[11px] text-gray-500">{r.adm}</p>
            </div>
            <span className="hidden text-[11px] text-gray-400 sm:block">{r.cls}</span>
            <Pill tone={r.tone}>{r.status}</Pill>
          </div>
        ))}
      </div>
    </Window>
  );
}

function StaffMock() {
  const staff = [
    { initials: 'FO', name: 'Mrs. F. Okon', role: 'Head of Science', tone: 'indigo' as const },
    { initials: 'JE', name: 'Mr. J. Eze', role: 'Mathematics Teacher', tone: 'brand' as const },
    { initials: 'RA', name: 'Ms. R. Aliyu', role: 'Bursar', tone: 'amber' as const },
  ];
  return (
    <Window title="Staff & noticeboard">
      <div className="space-y-1.5">
        {staff.map((s) => (
          <div key={s.name} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
            <Avatar initials={s.initials} tone={s.tone} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{s.name}</p>
              <p className="truncate text-[11px] text-gray-500">{s.role}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-brand-500/20 bg-brand-500/[0.07] p-3">
        <div className="flex items-center gap-2">
          <Pin className="h-3.5 w-3.5 text-brand-300" />
          <p className="text-xs font-semibold text-white">PTA meeting — Friday, 2:00pm</p>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Pinned to noticeboard · assigned to 3 staff</p>
      </div>
    </Window>
  );
}

function CbtMock() {
  const options = [
    { text: '6 kg·m/s', selected: false },
    { text: '60 kg·m/s', selected: true },
    { text: '0.6 kg·m/s', selected: false },
    { text: '600 kg·m/s', selected: false },
  ];
  return (
    <Window title="Exam · Physics">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-400">Question 3 of 20</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
          <Clock className="h-3 w-3" />
          14:32
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-200">
        A 2&nbsp;kg mass falls freely from rest. Using the relations below, find its
        momentum after 3&nbsp;seconds.
      </p>
      <div className="mt-2 rounded-lg bg-white/5 py-2 text-center">
        <span className="font-serif text-sm italic text-brand-200">
          p = m·v,&nbsp;&nbsp; v = u + at
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {options.map((o) => (
          <div
            key={o.text}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              o.selected
                ? 'border-brand-500/60 bg-brand-500/10 text-white'
                : 'border-white/10 bg-white/[0.02] text-gray-400'
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                o.selected ? 'border-brand-400 bg-brand-500' : 'border-white/25'
              }`}
            >
              {o.selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            {o.text}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[15%] rounded-full bg-brand-500" />
        </div>
        <span className="rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-brand-contrast">
          Next
        </span>
      </div>
    </Window>
  );
}

function AcademicsMock() {
  const subjects = ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology'];
  return (
    <Window title="Academic structure">
      <div className="flex items-center justify-between rounded-lg border border-brand-500/20 bg-brand-500/[0.07] px-3 py-2.5">
        <div>
          <p className="text-[11px] text-gray-400">Session</p>
          <p className="text-sm font-semibold text-white">2024 / 2025</p>
        </div>
        <Pill tone="brand">
          <Check className="h-3 w-3" /> Current
        </Pill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { t: 'First term', current: true },
          { t: 'Second term', current: false },
          { t: 'Third term', current: false },
        ].map((term) => (
          <div
            key={term.t}
            className={`rounded-lg px-2 py-2 text-center text-[11px] font-medium ${
              term.current
                ? 'bg-brand-500/15 text-brand-200'
                : 'bg-white/[0.03] text-gray-500'
            }`}
          >
            {term.t}
            {term.current && <span className="mt-0.5 block text-[10px] text-brand-300">active</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-gray-500">Subjects</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {subjects.map((s) => (
          <span key={s} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-gray-300">
            {s}
          </span>
        ))}
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-gray-500">+4</span>
      </div>
    </Window>
  );
}

function DataIoMock() {
  return (
    <Window title="Import · students.csv">
      <div className="flex items-center gap-2">
        <Pill tone="green">
          <Check className="h-3 w-3" /> 48 valid
        </Pill>
        <Pill tone="red">
          <X className="h-3 w-3" /> 2 errors
        </Pill>
        <span className="ml-auto text-[11px] text-gray-500">Preview before import</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {[
          { ok: true, text: 'Amina Bello — JSS1 A' },
          { ok: true, text: 'Chidi Okeke — JSS2 B' },
          { ok: false, text: 'Row 14 — unknown class “JSS9”' },
        ].map((r) => (
          <div
            key={r.text}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] ${
              r.ok ? 'bg-white/[0.03] text-gray-300' : 'bg-red-500/10 text-red-300'
            }`}
          >
            {r.ok ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <X className="h-3.5 w-3.5 text-red-400" />
            )}
            {r.text}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-brand-600 py-1.5 text-center text-[11px] font-semibold text-brand-contrast">
        Import 48 valid rows
      </div>
    </Window>
  );
}

function SecurityMock() {
  return (
    <Window title="Data isolation">
      <div className="grid grid-cols-2 gap-2">
        {['Babari Academy', 'Unity College'].map((school) => (
          <div key={school} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <Lock className="h-3.5 w-3.5 text-brand-300" />
            <p className="mt-1.5 text-[11px] font-semibold text-white">{school}</p>
            <p className="text-[10px] text-gray-500">Own students · staff · results</p>
          </div>
        ))}
      </div>
      <div className="my-2 flex items-center gap-2">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] uppercase tracking-wide text-gray-600">isolated</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-2.5 py-2">
        <X className="h-3.5 w-3.5 shrink-0 text-red-400" />
        <code className="truncate text-[11px] text-red-300">
          GET /students · other school → 404
        </code>
      </div>
    </Window>
  );
}

function BrandingMock() {
  const swatches = ['#2563eb', '#16a34a', '#9333ea', '#e11d48', '#ea580c'];
  return (
    <Window title="Appearance">
      <p className="text-[11px] text-gray-500">Brand colour</p>
      <div className="mt-1.5 flex items-center gap-2">
        {swatches.map((c, i) => (
          <span
            key={c}
            className={`h-6 w-6 rounded-full ${i === 2 ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-[11px] text-gray-400">
        <Upload className="h-3.5 w-3.5" />
        Upload school logo
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.03] p-2.5">
        <span className="text-[11px] text-gray-400">Preview</span>
        <span
          className="rounded-md px-3 py-1 text-[11px] font-semibold text-white"
          style={{ backgroundColor: '#9333ea' }}
        >
          Save changes
        </span>
      </div>
      <p className="mt-2 text-[10px] text-gray-500">Applied across admin, staff & student accounts</p>
    </Window>
  );
}

function OnboardingMock() {
  const steps = [
    { label: 'Requested', done: true },
    { label: 'Approved', done: true },
    { label: 'Invited', done: true },
    { label: 'Active', done: false },
  ];
  return (
    <Window title="Onboarding">
      <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
        <p className="text-xs font-semibold text-white">Greenfield Academy</p>
        <Pill tone="amber">Pending review</Pill>
      </div>
      <div className="mt-3 flex items-center">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  s.done ? 'bg-brand-500 text-white' : 'border border-white/20 text-gray-500'
                }`}
              >
                {s.done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={`mt-1 text-[10px] ${s.done ? 'text-gray-300' : 'text-gray-600'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`mx-1 mb-4 h-px flex-1 ${s.done ? 'bg-brand-500/60' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-brand-300" />
          <p className="text-[11px] font-semibold text-white">Set up your school</p>
        </div>
        <code className="mt-1.5 block truncate rounded bg-black/30 px-2 py-1 text-[10px] text-brand-300">
          nlightr.app/?invite=•••••••••••
        </code>
      </div>
    </Window>
  );
}

const MOCKS: Record<string, () => JSX.Element> = {
  students: StudentsMock,
  staff: StaffMock,
  cbt: CbtMock,
  academics: AcademicsMock,
  dataio: DataIoMock,
  security: SecurityMock,
  branding: BrandingMock,
  onboarding: OnboardingMock,
};

export default function FeatureMockup({ id }: { id: string }) {
  const Mock = MOCKS[id];
  return Mock ? <Mock /> : null;
}
