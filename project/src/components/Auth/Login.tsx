import React, { useState } from 'react';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Alert, Button, Field, inputClass } from '../UI/Primitives';

export default function Login() {
  const { login, isLoading } = useAuth();
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
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
        </form>
      </div>
    </div>
  );
}
