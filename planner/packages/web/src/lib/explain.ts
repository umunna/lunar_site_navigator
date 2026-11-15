// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Plain sentences built from the computed numbers, nothing else.
// The wording stays with what the app calculates: where the Sun and Earth are in the sky.
// It never says that there is power or radio contact.
import { bestIndices } from '@lsn/shared';
import type { Better, WindowMetrics } from '@lsn/shared';
import type { BodyNow, Countdown } from './live';
import { formatDateUtc, formatDeg, formatDuration, formatHoursSpan, formatPercent, formatUtc } from './format';

export interface ExplainBodyInput {
  readonly name: 'Sun' | 'Earth';
  readonly body: BodyNow;
  readonly countdown: Countdown;
  /** Unix seconds of the last sample: "no event before" this date. */
  readonly dataEndUnixS: number;
  /** Horizon dip of a flat, smooth sphere for the observer, degrees (about -0.09). */
  readonly flatDipDeg: number;
}

function stateSentence(i: ExplainBodyInput): string {
  const { body, name } = i;
  const subject = name === 'Sun' ? 'The Sun' : 'Earth';
  const object = name === 'Sun' ? 'the Sun' : 'Earth';
  if (body.marginDeg > 0) {
    const clearance = body.elDeg - body.discRadiusDeg - body.skylineDeg;
    if (body.fraction >= 0.995) {
      return `${subject} is fully in view. Its lower edge is ${clearance.toFixed(2)}° above the horizon.`;
    }
    return `About ${formatPercent(body.fraction * 100)} of ${object} is in view. The horizon hides the rest.`;
  }
  if (body.elDeg + body.discRadiusDeg > i.flatDipDeg) {
    return `Hills hide ${object}. It is at ${formatDeg(body.elDeg)}, but the hills in that direction reach ${formatDeg(body.skylineDeg)}.`;
  }
  return `${subject} is below the horizon, at ${formatDeg(body.elDeg)}.`;
}

function eventName(name: 'Sun' | 'Earth', kind: 'set' | 'rise'): string {
  if (name === 'Sun') return kind === 'set' ? 'sunset' : 'sunrise';
  return kind === 'set' ? 'Earthset' : 'Earthrise';
}

function eventSentence(i: ExplainBodyInput): string {
  const { countdown: c, name } = i;
  const verb = c.kind === 'set' ? 'sets' : 'rises';
  const subject = name === 'Sun' ? 'The Sun' : 'Earth';
  if (c.crossing === null || c.atUnixS === null) {
    return `There is no ${eventName(name, c.kind)} before our data ends on ${formatDateUtc(i.dataEndUnixS)}.`;
  }
  return `${subject} ${verb} in ${formatDuration(c.crossing.secondsFromStart)}, at ${formatUtc(c.atUnixS)}.`;
}

export function explainBody(i: ExplainBodyInput): string {
  return `${stateSentence(i)} ${eventSentence(i)}`;
}

function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** Which place leads on sunlight, on Earth in view, and on the shortest time with neither. */
export function explainCompare(names: readonly string[], metrics: readonly WindowMetrics[]): string[] {
  if (metrics.length === 0) return [];
  const lead = (key: 'litPercent' | 'earthVisiblePercent' | 'longestNeitherH', better: Better): string[] =>
    bestIndices(metrics.map((m) => m[key]), better, 1e-6).map((i) => names[i] ?? '');
  const lit = lead('litPercent', 'higher');
  const earth = lead('earthVisiblePercent', 'higher');
  const neither = lead('longestNeitherH', 'lower');
  const first = metrics[bestIndices(metrics.map((m) => m.litPercent), 'higher')[0] ?? 0];
  const firstE = metrics[bestIndices(metrics.map((m) => m.earthVisiblePercent), 'higher')[0] ?? 0];
  const firstN = metrics[bestIndices(metrics.map((m) => m.longestNeitherH), 'lower')[0] ?? 0];
  return [
    `Most sunlight: ${nameList(lit)} (${formatPercent(first?.litPercent ?? 0)} of the time).`,
    `Most time with Earth in view: ${nameList(earth)} (${formatPercent(firstE?.earthVisiblePercent ?? 0)} of the time).`,
    (firstN?.longestNeitherH ?? 0) === 0
      ? `${nameList(neither)} always ${neither.length > 1 ? 'have' : 'has'} the Sun or Earth in view in these days.`
      : `Shortest time with no Sun and no Earth: ${nameList(neither)} (${formatHoursSpan(firstN?.longestNeitherH ?? 0)} at most).`,
  ];
}

/** Plain sentences for the "next days" card. */
export function explainMetrics(m: WindowMetrics): string[] {
  const days = Math.round(m.hours / 24);
  return [
    `In these ${String(days)} days the Sun is in view ${formatPercent(m.litPercent)} of the time. The longest time in sunlight is ${formatHoursSpan(m.longestLitH)}. The longest time in the dark is ${formatHoursSpan(m.longestDarkH)}.`,
    `Earth is in view ${formatPercent(m.earthVisiblePercent)} of the time. The longest time without Earth in view is ${formatHoursSpan(m.longestEarthOutageH)}.`,
    m.neitherPercent > 0
      ? `For ${formatPercent(m.neitherPercent)} of the time there is no Sun and no Earth in view, up to ${formatHoursSpan(m.longestNeitherH)} in one stretch.`
      : 'The Sun or Earth is always in view in these days.',
  ];
}
