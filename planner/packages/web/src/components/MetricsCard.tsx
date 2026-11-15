// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement } from 'react';
import type { WindowMetrics } from '@lsn/shared';
import { explainMetrics } from '../lib/explain';
import { formatDateUtc } from '../lib/format';
import { METRIC_ROWS, formatMetric } from '../lib/metrics';

interface Props {
  readonly metrics: WindowMetrics;
  readonly fromUnixS: number;
  readonly days: number;
}

export function MetricsCard({ metrics, fromUnixS, days }: Props): ReactElement {
  return (
    <section className="panel metrics" aria-label={`Next ${String(days)} days`}>
      <h2>Next {String(days)} days from {formatDateUtc(fromUnixS)}</h2>
      <div className="explain">
        {explainMetrics(metrics).map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
      <details>
        <summary>Show the numbers</summary>
        <table>
          <tbody>
            {METRIC_ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{formatMetric(r, metrics)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
