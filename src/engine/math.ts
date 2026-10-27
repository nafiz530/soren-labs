/** Small numeric helpers shared by lab simulations and data analysis. */

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Least-squares fit y = m·x + b. Returns m, b and the coefficient of determination. */
export function linearFit(points: { x: number; y: number }[]): { m: number; b: number; r2: number } {
  const n = points.length;
  if (n < 2) return { m: 0, b: 0, r2: 0 };
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { m: 0, b: sy / n, r2: 0 };
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  const yMean = sy / n;
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (m * p.x + b)) ** 2, 0);
  const r2 = ssTot > 1e-12 ? clamp(1 - ssRes / ssTot, 0, 1) : 1;
  return { m, b, r2 };
}

/** Format seconds as m:ss for stopwatches / experiment clocks. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${String(m).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}
