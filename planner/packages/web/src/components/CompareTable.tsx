// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement } from 'react';
import { bestIndices } from '@lsn/shared';
import type { WindowMetrics } from '@lsn/shared';
import { METRIC_ROWS, formatMetric } from '../lib/metrics';
import type { SiteSel } from '../lib/data';

interface Props {
  readonly sites: readonly SiteSel[];
  readonly metrics: readonly WindowMetrics[];
}

/** Best cells for one row, or none when every site ties (marking all of them says nothing). */
export function bestCells(values: readonly number[], better: 'higher' | 'lower'): Set<number> {
  const best = bestIndices(values, better, 1e-6);
  return new Set(best.length === values.length ? [] : best);
}

export function CompareTable({ sites, metrics }: Props): ReactElement {
  return (
    <div className="table-scroll">
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">What</th>
            {sites.map((s) => <th key={s.id} scope="col">{s.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {METRIC_ROWS.map((row) => {
            const best = bestCells(metrics.map((m) => m[row.key]), row.better);
            return (
              <tr key={row.key}>
                <th scope="row">
                  {row.label}
                  <span className="better-hint">{row.better === 'higher' ? 'higher is better' : 'lower is better'}</span>
                </th>
                {metrics.map((m, i) => (
                  <td key={sites[i]?.id ?? i} className={best.has(i) ? 'best' : undefined}>
                    {formatMetric(row, m)}
                    {best.has(i) ? <span className="best-tag">best</span> : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
