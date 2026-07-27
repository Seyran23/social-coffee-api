import { describe, expect, it } from 'vitest';

import { MIN_BUCKET } from '../constants/analytics';

import { percentDelta, resolvePeriods, safe } from './period';

describe('period utils', () => {
  describe('safe (k-anonymity floor)', () => {
    it('returns the count at or above the floor', () => {
      expect(safe(MIN_BUCKET)).toBe(MIN_BUCKET);
      expect(safe(10)).toBe(10);
    });

    it('suppresses counts below the floor', () => {
      expect(safe(MIN_BUCKET - 1)).toBeNull();
      expect(safe(0)).toBeNull();
    });
  });

  describe('percentDelta', () => {
    it('computes rounded percent change', () => {
      expect(percentDelta(150, 100)).toBe(50);
      expect(percentDelta(80, 100)).toBe(-20);
    });

    it('returns null when the previous value is zero', () => {
      expect(percentDelta(10, 0)).toBeNull();
    });
  });

  describe('resolvePeriods', () => {
    it('defaults to a 30-day window ending now with an equal previous window', () => {
      const { current, previous } = resolvePeriods();
      const spanMs = current.to.getTime() - current.from.getTime();
      const days = Math.round(spanMs / (24 * 60 * 60 * 1000));
      expect(days).toBe(30);
      // previous window is equal length and immediately before current
      expect(previous.to.getTime()).toBe(current.from.getTime());
      expect(current.from.getTime() - previous.from.getTime()).toBe(spanMs);
    });

    it('honors explicit from/to and mirrors the span backwards', () => {
      const { current, previous } = resolvePeriods(
        '2026-07-01T00:00:00.000Z',
        '2026-07-11T00:00:00.000Z',
      );
      expect(current.from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(current.to.toISOString()).toBe('2026-07-11T00:00:00.000Z');
      // 10-day span → previous window is the preceding 10 days
      expect(previous.from.toISOString()).toBe('2026-06-21T00:00:00.000Z');
      expect(previous.to.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });
  });
});
