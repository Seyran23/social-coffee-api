import { MIN_BUCKET, DEFAULT_PERIOD_DAYS } from '../constants/analytics';

export interface Period {
  from: Date;
  to: Date;
}

export function resolvePeriods(
  fromISO?: string,
  toISO?: string,
): {
  current: Period;
  previous: Period;
} {
  const to = toISO ? new Date(toISO) : new Date();
  const from = fromISO
    ? new Date(fromISO)
    : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const spanMs = to.getTime() - from.getTime();
  const previous: Period = {
    from: new Date(from.getTime() - spanMs),
    to: from,
  };

  return { current: { from, to }, previous };
}

export const safe = (count: number): number | null =>
  count >= MIN_BUCKET ? count : null;

export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}
