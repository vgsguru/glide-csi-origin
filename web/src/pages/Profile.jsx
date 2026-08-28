import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown, ChevronUp, HardDrive, RefreshCw, Save, ShieldCheck, Smartphone,
} from 'lucide-react';
import clsx from 'clsx';

import { api, formatCurrency, formatRelative, getBaseUrl, setBaseUrl } from '../api/client';
import { ErrorState, LoadingState, Toast, container, item } from '../components/ui';

const OBJECTIVE_LABEL = {
  buffer: 'Safety buffer',
  obligations: 'Bills & obligations',
  goals: 'Savings goals',
  investing: 'Investing',
  discretionary: 'Discretionary spending',
};

export default function Profile({ onChanged }) {
  const [profile, setProfile] = useState(null);
  const [risk, setRisk] = useState(50);
  const [floor, setFloor] = useState(10000);
  const [priorities, setPriorities] = useState([]);
  const [baseUrl, setBase] = useState(getBaseUrl());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getProfile();
      setProfile(data);
      setRisk(data.user.risk_tolerance);
      setFloor(data.user.buffer_floor);
      setPriorities(data.user.priorities);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function move(index, delta) {
    const next = [...priorities];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPriorities(next);
  }

  async function save() {
    setSaving(true);
    try {
      await api.updateProfile({ risk_tolerance: risk, buffer_floor: Number(floor), priorities });
      // Re-run the agent so the effect of the change is immediately visible.
      await api.tick(false);
      setToast({ message: 'Saved — the agent re-ran with your new priorities', tone: 'success' });
      onChanged?.();
      await load();
    } catch (err) {
      setToast({ message: String(err.message), tone: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3800);
    }
  }

  if (loading) return <LoadingState label="Loading your settings…" />;
  if (error && !profile) {
    return <div className="mx-auto max-w-3xl p-6"><ErrorState error={error} onRetry={load} /></div>;
  }

  const dirty =
    risk !== profile.user.risk_tolerance ||
    Number(floor) !== profile.user.buffer_floor ||
    priorities.join() !== profile.user.priorities.join();

  return (
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="mx-auto w-full max-w-3xl space-y-5 p-6 pt-8"
    >
      <motion.div variants={item}>
        <h1 className="mb-1 font-display text-4xl font-bold tracking-tight">Settings</h1>
        <p className="text-[var(--muted-foreground)]">
          These are the agent's inputs. Change them and its recommendations change.
        </p>
      </motion.div>

      {/* ── Arbitrator inputs ───────────────────────────────────────────── */}
      <motion.div variants={item} className="glass-strong rounded-3xl p-6 md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--secondary)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Arbitration</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              How the agent resolves buffer vs. goals vs. investing.
            </p>
          </div>
        </div>

        {/* Risk */}
        <div className="mb-8">
          <label className="mb-3 flex justify-between text-sm font-medium">
            <span>Risk tolerance</span>
            <span className="font-bold">{risk}%</span>
          </label>
          <input
            type="range" min="0" max="100" value={risk}
            onChange={(e) => setRisk(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--secondary)] accent-[var(--primary)]"
          />
          <div className="mt-2 flex justify-between text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            <span>Conservative</span>
            <span>Aggressive</span>
          </div>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Conservative weights protective objectives more heavily; aggressive lets the agent
            favour growth over holding cash.
          </p>
        </div>

        {/* Priorities */}
        <div className="mb-8">
          <label className="mb-1 block text-sm font-medium">Priority order</label>
          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            The waterfall the arbitrator walks. Highest first.
          </p>
          <div className="space-y-2">
            {priorities.map((objective, index) => (
              <div
                key={objective}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/50 px-4 py-3"
              >
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-[var(--primary-foreground)]">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {OBJECTIVE_LABEL[objective] || objective}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => move(index, -1)} disabled={index === 0}
                    className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-20"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(index, 1)} disabled={index === priorities.length - 1}
                    className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-20"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Buffer floor */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium">Buffer floor</label>
          <input
            type="number" value={floor} min="0" step="500"
            onChange={(e) => setFloor(e.target.value)}
            className="glass w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
          />
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Safe-to-spend is computed above this line. Currently {formatCurrency(profile.user.buffer_floor)}.
          </p>
        </div>

        <button
          onClick={save}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-40"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Re-running the agent…' : 'Save and re-run agent'}
        </button>
      </motion.div>

      {/* ── Local engine ────────────────────────────────────────────────── */}
      <motion.div variants={item} className="glass-strong rounded-3xl p-6 md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--secondary)]">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Local LLM engine</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Chat runs on your machine — nothing leaves it.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl bg-[var(--secondary)]/50 px-4 py-3">
            <span className="text-sm">Model</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className={clsx('h-1.5 w-1.5 rounded-full', profile.engine.available ? 'bg-green-500' : 'bg-red-500')} />
              {profile.engine.model}
              {profile.engine.parameter_size && (
                <span className="text-xs text-[var(--muted-foreground)]">({profile.engine.parameter_size})</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-[var(--secondary)]/50 px-4 py-3">
            <span className="text-sm">Ollama host</span>
            <code className="font-mono text-xs text-[var(--muted-foreground)]">{profile.engine.host}</code>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Backend API</label>
            <div className="flex gap-2">
              <input
                value={baseUrl}
                onChange={(e) => setBase(e.target.value)}
                className="glass flex-1 rounded-2xl px-4 py-3 font-mono text-xs focus:outline-none"
              />
              <button
                onClick={() => { setBaseUrl(baseUrl); setToast({ message: 'Backend URL updated', tone: 'success' }); setTimeout(() => setToast(null), 2500); }}
                className="rounded-2xl bg-[var(--secondary)] px-4 text-sm font-medium"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Paired devices ─────────────────────────────────────────────── */}
      <motion.div variants={item} className="glass rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--secondary)]">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold">Android capture client</h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {profile.devices.length > 0
                ? `${profile.devices.length} device paired`
                : 'No device has synced yet'}
            </p>
          </div>
        </div>

        {profile.devices.length > 0 && (
          <div className="space-y-2">
            {profile.devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between rounded-2xl bg-[var(--secondary)]/50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{device.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {device.messages_ingested} messages · last sync {formatRelative(device.last_sync_at)}
                  </div>
                </div>
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                  paired
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--muted-foreground)]">
          {profile.transaction_count} transactions in your ledger.
        </p>
      </motion.div>

      <Toast message={toast?.message} tone={toast?.tone} />
    </motion.div>
  );
}
