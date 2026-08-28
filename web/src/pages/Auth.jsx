import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

import { LogoLockup } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';

export default function Auth({ onSuccess, onBack, theme = 'dark' }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim());
      onSuccess(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex min-h-screen items-center justify-center p-6"
    >
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="glass-strong rounded-4xl p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <LogoLockup theme={theme} width={132} className="mb-5" />
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {mode === 'signin'
                ? 'Pick up where your money left off.'
                : 'A copilot that understands variable income.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Your name" autoComplete="name"
                className="glass w-full rounded-2xl px-4 py-3.5 text-sm focus:outline-none"
              />
            )}
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required
              className="glass w-full rounded-2xl px-4 py-3.5 text-sm focus:outline-none"
            />
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" required minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="glass w-full rounded-2xl px-4 py-3.5 text-sm focus:outline-none"
            />

            {error && (
              <div className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-500">{error}</div>
            )}

            <button
              type="submit" disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>


          <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
            {mode === 'signin' ? "Don't have an account? " : 'Already registered? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
              className="font-medium text-[var(--foreground)] underline underline-offset-4"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  );
}
