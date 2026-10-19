/**
 * Microseconds since the epoch of a timestamp as Postgres sends it
 * ("2026-10-19T15:03:36.996802+00:00") or as JavaScript writes it
 * ("2026-10-19T15:03:36.996Z"). Date keeps only milliseconds, and two writes
 * to the same row can land within one: the fraction is read on its own.
 */
function microseconds(timestamp: string): number {
  const fraction = /\.(\d+)/.exec(timestamp)?.[1] ?? "";
  const seconds = Date.parse(timestamp.replace(/\.\d+/, "")) / 1000;
  return seconds * 1_000_000 + Number(fraction.padEnd(6, "0").slice(0, 6));
}

/** Negative when `a` is earlier than `b`, positive when later, 0 when equal. */
export function compareTimestamps(a: string, b: string): number {
  return microseconds(a) - microseconds(b);
}
