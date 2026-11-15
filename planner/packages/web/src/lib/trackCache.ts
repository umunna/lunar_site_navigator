// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Each site's three-year track costs tens of milliseconds (more on a phone), so it is
// computed once and kept. Least recently used entries are dropped past `capacity`.
import { computeSiteTrack, invariant } from '@lsn/shared';
import type { Ephemeris, SiteTrack } from '@lsn/shared';
import type { SiteSel } from './data';

interface Entry {
  readonly track: SiteTrack;
}

export function trackKey(site: Pick<SiteSel, 'id' | 'terrain' | 'latDeg' | 'lonDeg'>): string {
  return `${site.terrain === 'modelled' ? site.id : 'flat'}|${String(site.latDeg)}|${String(site.lonDeg)}`;
}

export class TrackCache {
  private readonly eph: Ephemeris;
  private readonly capacity: number;
  private readonly entries = new Map<string, Entry>();
  /** Number of tracks actually computed, for tests and diagnostics. */
  public computed = 0;

  public constructor(eph: Ephemeris, capacity = 8) {
    invariant(Number.isInteger(capacity) && capacity >= 1, 'capacity must be a positive integer');
    this.eph = eph;
    this.capacity = capacity;
  }

  private entry(site: SiteSel): Entry {
    const key = trackKey(site);
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const entry: Entry = { track: computeSiteTrack(this.eph, site.latDeg, site.lonDeg, site.skyline) };
    this.computed += 1;
    this.entries.set(key, entry);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.capacity) break;
      this.entries.delete(oldest);
    }
    return entry;
  }

  public track(site: SiteSel): SiteTrack {
    return this.entry(site).track;
  }

  public get size(): number {
    return this.entries.size;
  }
}
