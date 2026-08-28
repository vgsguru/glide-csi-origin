import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, Lightbulb, Info, X, Check } from 'lucide-react';
import clsx from 'clsx';

import { item } from './ui';

const KIND_ICON = { risk: AlertTriangle, opportunity: Lightbulb, information: Info };

/**
 * A proactive insight card.
 *
 * The "Why am I seeing this?" expansion is the point of the whole product:
 * every card can be unfolded into the real figures and sources that produced
 * it, plus the snapshot it was computed from.
 */
export default function AgentCard({ insight, onDismiss, onAct }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[insight.kind] || Info;

  const tone =
    insight.severity === 'critical'
      ? 'text-red-500 bg-red-500/10'
      : insight.severity === 'warn'
        ? 'text-amber-500 bg-amber-500/10'
        : insight.kind === 'opportunity'
          ? 'text-green-600 dark:text-green-400 bg-green-500/10'
          : 'text-[var(--muted-foreground)] bg-[var(--secondary)]';

  return (
    <motion.div variants={item} layout className="glass rounded-3xl p-5">
      <div className="flex items-start gap-4">
        <div className={clsx('grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl', tone)}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold leading-tight">{insight.title}</h3>
            <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              {insight.kind}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">{insight.body}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--secondary)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)]"
            >
              Why am I seeing this?
              <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </button>

            {onAct && (
              <button
                onClick={() => onAct(insight.id)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <Check className="h-3.5 w-3.5" /> Got it
              </button>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(insight.id)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" /> Dismiss
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/50 p-4">
                  {insight.reasoning && (
                    <div>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        Calculation
                      </div>
                      <code className="block break-words font-mono text-xs leading-relaxed text-[var(--foreground)]/80">
                        {insight.reasoning}
                      </code>
                    </div>
                  )}

                  {insight.evidence?.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                        Evidence
                      </div>
                      <div className="space-y-1.5">
                        {insight.evidence.map((row, index) => (
                          <div key={index} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="text-[var(--muted-foreground)]">{row.label}</span>
                            <span className="flex-1 border-b border-dotted border-[var(--border)]" />
                            <span className="font-semibold">{row.value}</span>
                            {row.source && (
                              <span className="text-[10px] text-[var(--muted-foreground)]">({row.source})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--muted-foreground)]">
                    <span>Snapshot {insight.snapshot_ref}</span>
                    <span>Priority score {insight.score}</span>
                    <span>Detector “{insight.detector}”</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
