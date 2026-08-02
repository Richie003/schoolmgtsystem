import type { FormEvent } from 'react';
import { useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2 } from 'lucide-react';
import { errorMessage, onboardingAPI } from '../../services/api';
import { Alert, Button, Field, inputClass } from '../UI/Primitives';

/**
 * Public "request access" form (onboarding shape #2).
 *
 * Submitting creates only a lead for a platform admin to review — it grants
 * nothing and reveals nothing, so the success message is deliberately the same
 * whatever was entered.
 */
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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

  if (done) {
    return (
      <Shell onHome={onHome}>
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Request received</h2>
          <p className="mt-2 text-sm text-gray-600">
            Thank you. Your request is under review. If it is approved, you will
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
      <form onSubmit={submit} className="space-y-5 rounded-xl bg-white p-8 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>

        {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

        <Field label="School name" required>
          <input
            className={inputClass}
            value={form.school_name}
            onChange={(e) => setForm({ ...form, school_name: e.target.value })}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <input
              className={inputClass}
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              required
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </Field>
        </div>

        <Field label="School email" required>
          <input
            type="email"
            className={inputClass}
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            required
          />
          <span className="mt-1 block text-xs text-gray-500">
            The setup link will be sent here if your request is approved.
          </span>
        </Field>

        <Field label="Anything else? (optional)">
          <textarea
            className={inputClass}
            rows={3}
            placeholder="Number of students, how you heard about us…"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </Field>

        <Button type="submit" loading={submitting} className="w-full">
          Request access
        </Button>

        <p className="text-center text-xs text-gray-400">
          Requests are reviewed by our team. This does not create an account.
        </p>
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
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
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
            Tell us about your school to request access.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
