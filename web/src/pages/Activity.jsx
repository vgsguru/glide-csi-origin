import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity as ActivityIcon, Eye, EyeOff, RefreshCw, Scale } from 'lucide-react';
import clsx from 'clsx';

import { api, formatRelative } from '../api/client';
import { EmptyState, ErrorState, LoadingState, container, item } from '../components/ui';

export default function Activity() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.agentRuns(25);
      setRuns(data.runs);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runTick() {
    setTicking(true);
    try {
      await api.tick(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setTicking(false);
    }
  }

  if (loading) return <LoadingState label="Loading the agent's decision log…" />;
  if (error && runs.length === 0) {
    return <div className="mx-auto max-w-3xl p-6"><ErrorState error={error} onRetry={load} /></div>;
  }

  return (
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="mx-auto w-full max-w-4xl space-y-5 p-6 pt-8"
    >
      <motion.div variants={item} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 font-display text-4xl font-bold tracking-tight">Agent run log</h1>
          <p className="text-[var(--muted-foreground)]">
            What the agent considered, what it said, and what it deliberately kept quiet.
          </p>
        </div>
        <button
          onClick={runTick}
          disabled={ticking}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-4 w-4', ticking && 'animate-spin')} />
          Force a tick
        </button>
      </motion.div>

      {runs.length === 0 ? (
        <div className="glass rounded-3xl">
          <EmptyState
            icon={ActivityIcon}
            title="The agent has not run yet"
            body="Force a tick to see it perceive, arbitrate, and decide."
          />
        </div>
      ) : (
        runs.map((run) => (
          <motion.div key={run.id} variants={item} className="glass rounded-3xl p-6">
            {/* Run header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-bold">Run #{run.id}</span>
                <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {run.trigger}
                </span>
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  {run.snapshot_ref}
                </span>
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {run.signals_considered} signals · {run.duration_ms}ms · {formatRelative(run.created_at)}
              </div>
            </div>

            {/* Arbitration inputs — the user's own preferences */}
            {run.arbitration?.priorities && (
              <div className="mb-4 rounded-2xl bg-[var(--secondary)]/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <Scale className="h-3 w-3" /> Arbitration
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {run.arbitration.priorities.map((objective, index) => (
                    <span
                      key={objective}
                      className={clsx(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        objective === run.arbitration.winner_objective
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)]',
                      )}
                    >
                      {index + 1}. {objective}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  risk tolerance {run.arbitration.risk_tolerance}/100 · protective weight ×{run.arbitration.floor_mult}
                  {run.arbitration.winner && <> · winner: <span className="font-medium text-[var(--foreground)]">{run.arbitration.winner}</span></>}
                </div>
              </div>
            )}

            {/* Surfaced */}
            {run.surfaced.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                  <Eye className="h-3 w-3" /> Surfaced ({run.surfaced.length})
                </div>
                <div className="space-y-2">
                  {run.surfaced.map((entry, index) => (
                    <div key={index} className="rounded-2xl border border-[var(--border)] bg-green-500/[0.04] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{entry.title}</span>
                        <span className="flex-shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">
                          {entry.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{entry.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suppressed — the part most apps never show */}
            {run.suppressed.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <EyeOff className="h-3 w-3" /> Suppressed ({run.suppressed.length})
                </div>
                <div className="space-y-1.5">
                  {run.suppressed.map((entry, index) => (
                    <div key={index} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2 opacity-70">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{entry.title}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">{entry.reason}</div>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted-foreground)]">
                        {entry.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ))
      )}
    </motion.div>
  );
}
