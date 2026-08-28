import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ChevronDown, ChevronUp, Loader2, MessageSquare, Shield, TrendingUp, Wallet,
} from 'lucide-react';
import clsx from 'clsx';

import { api } from '../api/client';
import { LogoLockup } from '../components/Logo';

const INCOME_TYPES = [
  { id: 'variable', label: 'Irregular / gig', hint: 'Freelance, delivery, commissions — amounts and timing both vary.' },
  { id: 'mixed', label: 'Mixed', hint: 'A base amount plus variable top-ups.' },
  { id: 'salaried', label: 'Steady salary', hint: 'Roughly the same amount on roughly the same date.' },
];

const OBJECTIVES = [
  { id: 'buffer', label: 'Safety buffer', hint: 'Never run out of cash' },
  { id: 'obligations', label: 'Bills & obligations', hint: 'Rent and subscriptions always covered' },
  { id: 'goals', label: 'Savings goals', hint: 'Building toward something' },
  { id: 'investing', label: 'Investing', hint: 'Growing what is spare' },
  { id: 'discretionary', label: 'Discretionary spending', hint: 'Room to enjoy things' },
];

const STEPS = ['Income shape', 'Risk', 'Priorities', 'Buffer floor', 'Sources'];

export default function Onboarding({ onComplete, theme = 'dark' }) {
  const [step, setStep] = useState(0);
  const [incomeType, setIncomeType] = useState('variable');
  const [risk, setRisk] = useState(40);
  const [priorities, setPriorities] = useState(OBJECTIVES.map((o) => o.id));
  const [floor, setFloor] = useState(10000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function move(index, delta) {
    const next = [...priorities];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPriorities(next);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({
        income_type: incomeType,
        risk_tolerance: risk,
        priorities,
        buffer_floor: Number(floor),
        onboarded: true,
      });
      await api.tick(false);
      onComplete();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const last = step === STEPS.length - 1;

  return (
    <div className="w-full max-w-lg p-6">
      <div className="mb-8 flex flex-col items-center">
        <LogoLockup theme={theme} width={120} className="mb-6" />
        <div className="flex w-full gap-1.5">
          {STEPS.map((label, index) => (
            <div key={label} className="flex-1">
              <div
                className={clsx(
                  'h-1 rounded-full transition-colors',
                  index <= step ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]',
                )}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </div>

      <div className="glass-strong rounded-4xl p-8">
        <AnimatePresence mode="wait">
          {/* ── 1. income shape ─────────────────────────────────────────── */}
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">How does money arrive?</h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                This decides whether we model your income as a number or a range.
              </p>
              <div className="space-y-2">
                {INCOME_TYPES.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setIncomeType(option.id)}
                    className={clsx(
                      'w-full rounded-2xl border p-4 text-left transition-colors',
                      incomeType === option.id
                        ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--accent)]',
                    )}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-0.5 text-xs opacity-70">{option.hint}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 2. risk ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">How cautious should I be?</h2>
              <p className="mb-8 text-sm text-[var(--muted-foreground)]">
                When protecting your buffer and chasing growth conflict, this breaks the tie.
              </p>
              <div className="mb-3 text-center font-display text-5xl font-bold tracking-tighter">{risk}</div>
              <input
                type="range" min="0" max="100" value={risk}
                onChange={(e) => setRisk(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--secondary)] accent-[var(--primary)]"
              />
              <div className="mt-2 flex justify-between text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                <span>Protect me</span>
                <span>Grow it</span>
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[var(--secondary)]/50 p-4">
                <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />
                <p className="text-xs text-[var(--muted-foreground)]">
                  {risk < 35
                    ? 'The agent will defend your buffer hard and rarely suggest deploying spare cash.'
                    : risk > 70
                      ? 'The agent will surface investing opportunities even when the buffer is only just covered.'
                      : 'A balanced posture — the agent weighs safety and growth roughly evenly.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* ── 3. priorities ───────────────────────────────────────────── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">What matters most?</h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                Order these. It is literally the waterfall the agent walks when goals compete.
              </p>
              <div className="space-y-2">
                {priorities.map((id, index) => {
                  const objective = OBJECTIVES.find((o) => o.id === id);
                  return (
                    <div key={id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/50 px-4 py-3">
                      <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-[var(--primary-foreground)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{objective.label}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">{objective.hint}</div>
                      </div>
                      <div className="flex flex-shrink-0 gap-0.5">
                        <button onClick={() => move(index, -1)} disabled={index === 0}
                          className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-20">
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button onClick={() => move(index, 1)} disabled={index === priorities.length - 1}
                          className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-20">
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── 4. buffer floor ─────────────────────────────────────────── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Your safety floor</h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                The amount you never want to drop below. Safe-to-spend is measured above this line.
              </p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">Rs.</span>
                <input
                  type="number" value={floor} min="0" step="1000"
                  onChange={(e) => setFloor(e.target.value)}
                  className="glass w-full rounded-2xl py-4 pl-12 pr-4 font-display text-xl font-bold focus:outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[5000, 10000, 20000, 30000].map((preset) => (
                  <button
                    key={preset} onClick={() => setFloor(preset)}
                    className="rounded-full bg-[var(--secondary)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)]"
                  >
                    Rs.{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 5. sources ──────────────────────────────────────────────── */}
          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <h2 className="mb-1 font-display text-2xl font-bold tracking-tight">Where the data comes from</h2>
              <p className="mb-6 text-sm text-[var(--muted-foreground)]">
                Every source feeds one model. Nothing is treated as fact without a confidence score.
              </p>
              <div className="space-y-2">
                {[
                  { icon: MessageSquare, title: 'Bank & UPI SMS', body: 'The Android app reads your last 30 days and keeps up with new alerts.' },
                  { icon: Wallet, title: 'Manual entry', body: 'Always available for cash and anything missed.' },
                  { icon: TrendingUp, title: 'Order emails & bill photos', body: 'Added to the same ledger, merged with the matching SMS.' },
                ].map((source) => (
                  <div key={source.title} className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4">
                    <source.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />
                    <div>
                      <div className="text-sm font-semibold">{source.title}</div>
                      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{source.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-500">{error}</div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30"
          >
            Back
          </button>
          <button
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {last ? 'Start using Glide' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
