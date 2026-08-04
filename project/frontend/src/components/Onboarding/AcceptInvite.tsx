import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { BookOpen, Eye, EyeOff, Upload, X } from 'lucide-react';
import { errorMessage, onboardingAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useColorMode } from '../../context/ColorModeContext';
import type { InvitationPublic } from '../../types';
import { Alert, Button, Field, Spinner, inputClassLg } from '../UI/Primitives';
import ThemeToggle from '../UI/ThemeToggle';

/**
 * Accept-invite page: validates the token, then lets the recipient create their
 * school's admin account. On success it adopts the returned session, so they
 * land straight in the app — no separate login.
 */
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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

  if (checking) {
    return (
      <Shell subtitle="Checking your invitation…">
        <div className="flex justify-center rounded-xl bg-white p-10 shadow-sm">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      </Shell>
    );
  }

  if (invalid || !invite) {
    return (
      <Shell subtitle="Invitation problem">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
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
      <form onSubmit={submit} className="space-y-6 rounded-2xl bg-white p-8 shadow-sm">
        {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

        <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Invited as <strong>{invite.email}</strong>. Create your administrator
          account below.
        </div>

        <Field label="School name" required>
          <input
            className={inputClassLg}
            value={form.school_name}
            onChange={(e) => setForm({ ...form, school_name: e.target.value })}
            required
          />
        </Field>

        <Field label="School logo (optional)" error={logoError}>
          {logoPreview ? (
            <div className="flex items-center gap-4 rounded-xl border border-gray-300 bg-white p-3">
              <img
                src={logoPreview}
                alt="Logo preview"
                className="h-16 w-16 rounded-lg object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-700">
                  {logoFile?.name}
                </p>
                <p className="text-xs text-gray-500">Looks good — this is your logo.</p>
              </div>
              <button
                type="button"
                onClick={removeLogo}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
                Remove
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50">
              <Upload className="h-6 w-6 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                Click to upload your logo
              </span>
              <span className="text-xs text-gray-400">PNG, JPG or SVG · up to 2 MB</span>
              <input
                type="file"
                accept="image/*"
                onChange={onLogoChange}
                className="hidden"
              />
            </label>
          )}
          <span className="mt-1 block text-xs text-gray-500">
            You can always add or change this later in Appearance settings.
          </span>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" required>
            <input
              className={inputClassLg}
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
            />
          </Field>
          <Field label="Last name" required>
            <input
              className={inputClassLg}
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              required
            />
          </Field>
        </div>

        <Field label="Username" required>
          <input
            className={inputClassLg}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            required
          />
          <span className="mt-1 block text-xs text-gray-500">
            You will sign in with this.
          </span>
        </Field>

        <Field label="Password" required>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className={`${inputClassLg} pr-10`}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
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
        </Field>

        <Button type="submit" loading={submitting} size="lg" className="w-full">
          Create my school
        </Button>
      </form>
    </Shell>
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
