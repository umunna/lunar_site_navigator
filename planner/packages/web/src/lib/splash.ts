// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The loading screen. Its markup and styles are in index.html, so the browser shows it
// before any script runs. This module moves the orange bar from 0 to 100% with the real
// download of the data, and removes the screen when the app is on the page behind it.
// Without the #splash element (in tests) every function does nothing.

/** The bar stops here until the data is ready, so 100% always means "ready". */
const HOLD_AT = 0.9;
/**
 * The bar needs at least this long to go from 0 to 100%, also when the data is already in
 * the browser's store. A slow download makes it longer, never shorter.
 */
export const SPLASH_RUN_MS = 3500;
/** Length of the handover: the loading screen fades while the page settles into place. */
const FADE_MS = 900;
/** Largest time step that one frame can add, so a sleeping tab does not jump ahead. */
const MAX_FRAME_MS = 100;

interface SplashState {
  target: number;
  shown: number;
  running: boolean;
  lastMs: number;
  waiting: (() => void)[];
}

const state: SplashState = { target: 0, shown: 0, running: false, lastMs: 0, waiting: [] };

function root(): HTMLElement | null {
  return document.getElementById('splash');
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function paint(el: HTMLElement): void {
  const percent = Math.round(state.shown * 100);
  const bar = el.querySelector<HTMLElement>('.splash-fill');
  const text = el.querySelector<HTMLElement>('.splash-percent');
  const track = el.querySelector<HTMLElement>('.splash-track');
  if (bar !== null) bar.style.transform = `scaleX(${state.shown.toFixed(4)})`;
  if (text !== null) text.textContent = `${String(percent)}%`;
  if (track !== null) track.setAttribute('aria-valuenow', String(percent));
}

function settle(): void {
  if (state.shown < 1) return;
  const waiting = state.waiting;
  state.waiting = [];
  waiting.forEach((resolve) => { resolve(); });
}

function frame(): void {
  const el = root();
  if (el === null) {
    state.shown = state.target;
    state.running = false;
    settle();
    return;
  }
  const now = performance.now();
  const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - state.lastMs));
  state.lastMs = now;
  state.shown = reducedMotion() ? state.target : Math.min(state.target, state.shown + dt / SPLASH_RUN_MS);
  paint(el);
  if (state.shown < state.target) {
    requestAnimationFrame(frame);
    return;
  }
  state.running = false;
  settle();
}

function start(): void {
  if (state.running) return;
  state.running = true;
  state.lastMs = performance.now();
  requestAnimationFrame(frame);
}

/** Share of the data that is loaded, 0 to 1. The bar never goes back. */
export function splashProgress(fraction: number): void {
  if (root() === null || !Number.isFinite(fraction)) return;
  state.target = Math.max(state.target, Math.min(Math.max(fraction, 0), 1) * HOLD_AT);
  start();
}

/** Runs the bar to 100%. The promise resolves when the bar shows 100%. */
export function splashFinish(): Promise<void> {
  if (root() === null) return Promise.resolve();
  state.target = 1;
  return new Promise((resolve) => {
    state.waiting.push(resolve);
    start();
  });
}

/**
 * The handover. The loading screen fades out and grows a little, and the page behind it
 * comes into focus and settles. Call it when the page behind the screen is drawn.
 */
export function splashHide(): void {
  const el = root();
  if (el === null) return;
  const page = document.getElementById('root');
  el.classList.add('splash-out');
  page?.classList.add('page-enter');
  setTimeout(() => {
    el.remove();
    page?.classList.remove('page-enter');
  }, reducedMotion() ? 0 : FADE_MS);
}
