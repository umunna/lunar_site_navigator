// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement } from 'react';
import type { View } from '../lib/state';

interface Props {
  readonly view: View;
  readonly onView: (v: View) => void;
}

const TABS: readonly { id: View; label: string }[] = [
  { id: 'site', label: 'Sky view' },
  { id: 'compare', label: 'Compare places' },
  { id: 'rover', label: 'Rover sim' },
  { id: 'about', label: 'About' },
];

/**
 * The LSN wordmark: three wide letters and one orange arc that rises through them.
 * The arc is the path of the low Sun over the horizon, the subject of the app.
 */
function Logo(): ReactElement {
  return (
    <svg className="logo" width="96" height="25" viewBox="0 0 132 34" role="img" aria-label="LSN">
      <g className="logo-letters">
        <path d="M5 4 V28 H30" />
        <path d="M74 4 H50 Q42 4 42 10 Q42 16 50 16 H66 Q74 16 74 22 Q74 28 66 28 H42" />
        <path d="M88 28 V4 L114 28 V4" />
      </g>
      <path className="logo-arc" d="M30 32 Q92 31 130 3" />
    </svg>
  );
}

export function TopBar({ view, onView }: Props): ReactElement {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span className="brand-sub">Lunar Site Navigator</span>
      </div>
      <nav className="tabs" aria-label="Pages">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="tab" aria-current={view === t.id ? 'page' : undefined} onClick={() => { onView(t.id); }}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
