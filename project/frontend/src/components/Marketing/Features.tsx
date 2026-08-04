import { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Building2,
  CalendarRange,
  Check,
  Database,
  GraduationCap,
  LayoutGrid,
  Minus,
  Palette,
  ShieldCheck,
  Sparkles,
  UserSquare2,
  Users,
} from 'lucide-react';
import PublicNav, { PRODUCT_NAME } from './PublicNav';
import type { PublicView } from './PublicNav';
import PublicFooter from './PublicFooter';
import Reveal from './Reveal';
import FeatureMockup from './FeatureMockups';

/*
 * Every claim on this page maps to something actually implemented in the app —
 * the module list mirrors the sidebar, and the detail lines mirror the data
 * model and services described in README.md. Keep it honest: if a capability is
 * removed, remove it here too.
 */

interface Feature {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  intro: string;
  points: string[];
  /** Small labelled facts shown in the visual panel. */
  facts: { label: string; value: string }[];
}

const FEATURES: Feature[] = [
  {
    id: 'students',
    icon: Users,
    eyebrow: 'Student management',
    title: 'Every student, on the record',
    intro:
      'Enrol students, keep rich profiles, and track who is present and who has gone home — all tied to the right class, term and session.',
    points: [
      'Unique admission numbers per school, with class and arm on every profile.',
      'Weekday attendance: one clean record per student per day, never a weekend.',
      'Each attendance row is tagged with its term and session, so per-term reports need no date-range gymnastics.',
      'After-school checkouts log exactly who left and when — one record per student per day.',
      'Optionally link a student to a login so they can sit computer-based exams.',
    ],
    facts: [
      { label: 'Admission no.', value: 'Unique / school' },
      { label: 'Registers', value: 'Weekdays only' },
      { label: 'Records', value: 'Term-tagged' },
      { label: 'Checkouts', value: 'Fully logged' },
    ],
  },
  {
    id: 'staff',
    icon: UserSquare2,
    eyebrow: 'Staff & noticeboard',
    title: 'Your people, clearly organised',
    intro:
      'Manage teachers and staff, decide exactly what each teacher can touch, and keep everyone aligned with a school-wide noticeboard.',
    points: [
      'Staff profiles attached to real login accounts, with descriptive job titles like “Head of Science”.',
      'Job titles are kept separate from security roles — schools can’t invent permission levels, so who-can-do-what stays auditable.',
      'Teacher-to-class assignments are the real boundary: a teacher only sees the classes assigned to them, enforced in the data layer, not just hidden in the UI.',
      'A noticeboard for announcements — assign a notice to turn it into a pending task.',
    ],
    facts: [
      { label: 'Titles', value: 'Descriptive' },
      { label: 'Permissions', value: 'Fixed & audited' },
      { label: 'Teacher scope', value: 'Per class' },
      { label: 'Notices', value: '+ assignments' },
    ],
  },
  {
    id: 'cbt',
    icon: GraduationCap,
    eyebrow: 'Computer-based testing',
    title: 'Exams that grade themselves — and never break',
    intro:
      'A full CBT engine: build question banks, run timed online exams, and get results the moment the clock stops — with timing you can trust.',
    points: [
      'Question banks per subject, with single-answer (radio) or multiple-answer (“select all that apply”) questions, two to eight options each.',
      'Edit and delete questions any time — correctness is frozen onto each student’s answer when they save, so fixing a question never rewrites past results.',
      'Multi-answer questions mark all-or-nothing: every correct option, no incorrect one.',
      'Mathematics and physics formulas render properly, inline and as blocks, without breaking the question.',
      'Every paper is randomised then frozen, so a refresh, a reconnect, or an automatic submission all see the exact same exam.',
      'Timing is server-authoritative: a paused tab or a tampered device clock buys no extra time, and the countdown resyncs automatically.',
      'Answers auto-save every couple of seconds and re-try on a flaky connection — a bad network becomes a delay, not lost work.',
      'Three independent safeguards guarantee an exam always closes on time, and retakes are capped by a per-exam attempt limit.',
      'Answer keys never cross the wire — the paper a student receives simply doesn’t contain which option is correct.',
    ],
    facts: [
      { label: 'Question types', value: 'Single / multiple' },
      { label: 'Options', value: '2 – 8 each' },
      { label: 'Formulas', value: 'Maths & physics' },
      { label: 'Timing', value: 'Server-authoritative' },
    ],
  },
  {
    id: 'academics',
    icon: CalendarRange,
    eyebrow: 'Academic structure',
    title: 'Sessions, terms and subjects — set once',
    intro:
      'Lay down your academic calendar once, and everything else hangs off it correctly.',
    points: [
      'Academic sessions (years) and terms, with exactly one “current” of each enforced by the database — never an ambiguous active term.',
      'Subjects and classrooms (class plus arm), unique within your school.',
      'Attendance and exams automatically inherit the active term and session, so reporting stays consistent.',
    ],
    facts: [
      { label: 'Current term', value: 'One, guaranteed' },
      { label: 'Sessions', value: 'Per academic year' },
      { label: 'Classrooms', value: 'Class + arm' },
      { label: 'Subjects', value: 'Unique / school' },
    ],
  },
  {
    id: 'dataio',
    icon: Database,
    eyebrow: 'Import & export',
    title: 'Bring your data in. Take it out. Anytime.',
    intro:
      'Move records in and out by CSV, with a preview you can trust and errors you can actually act on.',
    points: [
      'Import students, staff, questions, attendance and checkouts from CSV.',
      'Preview before you save — the preview is produced by the very same checks the import relies on, so what you approve is what you get.',
      'One bad row doesn’t sink the file: valid rows import, and invalid ones are reported by line number.',
      'File-level mistakes (missing headers, unknown columns, an empty file) are rejected outright, so nothing is silently dropped.',
      'Re-importing updates existing records instead of duplicating them, keyed on admission number.',
      'Large files are processed in the background, and messy Excel encodings are handled without fuss.',
      'Download a blank template for any dataset, and export mirrors the same shapes — exported questions re-import cleanly.',
    ],
    facts: [
      { label: 'Datasets', value: '5 supported' },
      { label: 'Preview', value: 'Same-as-commit' },
      { label: 'Re-import', value: 'Updates, no dupes' },
      { label: 'Templates', value: 'One per dataset' },
    ],
  },
  {
    id: 'security',
    icon: ShieldCheck,
    eyebrow: 'Security & isolation',
    title: 'One platform. Every school on its own island.',
    intro:
      'Multi-tenant to the core: your school’s data is yours alone, and the separation is built into every layer.',
    points: [
      'One school can never see another’s students, staff, exams or results — full stop.',
      'Isolation is enforced at the model, query, create and serialisation layers, so it isn’t something a single screen can forget.',
      'A request for another school’s record returns “not found”, not “forbidden” — the platform won’t even confirm it exists.',
      'Four clearly-scoped roles — platform admin, school admin, teacher and student — each see only what they should.',
      'Secure token-based sign-in with silent session refresh keeps people logged in without weakening security.',
    ],
    facts: [
      { label: 'Tenancy', value: 'Isolated / school' },
      { label: 'Enforcement', value: '4 layers' },
      { label: 'Roles', value: '4, tightly scoped' },
      { label: 'Auth', value: 'Token + refresh' },
    ],
  },
  {
    id: 'branding',
    icon: Palette,
    eyebrow: 'Branding & appearance',
    title: 'It should feel like your school',
    intro:
      'Make the platform yours — your logo, your colours — carried across every account.',
    points: [
      'Upload your logo and choose your brand colour; the whole app re-themes from that single colour.',
      'Your branding shows up for admins, staff and students alike — they see your school, not our software.',
      'Readable text colours are derived automatically, so even a pale brand colour still looks right.',
    ],
    facts: [
      { label: 'Logo', value: 'Yours' },
      { label: 'Colour', value: 'One → full theme' },
      { label: 'Applies to', value: 'Every account' },
      { label: 'Contrast', value: 'Auto-derived' },
    ],
  },
  {
    id: 'onboarding',
    icon: Building2,
    eyebrow: 'School onboarding',
    title: 'A secure front door for new schools',
    intro:
      'Schools join by invitation, so every account is real and vetted from day one.',
    points: [
      'Request access with a short form, get reviewed, and receive a secure setup link by email.',
      'Setup links are single-use, expiring and revocable — and the raw link is never stored anywhere.',
      'Accepting the link creates your school and your admin account together, and signs you straight in.',
    ],
    facts: [
      { label: 'Signup', value: 'Invite-based' },
      { label: 'Links', value: 'Single-use' },
      { label: 'Expiry', value: 'Time-limited' },
      { label: 'Setup', value: 'Instant login' },
    ],
  },
];

// Who can do what. `true` = yes, false = no, string = a qualified yes.
type Access = boolean | string;
const MATRIX: { capability: string; admin: Access; teacher: Access; student: Access }[] = [
  { capability: 'Enrol & manage students', admin: true, teacher: 'Assigned classes', student: false },
  { capability: 'Mark attendance & checkouts', admin: true, teacher: 'Assigned classes', student: false },
  { capability: 'Manage staff & noticeboard', admin: true, teacher: 'Read', student: false },
  { capability: 'Set up sessions, terms & subjects', admin: true, teacher: false, student: false },
  { capability: 'Build & grade exams', admin: true, teacher: true, student: false },
  { capability: 'Sit exams & see own results', admin: false, teacher: false, student: true },
  { capability: 'Import data', admin: true, teacher: false, student: false },
  { capability: 'Export data', admin: true, teacher: true, student: false },
  { capability: 'Branding & appearance', admin: true, teacher: false, student: false },
];

export default function Features({
  onNavigate,
}: {
  onNavigate: (view: PublicView) => void;
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <PublicNav active="features" onNavigate={onNavigate} />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 pt-28 pb-16 sm:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl animate-blob" />
          <div
            className="absolute -right-10 top-20 h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl animate-blob"
            style={{ animationDelay: '5s' }}
          />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Everything {PRODUCT_NAME} does
          </span>
          <h1
            className="mt-5 animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
            style={{ animationDelay: '80ms' }}
          >
            A close look at every{' '}
            <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-indigo-400 bg-clip-text text-transparent animate-gradient-x">
              feature
            </span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg leading-relaxed text-gray-400"
            style={{ animationDelay: '160ms' }}
          >
            Four focused modules — students, staff, testing and data — built on a
            secure, multi-tenant foundation. Here’s exactly what each one gives you.
          </p>
        </div>

        {/* Quick jump chips */}
        <div className="relative mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2 px-4">
          {FEATURES.map((feature) => (
            <a
              key={feature.id}
              href={`#${feature.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:border-brand-500/40 hover:text-brand-300"
            >
              <feature.icon className="h-4 w-4" />
              {feature.eyebrow}
            </a>
          ))}
        </div>
      </section>

      {/* ---------------- Feature blocks ---------------- */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {FEATURES.map((feature, i) => (
          <FeatureBlock key={feature.id} feature={feature} flip={i % 2 === 1} />
        ))}
      </div>

      {/* ---------------- Roles matrix ---------------- */}
      <section className="bg-gray-900 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
              <LayoutGrid className="h-3.5 w-3.5" />
              Roles at a glance
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everyone sees exactly what they should
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Access isn’t a suggestion in the interface — it’s enforced on the
              server for every request.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-gray-950 shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-5 py-4 font-semibold text-white">Capability</th>
                    <th className="px-5 py-4 text-center font-semibold text-white">
                      School admin
                    </th>
                    <th className="px-5 py-4 text-center font-semibold text-white">
                      Teacher
                    </th>
                    <th className="px-5 py-4 text-center font-semibold text-white">
                      Student
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {MATRIX.map((row) => (
                    <tr key={row.capability} className="hover:bg-white/5">
                      <td className="px-5 py-4 font-medium text-gray-300">
                        {row.capability}
                      </td>
                      <AccessCell value={row.admin} />
                      <AccessCell value={row.teacher} />
                      <AccessCell value={row.student} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <p className="mt-4 text-center text-xs text-gray-500">
            Platform administrators operate above individual schools and manage
            onboarding across the whole system.
          </p>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden bg-brand-600 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob" />
        </div>
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-brand-contrast sm:text-4xl">
            See it running in your school
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-contrast/80">
            Register your school and put every one of these features to work.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate('request')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-brand-700 shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Register your school
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-base font-semibold text-brand-contrast transition-colors hover:bg-white/10"
            >
              Sign in
            </button>
          </div>
        </Reveal>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}

function FeatureBlock({ feature, flip }: { feature: Feature; flip: boolean }) {
  const Icon = feature.icon;
  return (
    <section id={feature.id} className="scroll-mt-24 border-b border-white/10 py-16 last:border-0">
      <Reveal>
        <div
          className={`grid items-center gap-10 lg:grid-cols-2 ${
            flip ? 'lg:[&>*:first-child]:order-2' : ''
          }`}
        >
          {/* Text */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-300">
              <Icon className="h-3.5 w-3.5" />
              {feature.eyebrow}
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {feature.title}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-gray-400">{feature.intro}</p>
            <ul className="mt-6 space-y-3">
              {feature.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm leading-relaxed text-gray-400">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual: a hand-built UI mockup of the actual screen, with a soft
              brand glow behind it and the key facts as a caption row below. */}
          <div className="relative">
            <div className="absolute inset-0 -z-10 translate-x-4 translate-y-6 rounded-2xl bg-brand-600/20 blur-2xl" />
            <FeatureMockup id={feature.id} />
            <dl className="mt-4 flex flex-wrap gap-2">
              {feature.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1"
                >
                  <dt className="text-[11px] text-gray-500">{fact.label}</dt>
                  <dd className="text-[11px] font-semibold text-gray-200">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function AccessCell({ value }: { value: Access }) {
  if (value === true) {
    return (
      <td className="px-5 py-4 text-center">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500/15 text-green-400">
          <Check className="h-4 w-4" />
        </span>
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-5 py-4 text-center">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-gray-500">
          <Minus className="h-4 w-4" />
        </span>
      </td>
    );
  }
  return (
    <td className="px-5 py-4 text-center">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
        <Check className="h-3 w-3" />
        {value}
      </span>
    </td>
  );
}
