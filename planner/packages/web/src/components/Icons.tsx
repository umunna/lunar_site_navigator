// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
// Small authored icons, one stroke weight, drawn on a 16 px grid.
import type { ReactElement } from 'react';

const common = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false } as const;

export function PlayIcon(): ReactElement {
  return (
    <svg {...common}>
      <path d="M4.5 3v10l8-5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon(): ReactElement {
  return (
    <svg {...common}>
      <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" />
    </svg>
  );
}

export function StepBackIcon(): ReactElement {
  return (
    <svg {...common}>
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StepForwardIcon(): ReactElement {
  return (
    <svg {...common}>
      <path d="m6 3.5 4.5 4.5L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The Sun: a solid disc. Paired with a ring for Earth so the two never rely on colour alone. */
export function SunMark(): ReactElement {
  return (
    <svg {...common} className="mark mark-sun">
      <circle cx="8" cy="8" r="5.5" fill="currentColor" />
    </svg>
  );
}

export function EarthMark(): ReactElement {
  return (
    <svg {...common} className="mark mark-earth">
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
