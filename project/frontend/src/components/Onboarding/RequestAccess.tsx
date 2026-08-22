import type { FormEvent } from 'react';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { errorMessage, onboardingAPI } from '../../services/api';
import { useColorMode } from '../../context/ColorModeContext';
import { Alert, Button, inputClassLg } from '../UI/Primitives';
import ThemeToggle from '../UI/ThemeToggle';

/**
 * Public "request access" form (onboarding shape #2).
 *
 * Presented one field at a time. A packed single page reads as a chore to a
 * school that's only saying hello, so each question gets its own step with a
 * progress bar; finishing one moves to the next, and Back revisits anything
 * already answered. Submitting still only creates a lead for a platform admin to
 * review — it grants nothing and reveals nothing, so the success message is
 * deliberately the same whatever was entered.
 */

type FormKey = 'school_name' | 'contact_name' | 'contact_email' | 'contact_phone' | 'message';

interface Step {
  key: FormKey;
  label: string;
  required: boolean;
  type?: string;
  placeholder?: string;
  help?: string;
  multiline?: boolean;
}

// One question per step, in the order a school would naturally introduce itself.
const STEPS: Step[] = [
  {
    key: 'school_name',
    label: 'What’s the name of your school?',
    required: true,
    placeholder: 'e.g. Greenfield Academy',
  },
  {
    key: 'contact_name',
    label: 'And who are we speaking with?',
    required: true,
    placeholder: 'Your full name',
  },
  {
    key: 'contact_email',
    label: 'What email should we reach you on?',
    required: true,
    type: 'email',
    placeholder: 'you@yourschool.edu',
    help: 'If your request is approved, your setup link will arrive here.',
  },
  {
    key: 'contact_phone',
    label: 'A phone number we can reach you on?',
    required: false,
    type: 'tel',
    placeholder: 'e.g. 080 1234 5678',
    help: 'Optional. We’ll only use it if we can’t reach you by email.',
  },
  {
    key: 'message',
    label: 'Anything you’d like us to know?',
    required: false,
    multiline: true,
    placeholder: 'Number of students, how you heard about us… (optional)',
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RequestAccess({
  onBack,
  onHome,
}: {
  onBack: () => void;
  onHome?: () => void;
}) {
  const [form, setForm] = useState({
    school_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    message: '',
  });
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const total = STEPS.length;
  const step = STEPS[index];
  const isLast = index === total - 1;
  const value = form[step.key];

  // Whether the current step is allowed to advance.
  const valid = !step.required
    ? true
    : step.key === 'contact_email'
      ? EMAIL_RE.test(value.trim())
      : value.trim().length > 0;

  const setValue = (v: string) => setForm((f) => ({ ...f, [step.key]: v }));

  const submitRequest = async () => {
    setSubmitting(true);
    setError('');
    try {
      await onboardingAPI.requestAccess(form);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'Could not submit your request. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Continue button or Enter: validate the current field, then advance or send.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || submitting) return;
    setError('');
    if (isLast) submitRequest();
    else setIndex((i) => i + 1);
  };

  const goBack = () => {
    setError('');
    if (index === 0) onBack();
    else setIndex((i) => i - 1);
  };

  if (done) {
    return (
      <Shell onHome={onHome}>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Request received</h2>
          <p className="mt-2 text-sm text-gray-600">
            Thank you. Your request is under review. If it’s approved, you’ll
            receive an email with a link to set up your school.
          </p>
          <Button variant="secondary" onClick={onBack} className="mt-6">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onHome={onHome}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Progress: how far along the school is to finishing. */}
        <div>
          <div className="mb-2 flex justify-end">
            <span className="text-xs font-semibold tabular-nums text-gray-500">
              Step {index + 1} of {total}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-300 ease-out"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

        {/* The single field for this step. Keyed by index so it remounts and
            autofocuses each time, and gets a gentle fade on the way in. */}
        <div key={index} className="animate-fade-up">
          <label htmlFor="step-field" className="block text-lg font-semibold text-gray-900">
            {step.label}
            {!step.required && (
              <span className="ml-2 text-sm font-normal text-gray-400">(optional)</span>
            )}
          </label>

          {step.multiline ? (
            <textarea
              id="step-field"
              className={`${inputClassLg} mt-4`}
              rows={4}
              placeholder={step.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              id="step-field"
              type={step.type ?? 'text'}
              className={`${inputClassLg} mt-4`}
              placeholder={step.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required={step.required}
            />
          )}

          {step.help && <span className="mt-2 block text-xs text-gray-500">{step.help}</span>}
        </div>

        <p className="text-xs text-gray-400">
          Requests are reviewed by our team. This does not create an account.
        </p>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={goBack}
            disabled={index === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button type="submit" loading={submitting} disabled={!valid}>
            {isLast ? (
              'Request access'
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({
  children,
  onHome,
}: {
  children: React.ReactNode;
  onHome?: () => void;
}) {
  const { isDark } = useColorMode();
  return (
    <div
      className={`relative flex min-h-screen items-center justify-center px-4 py-10 ${
        isDark ? 'dark bg-gray-950' : 'bg-gray-50'
      }`}
    >
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-lg">
        {onHome && (
          <button
            type="button"
            onClick={onHome}
            className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </button>
        )}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Register your school</h1>
          <p className="mt-1 text-sm text-gray-500">
            A few quick questions and we’ll take it from there.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
