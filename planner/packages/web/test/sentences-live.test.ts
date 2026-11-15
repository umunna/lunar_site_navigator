// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { readFileSync } from 'node:fs';
import { CATALOG, computeSiteTrack, decodeEphemeris, flatSkyline, marginAt } from '@lsn/shared';
import type { WindowMetrics } from '@lsn/shared';
import { describe, expect, it } from 'vitest';
import { explainBody, explainMetrics } from '../src/lib/explain';
import { countdowns, skyNow } from '../src/lib/live';
import type { BodyNow, Countdown } from '../src/lib/live';

const body = (over: Partial<BodyNow>): BodyNow => ({ azDeg: 90, elDeg: 1, discRadiusDeg: 0.27, skylineDeg: 0, marginDeg: 1.27, fraction: 1, ...over });
const none: Countdown = { kind: 'set', crossing: null, atUnixS: null };
const END = 1_890_000_000;
const DIP = -0.087;

describe('plain-sentence wording [LSN-UI-005]', () => {
  it('fully visible, partly visible, hidden by terrain, below the horizon', () => {
    expect(explainBody({ name: 'Sun', body: body({}), countdown: none, dataEndUnixS: END, flatDipDeg: DIP })).toContain('The Sun is fully in view');
    const partial = explainBody({ name: 'Sun', body: body({ marginDeg: 0.1, fraction: 0.42, elDeg: 0.1, skylineDeg: 0.27 }), countdown: none, dataEndUnixS: END, flatDipDeg: DIP });
    expect(partial).toContain('About 42% of the Sun is in view');
    const hidden = explainBody({ name: 'Sun', body: body({ marginDeg: -0.9, fraction: 0, elDeg: 0.3, skylineDeg: 1.5 }), countdown: { kind: 'rise', crossing: null, atUnixS: null }, dataEndUnixS: END, flatDipDeg: DIP });
    expect(hidden).toContain('Hills hide the Sun');
    const below = explainBody({ name: 'Earth', body: body({ marginDeg: -9, fraction: 0, elDeg: -10, skylineDeg: 0 }), countdown: { kind: 'rise', crossing: null, atUnixS: null }, dataEndUnixS: END, flatDipDeg: DIP });
    expect(below).toContain('Earth is below the horizon');
  });

  it('countdown sentences give a duration and a time, or say there is no event before the data ends', () => {
    const set: Countdown = { kind: 'set', crossing: { index: 10, secondsFromStart: 3 * 86_400 + 4 * 3600 }, atUnixS: 1_793_491_200 + 6000 };
    expect(explainBody({ name: 'Sun', body: body({}), countdown: set, dataEndUnixS: END, flatDipDeg: DIP })).toContain('sets in 3 d 4 h 0 min');
    expect(explainBody({ name: 'Earth', body: body({}), countdown: none, dataEndUnixS: END, flatDipDeg: DIP })).toMatch(/There is no Earthset before our data ends on 2029-/);
  });

  it('never says power, link or communication: the app shows only where the Sun and Earth are', () => {
    const m: WindowMetrics = { samples: 2016, hours: 336, litPercent: 55, longestLitH: 70, longestDarkH: 30, earthVisiblePercent: 40, longestEarthOutageH: 80, bothPercent: 20, neitherPercent: 25, longestNeitherH: 18, maxSunElDeg: 1.4, meanSunFraction: 0.5 };
    const text = [
      ...explainMetrics(m),
      explainBody({ name: 'Sun', body: body({}), countdown: none, dataEndUnixS: END, flatDipDeg: DIP }),
      explainBody({ name: 'Earth', body: body({ marginDeg: -3, elDeg: -3, fraction: 0 }), countdown: none, dataEndUnixS: END, flatDipDeg: DIP }),
    ].join(' ');
    expect(text).not.toMatch(/\b(power|solar array|battery|link|signal|communicat|contact|antenna)\b/i);
    expect(explainMetrics(m).join(' ')).toContain('there is no Sun and no Earth in view, up to 18 h in one stretch');
  });
});

describe('live sky and countdowns on the real ephemeris [LSN-UI-006]', () => {
  const eph = decodeEphemeris(new Uint8Array(readFileSync(new URL('../../../data/ephemeris.bin', import.meta.url))));
  const site = CATALOG.find((s) => s.id === 'shackleton-high');
  const flat = flatSkyline(2);

  it('the live position agrees with the precomputed track at a grid sample', () => {
    expect(site).toBeDefined();
    const lat = site?.latDeg ?? 0;
    const lon = site?.lonDeg ?? 0;
    const track = computeSiteTrack(eph, lat, lon, flat);
    for (const i of [0, 1872, 40_000, 157_823]) {
      const now = skyNow(eph, lat, lon, flat, i);
      expect(Math.abs(now.sun.elDeg - (track.sun.elDeg[i] ?? 0))).toBeLessThan(1e-3);
      expect(Math.abs(now.earth.elDeg - (track.earth.elDeg[i] ?? 0))).toBeLessThan(1e-3);
      expect(Math.abs(now.sun.marginDeg - (track.sun.marginDeg[i] ?? 0))).toBeLessThan(1e-3);
    }
  });

  it('a sunset countdown lands where the margin crosses zero', () => {
    const track = computeSiteTrack(eph, 0, 0, flat);
    let idx = 0;
    for (let i = 0; i < 20_000; i++) {
      if (marginAt(track.sun.marginDeg, i) > 0) { idx = i; break; }
    }
    const c = countdowns(track, idx, eph.meta.t0UnixS, eph.meta.stepS);
    expect(c.sun.kind).toBe('set');
    expect(c.sun.crossing).not.toBeNull();
    const at = c.sun.crossing?.index ?? 0;
    expect(at).toBeGreaterThan(idx);
    expect(Math.abs(marginAt(track.sun.marginDeg, at))).toBeLessThan(0.01);
    expect(c.sun.atUnixS).toBeCloseTo(eph.meta.t0UnixS + at * eph.meta.stepS, 3);
  });
});
