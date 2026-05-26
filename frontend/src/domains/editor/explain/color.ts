/** Color utilities for plan visualization — green→red HSL gradient and severity thresholds. */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** Maps 0..100 percentage to green (0%) → red (100%) color. */
export function percentToColor(percent: number): string {
  const i = Math.max(0, Math.min(100, percent));
  const hue = ((100 - i) * 1.2) / 360;
  const [r, g, b] = hslToRgb(hue, 0.9, 0.4);
  return `rgb(${r},${g},${b})`;
}

export type Severity = 2 | 3 | 4;

export function durationSeverity(percent: number): Severity | null {
  if (percent > 90) return 4;
  if (percent > 40) return 3;
  if (percent > 10) return 2;
  return null;
}

export function estimateSeverity(factor: number): Severity | null {
  if (factor > 1000) return 4;
  if (factor > 100) return 3;
  if (factor > 10) return 2;
  return null;
}

export function rowsRemovedSeverity(percent: number): Severity | null {
  if (percent > 90) return 4;
  if (percent > 50) return 3;
  return null;
}

/** Tailwind classes for severity badge backgrounds. */
export const severityClasses: Record<Severity, string> = {
  2: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  3: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  4: "bg-red-500/15 text-red-700 dark:text-red-300",
};
