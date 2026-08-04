import React, { useState } from 'react';
import { ArrowLeft, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useColorMode } from '../../context/ColorModeContext';
import { Alert, Button, Field, inputClass } from '../UI/Primitives';
import ThemeToggle from '../UI/ThemeToggle';

export default function Login({
  onRequestAccess,
  onHome,
}: {
  onRequestAccess?: () => void;
  onHome?: () => void;
}) {
  const { login, isLoading } = useAuth();
  const { isDark } = useColorMode();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div
      className={`relative flex min-h-screen items-center justify-center px-4 ${
        isDark ? 'dark bg-gray-950' : 'bg-gray-50'
      }`}
    >
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-md">
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
          <h1 className="mt-4 text-2xl font-bold text-gray-900">School Management</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your school account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl bg-white p-8 shadow-sm"
        >
          {error && <Alert onDismiss={() => setError('')}>{error}</Alert>}

          <Field label="Username" required>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Password" required>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-10`}
                autoComplete="current-password"
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

          <Button type="submit" loading={isLoading} className="w-full">
            Sign in
          </Button>

          <p className="text-center text-xs text-gray-400">
            Accounts are created by your school administrator.
          </p>

          {onRequestAccess && (
            <div className="border-t border-gray-100 pt-4 text-center">
              <p className="text-sm text-gray-500">
                New school?{' '}
                <button
                  type="button"
                  onClick={onRequestAccess}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Register your school
                </button>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
