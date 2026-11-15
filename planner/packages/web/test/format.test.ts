// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { describe, expect, it } from 'vitest';
import { discPoint, whereOnMoon } from '../src/components/MoonLocator';
import { formatDateUtc, formatDeg, formatDuration, formatHoursSpan, formatLat, formatLon, formatUtc, fromUtcInput, toUtcInput } from '../src/lib/format';

describe('formatting [LSN-UI-001]', () => {
  it('durations in days, hours, minutes', () => {
    expect(formatDuration(0)).toBe('under 1 min');
    expect(formatDuration(29)).toBe('under 1 min');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1 h 0 min');
    expect(formatDuration(3 * 86_400 + 4 * 3600 + 12 * 60)).toBe('3 d 4 h 12 min');
    expect(() => formatDuration(-1)).toThrow(/non-negative/);
  });

  it('signed degrees use a true minus and never print a negative zero', () => {
    expect(formatDeg(1.327)).toBe('+1.33°');
    expect(formatDeg(-0.4)).toBe('−0.40°');
    expect(formatDeg(-0.001)).toBe('+0.00°');
    expect(formatDeg(-6.74, 1)).toBe('−6.7°');
  });

  it('latitude and longitude with hemisphere letters, longitude shown in -180 to 180', () => {
    expect(formatLat(-89.67)).toBe('89.67° S');
    expect(formatLat(0.67)).toBe('0.67° N');
    expect(formatLon(129.78)).toBe('129.78° E');
    expect(formatLon(354.83)).toBe('5.17° W');
    expect(formatLon(-5.17)).toBe('5.17° W');
  });

  it('UTC times are locale and time-zone independent', () => {
    expect(formatUtc(1_793_491_200)).toBe('2026-11-01 00:00 UTC');
    expect(formatDateUtc(1_793_491_200 + 3600)).toBe('2026-11-01');
    expect(toUtcInput(1_793_491_200)).toBe('2026-11-01T00:00');
    expect(fromUtcInput('2026-11-01T00:00')).toBe(1_793_491_200);
    expect(fromUtcInput(toUtcInput(1_800_000_060))).toBe(1_800_000_060);
    expect(fromUtcInput('not a time')).toBeNaN();
    expect(fromUtcInput('')).toBeNaN();
  });

  it('hour spans switch to days for long runs', () => {
    expect(formatHoursSpan(5.5)).toBe('5.5 h');
    expect(formatHoursSpan(12)).toBe('12 h');
    expect(formatHoursSpan(48)).toBe('2 d');
    expect(formatHoursSpan(50)).toBe('2 d 2 h');
  });

  it('hour spans never print 24 hours: the carry goes into the days', () => {
    expect(formatHoursSpan(71.6)).toBe('3 d');
    expect(formatHoursSpan(95.7)).toBe('4 d');
    expect(formatHoursSpan(71.4)).toBe('2 d 23 h');
    for (let h = 48; h < 400; h += 0.37) {
      expect(formatHoursSpan(h)).not.toMatch(/\b24 h\b/);
    }
  });
});

describe('where the place is on the Moon [LSN-UI-015]', () => {
  it('puts the south pole at the bottom of the disc, the centre of the near side in the middle, and marks the far side', () => {
    expect(discPoint(-90, 0).y).toBeCloseTo(1, 9);
    expect(discPoint(0, 0)).toEqual({ x: 0, y: -0, farSide: false });
    expect(discPoint(0, 90).x).toBeCloseTo(1, 9);
    expect(discPoint(10, 180).farSide).toBe(true);
  });

  it('says the distance from the pole for polar places and the side and half for other places', () => {
    expect(whereOnMoon(-86.5158, 2.5)).toBe('About 106 km from the Moon’s south pole, at the bottom of the Moon as we see it from Earth.');
    expect(whereOnMoon(0.67, 23.47)).toBe('On the side of the Moon that faces Earth, near its equator.');
    expect(whereOnMoon(-45, 170)).toBe('On the far side of the Moon, which we never see from Earth, in its southern half.');
  });
});
