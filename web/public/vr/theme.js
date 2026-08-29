/**
 * The Glide palette, carried over from the phone and the web app unchanged.
 * Near-black ground, white type, glass panels, colour used only where it
 * carries meaning.
 */
export const T = {
  bg: '#141414',
  fg: '#FAFAFA',
  secondary: '#2E2E2E',
  muted: '#A6A6A6',
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(255,255,255,0.12)',
  positive: '#4ADE80',
  negative: '#F87171',
  warning: '#FBBF24',
  info: '#60A5FA',
  accent: '#C084FC',
};

export const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
export const SANS = "'Inter', system-ui, sans-serif";

/** Indian-format currency, matching the phone's presentation. */
export function rupees(n, decimals = 0) {
  const v = Number(n) || 0;
  return 'Rs.' + v.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function compact(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e7) return 'Rs.' + (v / 1e7).toFixed(2) + 'Cr';
  if (v >= 1e5) return 'Rs.' + (v / 1e5).toFixed(2) + 'L';
  if (v >= 1e3) return 'Rs.' + (v / 1e3).toFixed(1) + 'k';
  return rupees(v);
}
