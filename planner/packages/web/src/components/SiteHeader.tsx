// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// The top of the Sky view page: which place, which moment, and one line about the place.
import type { ReactElement } from 'react';
import type { Precision } from '@lsn/shared';
import { formatLat, formatLon, formatUtc } from '../lib/format';
import type { SiteSel } from '../lib/data';
import { MoonLocator, whereOnMoon } from './MoonLocator';

const KIND_TEXT: Readonly<Record<Precision, string>> = {
  'landing-site': 'This is where the Apollo lander stood.',
  'computed-high-point': 'A high point that we found on NASA’s Moon height map. It is not an official landing site.',
  'demo-area': 'The centre of the area where our rover simulation drives. It is not an official landing site.',
};

interface Props {
  readonly site: SiteSel;
  readonly timeUnixS: number;
  /** Opens the Compare places page, the one page where places are chosen. */
  readonly onChangePlace: () => void;
}

export function SiteHeader({ site, timeUnixS, onChangePlace }: Props): ReactElement {
  const kind = KIND_TEXT[site.catalog.precision];
  return (
    <header className="site-header">
      <MoonLocator latDeg={site.latDeg} lonDeg={site.lonDeg} />
      <div className="site-text">
      <div className="site-title">
        <h1>{site.name}</h1>
        <button type="button" className="btn btn-small" onClick={onChangePlace}>Change place</button>
      </div>
      <p className="coords">The Sun and the Earth as seen from here on {formatUtc(timeUnixS)} · {formatLat(site.latDeg)}, {formatLon(site.lonDeg)}</p>
      <p className="where">{whereOnMoon(site.latDeg, site.lonDeg)}</p>
      <details>
        <summary>About this place</summary>
        <p className="note">
          {kind}{' '}
          {site.terrain === 'modelled' ? 'The hills and crater rims around it come from NASA’s Moon height map.' : site.flatReason}
          {site.truncatedBins > 0 ? ` The height map ends before the horizon in ${String(Math.round((site.truncatedBins / 720) * 100))}% of directions, so far hills can be missing there.` : ''}
        </p>
        <p className="note">{site.catalog.notes}</p>
        <p className="note source-text">{site.catalog.source}</p>
      </details>
      </div>
    </header>
  );
}
