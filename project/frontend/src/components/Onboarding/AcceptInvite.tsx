import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Eye, EyeOff, Upload, X } from 'lucide-react';
import { errorMessage, onboardingAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useColorMode } from '../../context/ColorModeContext';
import type { InvitationPublic } from '../../types';
import { Alert, Button, Spinner, inputClassLg } from '../UI/Primitives';
import ThemeToggle from '../UI/ThemeToggle';

/**
 * Accept-invite page: validates the token, then lets the recipient create their
 * school's admin account. Presented one field at a time with a progress bar so
 * setting up never feels like a wall of inputs — finishing a step moves to the
 * next, and Back revisits anything already entered. On success it adopts the
 * returned session, so they land straight in the app with no separate login.
 */

type FieldKey = 'school_name' | 'first_name' | 'last_name' | 'username' | 'password';

interface Step {
  key: FieldKey | 'logo';
  kind: 'text' | 'password' | 'logo';
  label: string;
  required: boolean;
  type?: string;
  placeholder?: string;
  help?: string;
  autoComplete?: string;
}

const STEPS: Step[] = [
  {
    key: 'school_name',
    kind: 'text',
    label: 'Confirm your school’s name',
    required: true,
    help: 'This is how your school appears across the app. Adjust it if you like.',
  },
  {
    key: 'logo',
    kind: 'logo',
    label: 'Add your school logo',
    required: false,
  },
  {
    key: 'first_name',
    kind: 'text',
    label: 'What’s your first name?',
    required: true,
    autoComplete: 'given-name',
  },
  {
    key: 'last_name',
    kind: 'text',
    label: 'And your last name?',
    required: true,
    autoComplete: 'family-name',
  },
  {
    key: 'username',
    kind: 'text',
    label: 'Choose a username',
    required: true,
    autoComplete: 'username',
    help: 'You’ll sign in with this.',
  },
  {
    key: 'password',
    kind: 'password',
    label: 'Set a password',
    required: true,
    autoComplete: 'new-password',
    help: 'Pick something strong you’ll remember.',
  },
];

export default function AcceptInvite({
  token,
  onDone,
  onInvalid,
}: {
  token: string;
  onDone: () => void;
  onInvalid: () => void;
}) {
  const { adoptSession } = useAuth();

  const [invite, setInvite] = useState<InvitationPublic | null>(null);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState('');

  const [form, setForm] = useState({
    school_name: '',
    first_name: '',
    last_name: '',
    username: '',
    password: '',
  });
  const [index, setIndex] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Optional logo the school can set during setup.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState('');

  // Revoke the object URL when it changes or the form unmounts, so previews
  // don't leak memory.
  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const onLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setLogoError('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo must be smaller than 2 MB.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError('');
  };

  useEffect(() => {
    let cancelled = false;
    onboardingAPI
      .validateInvite(token)
      .then(({ data }) => {
        if (cancelled) return;
        setInvite(data);
        setForm((f) => ({ ...f, school_name: data.school_name }));
      })
      .catch(() => {
        if (!cancelled) {
          setInvalid('This invitation link is invalid, already used, or expired.');
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const total = STEPS.length;
  const step = STEPS[index];
  const isLast = index === total - 1;

  // Whether the current step may advance.
  const valid = !step.required
    ? true
    : step.kind === 'password'
      ? form.password.length > 0
      : String(form[step.key as FieldKey]).trim().length > 0;

  const setValue = (key: FieldKey, v: string) => setForm((f) => ({ ...f, [key]: v }));

  const submitRequest = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await onboardingAPI.acceptInvite(token, form, logoFile);
      adoptSession(data.access, data.refresh, data.user);
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not complete signup. Please try again.'));
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
    setIndex((i) => Math.max(0, i - 1));
  };

  if (checking) {
    return (
      <Shell subtitle="Checking your invitation…">
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      </Shell>
    );
  }

  if (invalid || !invite) {
    return (
      <Shell subtitle="Invitation problem">
        <div className="text-center">
          <Alert>{invalid || 'This invitation could not be loaded.'}</Alert>
          <Button variant="secondary" onClick={onInvalid} className="mt-6">
            Go to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell subtitle={`Set up ${invite.school_name}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          Invited as <strong>{invite.email}</strong>. Let’s create your
          administrator account.
        </div>

        {/* Progress: how far along setup is. */}
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
            autofocuses each time, with a gentle fade on the way in. */}
        <div key={index} className="animate-fade-up">
          <label htmlFor="step-field" className="block text-lg font-semibold text-gray-900">
            {step.label}
            {!step.required && (
              <span className="ml-2 text-sm font-normal text-gray-400">(optional)</span>
            )}
          </label>

          {step.kind === 'logo' ? (
            <LogoField
              logoFile={logoFile}
              logoPreview={logoPreview}
              logoError={logoError}
              onChange={onLogoChange}
              onRemove={removeLogo}
            />
          ) : step.kind === 'password' ? (
            <div className="relative mt-4">
              <input
                id="step-field"
                type={showPassword ? 'text' : 'password'}
                className={`${inputClassLg} pr-10`}
                value={form.password}
                onChange={(e) => setValue('password', e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <input
              id="step-field"
              type={step.type ?? 'text'}
              className={`${inputClassLg} mt-4`}
              placeholder={step.placeholder}
              value={form[step.key as FieldKey]}
              onChange={(e) => setValue(step.key as FieldKey, e.target.value)}
              autoComplete={step.autoComplete}
              autoFocus
              required={step.required}
            />
          )}

          {step.help && <span className="mt-2 block text-xs text-gray-500">{step.help}</span>}
        </div>

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
              'Create my school'
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

function LogoField({
  logoFile,
  logoPreview,
  logoError,
  onChange,
  onRemove,
}: {
  logoFile: File | null;
  logoPreview: string | null;
  logoError: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-4">
      {logoPreview ? (
        <div className="flex items-center gap-4 rounded-xl border border-gray-300 bg-white p-3">
          <img
            src={logoPreview}
            alt="Logo preview"
            className="h-16 w-16 rounded-lg object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-700">{logoFile?.name}</p>
            <p className="text-xs text-gray-500">Looks great. This is your logo.</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50">
          <Upload className="h-6 w-6 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Click to upload your logo</span>
          <span className="text-xs text-gray-400">PNG, JPG or SVG · up to 2 MB</span>
          <input type="file" accept="image/*" onChange={onChange} className="hidden" />
        </label>
      )}
      {logoError && <span className="mt-2 block text-xs text-red-600">{logoError}</span>}
      <span className="mt-2 block text-xs text-gray-500">
        No logo handy? Skip this and add it later in Appearance settings.
      </span>
    </div>
  );
}

function Shell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
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
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Welcome aboard</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
