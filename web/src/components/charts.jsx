import { formatCurrency } from '../api/client';

/**
 * Income as a band, never a single number.
 * The p10..p90 range is drawn to scale with the p50 marked inside it.
 */
export function IncomeBand({ income }) {
  const { p10, p50, p90, basis, stability, confidence } = income;
  const span = Math.max(p90 - p10, 1);
  const medianOffset = ((p50 - p10) / span) * 100;

  return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-2xl font-bold tracking-tight">
          {formatCurrency(p10, { compact: true })} – {formatCurrency(p90, { compact: true })}
        </div>
        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          Typical month {formatCurrency(p50)} · {stability}
        </div>
      </div>

      <div className="relative h-2.5 w-full rounded-full bg-[var(--secondary)]">
        <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-[var(--foreground)]/20" />
        <div
          className="absolute -top-1 h-4.5 w-1 rounded-full bg-[var(--primary)]"
          style={{ left: `calc(${Math.min(Math.max(medianOffset, 0), 100)}% - 2px)`, height: '18px', top: '-4px' }}
          title={`p50 ${formatCurrency(p50)}`}
        />
      </div>

      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
        <span>p10 {formatCurrency(p10, { compact: true })}</span>
        <span>p50 {formatCurrency(p50, { compact: true })}</span>
        <span>p90 {formatCurrency(p90, { compact: true })}</span>
      </div>

      <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
        Basis: {basis} · {Math.round((confidence || 0) * 100)}% confidence
      </div>
    </div>
  );
}

/** Three-scenario 30-day balance projection as an inline SVG area chart. */
export function ScenarioProjection({ scenarios, bufferFloor }) {
  if (!scenarios?.length) return null;

  const width = 560;
  const height = 180;
  const padX = 8;
  const padY = 14;

  const all = scenarios.flatMap((s) => s.series.map((p) => p.balance)).concat([bufferFloor || 0]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(max - min, 1);
  const days = scenarios[0].series.length - 1;

  const x = (day) => padX + (day / days) * (width - padX * 2);
  const y = (value) => padY + (1 - (value - min) / range) * (height - padY * 2);

  const COLORS = {
    pessimistic: 'var(--muted-foreground)',
    expected: 'var(--foreground)',
    optimistic: 'var(--muted-foreground)',
  };
  const DASH = { pessimistic: '4 4', expected: '0', optimistic: '2 3' };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full min-w-[420px]" role="img"
             aria-label="30-day balance projection under three income scenarios">
          {/* buffer floor */}
          <line
            x1={padX} x2={width - padX} y1={y(bufferFloor || 0)} y2={y(bufferFloor || 0)}
            stroke="rgb(239 68 68)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.8"
          />
          <text x={padX + 4} y={y(bufferFloor || 0) - 5} fontSize="9" fill="rgb(239 68 68)" fontWeight="600">
            buffer floor {formatCurrency(bufferFloor, { compact: true })}
          </text>

          {scenarios.map((scenario) => (
            <polyline
              key={scenario.scenario}
              fill="none"
              stroke={COLORS[scenario.scenario]}
              strokeWidth={scenario.scenario === 'expected' ? 2.4 : 1.4}
              strokeDasharray={DASH[scenario.scenario]}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={scenario.scenario === 'expected' ? 1 : 0.55}
              points={scenario.series.map((p) => `${x(p.day)},${y(p.balance)}`).join(' ')}
            />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {scenarios.map((scenario) => (
          <div key={scenario.scenario} className="rounded-2xl bg-[var(--secondary)]/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              {scenario.scenario}
            </div>
            <div className="font-display text-sm font-bold">{formatCurrency(scenario.end_balance)}</div>
            <div className={scenario.breaches_floor ? 'text-[10px] font-semibold text-red-500' : 'text-[10px] text-[var(--muted-foreground)]'}>
              {scenario.breaches_floor ? `breaches day ${scenario.breach_day}` : 'stays above floor'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal category bars for the 30-day spend breakdown. */
export function CategoryBars({ categories }) {
  if (!categories?.length) return null;
  const max = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <div className="space-y-2.5">
      {categories.slice(0, 6).map((category) => (
        <div key={category.category}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium">
              {category.category}
              {category.essential && (
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  essential
                </span>
              )}
            </span>
            <span className="text-[var(--muted-foreground)]">
              {formatCurrency(category.amount)} · {Math.round(category.share * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--secondary)]">
            <div
              className={category.essential ? 'h-full rounded-full bg-[var(--foreground)]/40' : 'h-full rounded-full bg-[var(--primary)]'}
              style={{ width: `${(category.amount / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
