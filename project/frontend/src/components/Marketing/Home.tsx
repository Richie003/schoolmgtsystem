import { useEffect } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Database,
  MonitorCheck,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import PublicNav, { PRODUCT_NAME } from './PublicNav';
import type { PublicView } from './PublicNav';
import PublicFooter from './PublicFooter';
import Reveal from './Reveal';

const FEATURES = [
  {
    icon: Users,
    title: 'Student management',
    body: 'Enrolment, rich profiles and weekday attendance — with secure, logged checkouts so you always know who left and when.',
  },
  {
    icon: CalendarCheck,
    title: 'Staff & noticeboard',
    body: 'Manage teachers and staff, assign roles, and keep everyone aligned with a school-wide noticeboard.',
  },
  {
    icon: MonitorCheck,
    title: 'Computer-based testing',
    body: 'Timed online exams that auto-submit and auto-grade — and render mathematics and physics formulas without breaking them.',
  },
  {
    icon: Database,
    title: 'Import & export',
    body: 'Bring your existing records in from CSV and take your data out whenever you want. It is your data, always.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolated & secure',
    body: 'Every school lives in its own space. One school can never see another’s students, staff or results — enforced at every layer.',
  },
  {
    icon: Palette,
    title: 'Your brand',
    body: 'Your logo and your colours flow across every admin, staff and student account, so it feels like your school, not our software.',
  },
];

const STATS = [
  { value: '4', label: 'Core modules, one login' },
  { value: '100%', label: 'Per-school data isolation' },
  { value: '<10min', label: 'From invite to running' },
  { value: '24/7', label: 'Access from any device' },
];

const STEPS = [
  {
    title: 'Request access',
    body: 'Tell us about your school in a short form. It takes a minute and commits you to nothing.',
  },
  {
    title: 'Get your invite',
    body: 'We review your request and email a secure, single-use link to set up your school.',
  },
  {
    title: 'Run your school',
    body: 'Create your admin account, then add students, staff and exams — you are live the same day.',
  },
];

export default function Home({
  onNavigate,
}: {
  onNavigate: (view: PublicView) => void;
}) {
  // Each public "page" is a view swap, not a real navigation, so reset scroll.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <PublicNav active="home" onNavigate={onNavigate} />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 pt-28 pb-20 sm:pt-36">
        {/* Decorative animated blobs — purely cosmetic, hidden from AT. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl animate-blob" />
          <div
            className="absolute right-0 top-24 h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl animate-blob"
            style={{ animationDelay: '4s' }}
          />
          <div
            className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl animate-blob"
            style={{ animationDelay: '8s' }}
          />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              The school operating system
            </span>

            <h1
              className="mt-5 animate-fade-up text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '80ms' }}
            >
              Run your whole school from{' '}
              <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-indigo-400 bg-clip-text text-transparent animate-gradient-x">
                one place
              </span>
            </h1>

            <p
              className="mt-5 max-w-xl animate-fade-up text-lg leading-relaxed text-gray-400"
              style={{ animationDelay: '160ms' }}
            >
              {PRODUCT_NAME} brings students, staff, attendance and computer-based
              testing together in a single, secure platform — built for the way
              African schools actually work.
            </p>

            <div
              className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row"
              style={{ animationDelay: '240ms' }}
            >
              <button
                type="button"
                onClick={() => onNavigate('request')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-brand-contrast shadow-lg shadow-brand-900/40 transition-transform hover:-translate-y-0.5 hover:bg-brand-500"
              >
                Register your school
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-gray-100 transition-colors hover:bg-white/10"
              >
                Sign in
              </button>
            </div>

            <p
              className="mt-4 animate-fade-up text-sm text-gray-500"
              style={{ animationDelay: '320ms' }}
            >
              No card required. Approved schools are set up in minutes.
            </p>
          </div>

          {/* Floating dashboard mock — gives the hero depth without a real image. */}
          <div className="relative animate-fade-in" style={{ animationDelay: '200ms' }}>
            <div className="animate-float rounded-2xl border border-white/10 bg-gray-900 p-5 shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-red-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <span className="text-xs font-medium text-gray-500">Today</span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <MockTile label="Present" value="482" tone="brand" />
                <MockTile label="Checked out" value="17" tone="amber" />
                <MockTile label="Exams live" value="3" tone="indigo" />
              </div>

              <div className="mt-5 rounded-xl bg-white/5 p-4">
                <div className="mb-3 flex items-end justify-between">
                  <span className="text-xs font-medium text-gray-400">
                    Attendance this week
                  </span>
                  <span className="text-xs font-semibold text-brand-400">96%</span>
                </div>
                <div className="flex h-24 items-end gap-2">
                  {[62, 78, 70, 90, 84].map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400"
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-[10px] text-gray-500">
                        {['M', 'T', 'W', 'T', 'F'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Small floating accent card */}
            <div
              className="absolute -bottom-5 -left-5 hidden animate-float items-center gap-2 rounded-xl border border-white/10 bg-gray-900 px-4 py-3 shadow-xl shadow-black/50 sm:flex"
              style={{ animationDelay: '1.5s' }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/15">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </span>
              <div>
                <p className="text-xs font-semibold text-white">Exam graded</p>
                <p className="text-[11px] text-gray-500">Auto-submitted · 40/40</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Stats band ---------------- */}
      <section className="border-y border-white/10 bg-gray-950">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 sm:px-6 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 80} className="text-center">
              <p className="text-3xl font-extrabold text-brand-400 sm:text-4xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-gray-400">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything a school needs. Nothing it doesn’t.
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Four focused modules that work together — instead of ten you’ll never
            switch on.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 90}>
              <div className="group h-full rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-lg hover:shadow-black/40">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 transition-colors group-hover:bg-brand-600 group-hover:text-brand-contrast">
                  <feature.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12 text-center">
          <button
            type="button"
            onClick={() => onNavigate('features')}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-6 py-3 text-base font-semibold text-brand-300 transition-colors hover:bg-brand-500/20"
          >
            Explore every feature in detail
            <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section className="bg-gray-900 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              We invite schools deliberately, so every account is real and secure
              from day one.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 120}>
                <div className="relative h-full rounded-2xl border border-white/10 bg-gray-950 p-6 shadow-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-brand-contrast">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="relative overflow-hidden bg-brand-600 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob" />
          <div
            className="absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-black/20 blur-3xl animate-blob"
            style={{ animationDelay: '6s' }}
          />
        </div>
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-brand-contrast sm:text-4xl">
            Ready to bring your school online?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-contrast/80">
            Join the schools running students, staff and exams on {PRODUCT_NAME}.
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

function MockTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'amber' | 'indigo';
}) {
  const tones = {
    brand: 'bg-brand-500/15 text-brand-300',
    amber: 'bg-amber-500/15 text-amber-300',
    indigo: 'bg-indigo-500/15 text-indigo-300',
  }[tone];
  return (
    <div className={`rounded-xl p-3 ${tones}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] font-medium opacity-80">{label}</p>
    </div>
  );
}
