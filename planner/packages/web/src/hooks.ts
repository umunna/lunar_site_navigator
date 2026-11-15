// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { loadAppData, loadValidationIndex } from './lib/data';
import type { AppData, ValidationEntry } from './lib/data';
import { splashFinish, splashHide, splashProgress } from './lib/splash';
import { clampTime, toHash } from './lib/state';
import type { AppState, TimeRange } from './lib/state';

export type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: AppData; readonly validation: ValidationEntry[] };

/**
 * Loads ephemeris.bin, skylines.bin and the validation index once. The loading screen follows
 * the download. The app appears only when its bar shows 100%, and then the screen fades out.
 */
export function useAppData(): Load {
  const [state, setState] = useState<Load>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL;
    Promise.all([loadAppData(base, splashProgress), loadValidationIndex(base)])
      .then(async ([data, validation]) => {
        await splashFinish();
        if (!cancelled) setState({ status: 'ready', data, validation });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // After the app (or the error message) is drawn, the loading screen goes away.
  useEffect(() => {
    if (state.status !== 'loading') splashHide();
  }, [state.status]);
  return state;
}

/** Width of an element in CSS pixels, kept current with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(el.clientWidth);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/** Advances time while `playing`, `secondsPerSecond` of simulated time per real second. Stops at the end of the data. */
export function usePlayback(
  playing: boolean,
  secondsPerSecond: number,
  range: TimeRange,
  setTime: (update: (t: number) => number) => void,
): void {
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setTime((t) => clampTime(t + dt * secondsPerSecond, range));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, secondsPerSecond, range, setTime]);
}

/** Writes the shareable state into the URL hash, but not on every frame of a running animation. */
export function useHashSync(state: AppState, playing: boolean): void {
  useEffect(() => {
    if (playing) return;
    const hash = toHash(state);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [state, playing]);
}
