import { motion } from 'framer-motion';
import { AlertTriangle, Check, Info, Loader2, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

export const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

export const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

export function Spinner({ className = '' }) {
  return <Loader2 className={clsx('animate-spin', className)} />;
}

export function LoadingState({ label = 'Loading your financial state…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-[var(--muted-foreground)]">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="glass rounded-3xl p-6 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-red-500">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-display font-bold">Could not load</span>
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">{String(error?.message || error)}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="self-start rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--secondary)]">
        <Icon className="h-5 w-5 text-[var(--muted-foreground)]" />
      </div>
      <div>
        <p className="font-display font-semibold">{title}</p>
        {body && <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Confidence is a first-class citizen in this app -- auto-captured data must
 * always show how sure the system is rather than passing as fact.
 */
export function ConfidenceChip({ value, label = 'confidence', className = '' }) {
  const pct = Math.round((value || 0) * 100);
  const tone =
    pct >= 85 ? 'bg-green-500/10 text-green-600 dark:text-green-400'
    : pct >= 60 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : 'bg-[var(--secondary)] text-[var(--muted-foreground)]';
  return (
    <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', tone, className)}>
      {pct}% {label}
    </span>
  );
}

export function SourceBadge({ source }) {
  const tone = {
    SMS: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    EMAIL: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    OCR: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    MANUAL: 'bg-[var(--secondary)] text-[var(--muted-foreground)]',
  }[source] || 'bg-[var(--secondary)] text-[var(--muted-foreground)]';
  return (
    <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone)}>
      {source}
    </span>
  );
}

export function SeverityDot({ severity }) {
  const tone = {
    critical: 'bg-red-500',
    warn: 'bg-amber-500',
    info: 'bg-[var(--muted-foreground)]',
  }[severity] || 'bg-[var(--muted-foreground)]';
  return <span className={clsx('h-2 w-2 rounded-full', tone)} />;
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'default' }) {
  return (
    <motion.div variants={item} className="glass rounded-3xl p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-[var(--muted-foreground)]" />}
      </div>
      <div
        className={clsx(
          'font-display text-2xl font-bold tracking-tight',
          tone === 'positive' && 'text-green-600 dark:text-green-400',
          tone === 'negative' && 'text-red-500',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--muted-foreground)]">{sub}</div>}
    </motion.div>
  );
}

export function Toast({ message, tone = 'info' }) {
  if (!message) return null;
  const Icon = tone === 'success' ? Check : tone === 'error' ? AlertTriangle : TrendingUp;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-panel fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium"
    >
      <Icon className={clsx('h-4 w-4', tone === 'error' ? 'text-red-500' : 'text-green-500')} />
      {message}
    </motion.div>
  );
}
