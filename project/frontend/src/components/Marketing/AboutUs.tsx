import { useEffect } from 'react';
import {
  ArrowRight,
  Compass,
  HeartHandshake,
  Lock,
  Rocket,
  Target,
} from 'lucide-react';
import PublicNav, { PRODUCT_NAME } from './PublicNav';
import type { PublicView } from './PublicNav';
import PublicFooter from './PublicFooter';
import Reveal from './Reveal';

const VALUES = [
  {
    icon: Lock,
    title: 'Trust by design',
    body: 'Schools hold sensitive data about children. For us, isolation and security aren’t features we bolt on later. They’re the foundation everything else is built on.',
  },
  {
    icon: Compass,
    title: 'Built for reality',
    body: 'Patchy power, shared devices, uneven bandwidth. We design for the conditions our schools actually work in, not an idealised classroom.',
  },
  {
    icon: HeartHandshake,
    title: 'Focused, not bloated',
    body: 'We would rather do four things brilliantly than forty things poorly. Every module earns its place.',
  },
  {
    icon: Rocket,
    title: 'Schools first',
    body: 'Teachers and administrators guide what we build. If it does not save real time in a real school, it does not ship.',
  },
];

export default function AboutUs({
  onNavigate,
}: {
  onNavigate: (view: PublicView) => void;
}) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <PublicNav active="about" onNavigate={onNavigate} />

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 pt-28 pb-20 sm:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 top-8 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl animate-blob" />
          <div
            className="absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl animate-blob"
            style={{ animationDelay: '5s' }}
          />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300 backdrop-blur">
            <Target className="h-3.5 w-3.5" />
            About {PRODUCT_NAME}
          </span>
          <h1
            className="mt-5 animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
            style={{ animationDelay: '80ms' }}
          >
            Software that gives schools their{' '}
            <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-indigo-400 bg-clip-text text-transparent animate-gradient-x">
              time back
            </span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl animate-fade-up text-lg leading-relaxed text-gray-400"
            style={{ animationDelay: '160ms' }}
          >
            {PRODUCT_NAME} exists so that running a school takes less paperwork and
            more teaching. We build the quietly reliable system underneath it all,
            so educators can get on with educating.
          </p>
        </div>
      </section>

      {/* ---------------- Mission ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Our mission
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-gray-400">
              Too many schools still run on paper registers, scattered
              spreadsheets and exam scripts marked late into the night. The cost
              isn’t just time. It’s attention that should belong to students.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-gray-400">
              We set out to replace that with one calm, dependable platform: a
              single place to enrol students, take attendance, manage staff and
              run computer-based tests. It’s secure by default and simple enough
              to use on your very first day.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="grid grid-cols-2 gap-4">
              <StatCard value="1" label="Platform, every core task" />
              <StatCard value="4" label="Modules that fit together" />
              <StatCard value="100%" label="Isolation between schools" />
              <StatCard value="0" label="Paper registers required" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Story ---------------- */}
      <section className="bg-gray-900 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why we built it
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-8 space-y-5 text-lg leading-relaxed text-gray-400">
              <p>
                {PRODUCT_NAME} began with a simple observation: the tools sold to
                schools were either enormous, expensive suites built for somewhere
                else, or a drawer full of disconnected apps that never talked to
                each other.
              </p>
              <p>
                Neither really fit the schools around us. So we started narrow and
                deep, getting attendance, checkouts, staff and testing right, and
                made sure each school’s data stayed completely its own. No noisy
                extras, no data leaking between schools, no month-long onboarding.
              </p>
              <p>
                That focus is still our compass. Every new capability has to earn
                its place by saving a real administrator or teacher real time.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Values ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            What we stand for
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Four principles that guide what we build, and what we happily leave
            out.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {VALUES.map((value, i) => (
            <Reveal key={value.title} delay={(i % 2) * 100}>
              <div className="flex h-full gap-4 rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">
                  <value.icon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    {value.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative overflow-hidden bg-brand-600 py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 -top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-blob" />
        </div>
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-brand-contrast sm:text-4xl">
            Let’s get your school set up
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-contrast/80">
            Tell us about your school and we’ll take it from there.
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
              onClick={() => onNavigate('home')}
              className="inline-flex items-center justify-center rounded-xl border border-white/40 px-6 py-3 text-base font-semibold text-brand-contrast transition-colors hover:bg-white/10"
            >
              Back to home
            </button>
          </div>
        </Reveal>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-sm">
      <p className="text-3xl font-extrabold text-brand-400">{value}</p>
      <p className="mt-1 text-sm text-gray-400">{label}</p>
    </div>
  );
}
