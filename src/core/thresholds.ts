export const MIN_LEVELS = 2;
export const MAX_LEVELS = 16;

export function clampLevels(n: number): number {
  if (!Number.isFinite(n)) return MIN_LEVELS;
  return Math.min(MAX_LEVELS, Math.max(MIN_LEVELS, Math.round(n)));
}

/** N Stufen -> N-1 gleichmäßig verteilte Schwellen. */
export function defaultThresholds(levels: number): number[] {
  const n = clampLevels(levels);
  return Array.from({ length: n - 1 }, (_, k) => Math.round((256 * (k + 1)) / n));
}

/** Setzt Schwelle k auf value, begrenzt durch die Nachbarn (kein Überkreuzen). */
export function moveThreshold(t: readonly number[], k: number, value: number): number[] {
  const lo = k === 0 ? 1 : t[k - 1] + 1;
  const hi = k === t.length - 1 ? 255 : t[k + 1] - 1;
  const v = Math.min(hi, Math.max(lo, Math.round(value)));
  const out = t.slice();
  out[k] = v;
  return out;
}
