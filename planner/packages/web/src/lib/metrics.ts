// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// One definition of the window metrics for every screen: label, which direction is
// better, and formatting. Used by the next-days card and the Compare table.
import type { Better, WindowMetrics } from '@lsn/shared';
import { formatDeg, formatHoursSpan, formatPercent } from './format';

/** meanSunFraction is left out: it exists for the check against NASA's light maps, not for the screens. */
export type MetricKey = Exclude<keyof WindowMetrics, 'samples' | 'hours' | 'meanSunFraction'>;
type Unit = 'percent' | 'hours' | 'degrees';

export interface MetricRow {
  readonly key: MetricKey;
  readonly label: string;
  readonly better: Better;
  readonly unit: Unit;
}

export const METRIC_ROWS: readonly MetricRow[] = [
  { key: 'litPercent', label: 'Sun in view', better: 'higher', unit: 'percent' },
  { key: 'longestLitH', label: 'Longest time in sunlight', better: 'higher', unit: 'hours' },
  { key: 'longestDarkH', label: 'Longest time in the dark', better: 'lower', unit: 'hours' },
  { key: 'earthVisiblePercent', label: 'Earth in view', better: 'higher', unit: 'percent' },
  { key: 'longestEarthOutageH', label: 'Longest time without Earth in view', better: 'lower', unit: 'hours' },
  { key: 'bothPercent', label: 'Sun and Earth in view together', better: 'higher', unit: 'percent' },
  { key: 'neitherPercent', label: 'No Sun and no Earth in view', better: 'lower', unit: 'percent' },
  { key: 'longestNeitherH', label: 'Longest time with no Sun and no Earth', better: 'lower', unit: 'hours' },
  { key: 'maxSunElDeg', label: 'Highest the Sun gets above the horizon', better: 'higher', unit: 'degrees' },
];

export function formatMetric(row: MetricRow, m: WindowMetrics): string {
  const v = m[row.key];
  switch (row.unit) {
    case 'percent':
      return formatPercent(v, 1);
    case 'hours':
      return formatHoursSpan(v);
    case 'degrees':
      return formatDeg(v);
  }
}
