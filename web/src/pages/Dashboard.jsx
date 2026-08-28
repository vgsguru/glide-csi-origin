import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownRight, ArrowUpRight, Inbox, RefreshCw, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import clsx from 'clsx';

import { api, formatCurrency, formatRelative } from '../api/client';
import AgentCard from '../components/AgentCard';
import { CategoryBars, IncomeBand, ScenarioProjection } from '../components/charts';
import {
  ConfidenceChip, EmptyState, ErrorState, LoadingState, container, item,
} from '../components/ui';

export default function Dashboard({ user }) {
  const [state, setState] = useState(null);
  const [insights, setInsights] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, ins, txns] = await Promise.all([
        api.dashboardState(),
        api.insights('active'),
        api.transactions({ limit: 8 }),
      ]);
      setState(dash);
      setInsights(ins.insights);
      setTransactions(txns.transactions);
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
      const result = await api.tick(true);
      setInsights(result.insights);
      setState(await api.dashboardState());
    } catch (err) {
      setError(err);
    } finally {
      setTicking(false);
    }
  }

  async function dismiss(id) {
    setInsights((prev) => prev.filter((i) => i.id !== id));
    try { await api.dismissInsight(id); } catch { /* optimistic */ }
  }

  async function act(id) {
    setInsights((prev) => prev.filter((i) => i.id !== id));
    try { await api.actInsight(id); } catch { /* optimistic */ }
  }

  if (loading) return <LoadingState />;
  if (error && !state) {
    return <div className="mx-auto max-w-3xl p-6"><ErrorState error={error} onRetry={load} /></div>;
  }

  const sts = state.safe_to_spend;
  const firstName = user?.name?.split(' ')[0];

  return (
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="mx-auto w-full max-w-6xl space-y-5 p-6 pt-8"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div variants={item} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
            <Sparkles className="h-3 w-3" />
            gemma4:12b · running locally
          </div>
          <h1 className="mb-1 font-display text-4xl font-bold tracking-tight">Financial State</h1>
          <p className="text-[var(--muted-foreground)]">
            {firstName ? `${firstName} — ` : ''}
            {state.transaction_count} transactions modelled over 90 days.
          </p>
        </div>

        <button
          onClick={runTick}
          disabled={ticking}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-[var(--primary-foreground)] disabled:opacity-50"
        >
          <RefreshCw className={clsx('h-4 w-4', ticking && 'animate-spin')} />
          {ticking ? 'Reasoning…' : 'Run agent'}
        </button>
      </motion.div>

      {/* ── Hero row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <motion.div variants={item} className="glass-strong flex flex-col justify-between rounded-3xl p-8 md:col-span-2">
          <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Safe to spend
          </span>
          <div
            className={clsx(
              'mb-4 font-display text-6xl font-bold tracking-tighter md:text-7xl',
              sts.is_negative && 'text-red-500',
            )}
          >
            {formatCurrency(sts.amount)}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
            <span>Balance {formatCurrency(sts.components.balance)}</span>
            <span>+ conservative inflow {formatCurrency(sts.components.expected_inflow_conservative)}</span>
            <span>− obligations {formatCurrency(sts.components.committed_obligations)}</span>
            <span>− floor {formatCurrency(sts.components.buffer_floor)}</span>
          </div>

          {sts.is_negative && (
            <p className="mt-3 text-sm font-medium text-red-500">
              You are {formatCurrency(Math.abs(sts.raw))} below your safety floor.
            </p>
          )}
        </motion.div>

        <motion.div variants={item} className="glass rounded-3xl p-6">
          <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Variable income band
          </span>
          <IncomeBand income={state.income} />
        </motion.div>
      </div>

      {/* ── Review queue ───────────────────────────────────────────────── */}
      {state.needs_review_count > 0 && (
        <motion.div variants={item} className="glass flex items-center justify-between rounded-3xl px-6 py-4">
          <div className="flex items-center gap-3">
            <Inbox className="h-5 w-5 text-amber-500" />
            <div>
              <div className="text-sm font-semibold">
                {state.needs_review_count} transaction{state.needs_review_count === 1 ? '' : 's'} need review
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Parsed below the confidence threshold, or two sources disagreed.
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Agent insights ─────────────────────────────────────────────── */}
      <motion.div variants={item}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Agent insights</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            {insights.length} surfaced · rest suppressed, see Activity
          </span>
        </div>

        {insights.length === 0 ? (
          <div className="glass rounded-3xl">
            <EmptyState
              icon={Sparkles}
              title="Nothing needs your attention"
              body="The agent found no risk or opportunity worth interrupting you for. Run it again after new transactions land."
              action={
                <button onClick={runTick} className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]">
                  Run agent now
                </button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <AgentCard key={insight.id} insight={insight} onDismiss={dismiss} onAct={act} />
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Projection + spend ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div variants={item} className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-lg font-bold">30-day projection</span>
            <TrendingUp className="h-4 w-4 text-[var(--muted-foreground)]" />
          </div>
          <ScenarioProjection scenarios={state.projection} bufferFloor={state.buffer_floor} />
        </motion.div>

        <motion.div variants={item} className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-display text-lg font-bold">Where it went</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {formatCurrency(state.spend.total)} · 30 days
            </span>
          </div>
          <CategoryBars categories={state.spend.by_category} />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-xs">
            <div>
              <div className="text-[var(--muted-foreground)]">Discretionary</div>
              <div className="font-display text-sm font-bold">{formatCurrency(state.spend.discretionary)}</div>
            </div>
            <div>
              <div className="text-[var(--muted-foreground)]">Essential</div>
              <div className="font-display text-sm font-bold">{formatCurrency(state.spend.essential)}</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Obligations + recent ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div variants={item} className="glass rounded-3xl p-6">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-lg font-bold">Upcoming obligations</span>
            <span className="text-xs text-[var(--muted-foreground)]">{formatCurrency(state.obligations_total)}</span>
          </div>
          <p className="mb-4 text-xs text-[var(--muted-foreground)]">
            Discovered from repeats — none of this was configured.
          </p>

          {state.obligations.length === 0 ? (
            <EmptyState icon={Wallet} title="No recurring payments learned yet" body="They appear automatically once a payment repeats." />
          ) : (
            <div className="space-y-1">
              {state.obligations.map((obligation) => (
                <div key={obligation.id} className="flex items-center justify-between border-b border-[var(--border)] py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{obligation.name}</span>
                      <ConfidenceChip value={obligation.confidence} />
                    </div>
                    <div
                      className={clsx(
                        'mt-0.5 text-xs',
                        obligation.days_until <= 3 ? 'font-semibold text-red-500' : 'text-[var(--muted-foreground)]',
                      )}
                    >
                      {obligation.days_until < 0
                        ? `overdue by ${Math.abs(obligation.days_until)}d`
                        : `due in ${obligation.days_until}d`}
                      {' · '}every {obligation.cadence_days}d · seen {obligation.occurrences}×
                    </div>
                  </div>
                  <div className="ml-3 font-display text-sm font-bold">
                    {formatCurrency(obligation.expected_amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div variants={item} className="glass rounded-3xl p-6">
          <span className="mb-4 block font-display text-lg font-bold">Recent activity</span>
          <div className="space-y-1">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={clsx(
                      'grid h-8 w-8 flex-shrink-0 place-items-center rounded-full',
                      txn.direction === 'CREDIT'
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-[var(--secondary)] text-[var(--foreground)]',
                    )}
                  >
                    {txn.direction === 'CREDIT'
                      ? <ArrowDownRight className="h-4 w-4" />
                      : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{txn.merchant}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {txn.category} · {formatRelative(txn.occurred_at)}
                      {txn.evidence_count > 1 && ` · ${txn.evidence_count} sources`}
                    </div>
                  </div>
                </div>
                <div
                  className={clsx(
                    'ml-3 font-display text-sm font-bold',
                    txn.direction === 'CREDIT' && 'text-green-600 dark:text-green-400',
                  )}
                >
                  {txn.direction === 'CREDIT' ? '+' : '−'}{formatCurrency(txn.amount)}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
