// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement, ReactNode } from 'react';
import { EarthMark, SunMark } from './Icons';
import { explainBody } from '../lib/explain';
import { formatDeg, formatDuration, formatPercent, formatUtc } from '../lib/format';
import type { BodyNow, Countdown, Countdowns, SkyNow } from '../lib/live';

interface ItemProps {
  readonly mark: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  /** What the number means for a lander at this place, in one plain sentence. */
  readonly meaning: string;
  readonly state: 'up' | 'down' | 'none';
}

function Item({ mark, label, value, detail, meaning, state }: ItemProps): ReactElement {
  return (
    <div className="readout" data-state={state}>
      <dt>
        {mark}
        {label}
      </dt>
      <dd className="readout-value">{value}</dd>
      <dd className="readout-meaning">{meaning}</dd>
      <dd className="readout-detail">{detail}</dd>
    </div>
  );
}

function eventLabel(name: 'Sun' | 'Earth', c: Countdown): string {
  if (name === 'Sun') return c.kind === 'set' ? 'Sun sets in' : 'Sun rises in';
  return c.kind === 'set' ? 'Earth sets in' : 'Earth rises in';
}

/** What the next rise or set means at this place. It says what is in view, never that power or radio works. */
function eventMeaning(name: 'Sun' | 'Earth', c: Countdown, known: boolean): string {
  if (name === 'Sun') {
    if (!known) return c.kind === 'set' ? 'Sunlight stays here for as long as our data goes.' : 'This place stays dark for as long as our data goes.';
    return c.kind === 'set' ? 'This place has sunlight for this long. Then the dark starts.' : 'This place is dark for this long. Then sunlight comes back.';
  }
  if (!known) return c.kind === 'set' ? 'Earth stays in view for as long as our data goes.' : 'Earth stays out of view for as long as our data goes.';
  return c.kind === 'set' ? 'Earth is in direct view for this long. Then hills or the horizon hide it.' : 'Earth is out of view for this long. Then it comes back into direct view.';
}

function eventItem(name: 'Sun' | 'Earth', c: Countdown, endLabel: string): ItemProps {
  const mark = name === 'Sun' ? <SunMark /> : <EarthMark />;
  const label = eventLabel(name, c);
  if (c.crossing === null || c.atUnixS === null) {
    return { mark, label, value: 'not soon', detail: `not before our data ends, ${endLabel}`, meaning: eventMeaning(name, c, false), state: 'none' };
  }
  return { mark, label, value: formatDuration(c.crossing.secondsFromStart), detail: formatUtc(c.atUnixS), meaning: eventMeaning(name, c, true), state: c.kind === 'set' ? 'up' : 'down' };
}

function elevationDetail(b: BodyNow): string {
  const up = b.marginDeg > 0;
  if (!up) return `hidden: the horizon there is at ${formatDeg(b.skylineDeg)}`;
  return `${formatPercent(b.fraction * 100)} of the Sun is in view`;
}

interface Props {
  readonly now: SkyNow;
  readonly cds: Countdowns;
  readonly dataEndUnixS: number;
  readonly flatDipDeg: number;
}

export function Readouts({ now, cds, dataEndUnixS, flatDipDeg }: Props): ReactElement {
  const endLabel = formatUtc(dataEndUnixS).slice(0, 10);
  const sunEl: ItemProps = {
    mark: <SunMark />,
    label: 'Sun height above level ground',
    value: formatDeg(now.sun.elDeg),
    detail: elevationDetail(now.sun),
    meaning: now.sun.marginDeg > 0 ? 'The Sun is in view. Sunlight reaches this place now.' : 'The Sun is hidden. This place is in the dark now.',
    state: now.sun.marginDeg > 0 ? 'up' : 'down',
  };
  return (
    <section className="readouts" aria-label="At this date and time">
      <dl>
        <Item {...sunEl} />
        <Item {...eventItem('Sun', cds.sun, endLabel)} />
        <Item {...eventItem('Earth', cds.earth, endLabel)} />
      </dl>
      <details>
        <summary>More detail</summary>
        <div className="explain">
          <p>{explainBody({ name: 'Sun', body: now.sun, countdown: cds.sun, dataEndUnixS, flatDipDeg })}</p>
          <p>{explainBody({ name: 'Earth', body: now.earth, countdown: cds.earth, dataEndUnixS, flatDipDeg })}</p>
        </div>
      </details>
    </section>
  );
}
