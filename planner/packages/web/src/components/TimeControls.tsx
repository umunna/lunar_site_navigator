// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement } from 'react';
import { LUNAR_DAY_DAYS, SECONDS_PER_DAY } from '@lsn/shared';
import { PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from './Icons';
import { fromUtcInput, toUtcInput } from '../lib/format';

export const SPEEDS: readonly { label: string; secondsPerSecond: number }[] = [
  { label: '1 hour per second', secondsPerSecond: 3600 },
  { label: '6 hours per second', secondsPerSecond: 6 * 3600 },
  { label: '1 day per second', secondsPerSecond: SECONDS_PER_DAY },
  { label: '3 days per second', secondsPerSecond: 3 * SECONDS_PER_DAY },
];

interface Props {
  readonly timeUnixS: number;
  readonly startUnixS: number;
  readonly endUnixS: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly onTime: (t: number) => void;
  readonly onPlaying: (p: boolean) => void;
  readonly onSpeed: (s: number) => void;
}

export function TimeControls(p: Props): ReactElement {
  const jump = (days: number): void => {
    p.onTime(Math.min(p.endUnixS, Math.max(p.startUnixS, p.timeUnixS + days * SECONDS_PER_DAY)));
  };
  const atEnd = p.timeUnixS >= p.endUnixS;
  return (
    <div className="time-controls">
      <label className="field">
        <span>Date and time (UTC)</span>
        <input
          type="datetime-local"
          value={toUtcInput(p.timeUnixS)}
          min={toUtcInput(p.startUnixS)}
          max={toUtcInput(p.endUnixS)}
          onChange={(e) => {
            const t = fromUtcInput(e.target.value);
            if (!Number.isNaN(t)) p.onTime(Math.min(p.endUnixS, Math.max(p.startUnixS, t)));
          }}
        />
      </label>
      <div className="transport" role="group" aria-label="Move in time">
        <button type="button" className="btn" onClick={() => { jump(-LUNAR_DAY_DAYS); }} title="Back one lunar day: one full cycle of light and dark on the Moon">
          <StepBackIcon /> 29.5 days
        </button>
        <button type="button" className="btn" onClick={() => { jump(-1); }}>
          <StepBackIcon /> 1 day
        </button>
        <button type="button" className="btn btn-primary" aria-pressed={p.playing} onClick={() => { p.onPlaying(!p.playing && !atEnd); }}>
          {p.playing ? <PauseIcon /> : <PlayIcon />} {p.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn" onClick={() => { jump(1); }}>
          1 day <StepForwardIcon />
        </button>
        <button type="button" className="btn" onClick={() => { jump(LUNAR_DAY_DAYS); }} title="Forward one lunar day: one full cycle of light and dark on the Moon">
          29.5 days <StepForwardIcon />
        </button>
      </div>
      <label className="field">
        <span>Play speed</span>
        <select value={p.speed} onChange={(e) => { p.onSpeed(Number(e.target.value)); }}>
          {SPEEDS.map((s) => (
            <option key={s.secondsPerSecond} value={s.secondsPerSecond}>{s.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
