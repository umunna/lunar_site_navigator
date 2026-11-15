// @vitest-environment jsdom
// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBytes } from '../src/lib/data';
import { splashFinish, splashHide, splashProgress } from '../src/lib/splash';

function addSplash(): void {
  document.body.innerHTML =
    '<div id="splash"><div class="splash-track" role="progressbar" aria-valuenow="0"><div class="splash-fill"></div></div><p class="splash-percent">0%</p></div>';
}

const percent = (): number => Number(document.querySelector('.splash-track')?.getAttribute('aria-valuenow'));
const frames = (n: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, n * 20); });
/** Waits until the bar shows `want` percent. Fails after 10 s. A busy test machine can slow the animation, so there is no fixed wait. */
async function untilPercent(want: number): Promise<void> {
  for (let i = 0; i < 500 && percent() !== want; i++) {
    await frames(1);
  }
  expect(percent()).toBe(want);
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('loading screen [LSN-UI-014]', () => {
  it('does nothing and finishes at once when the page has no loading screen', async () => {
    splashProgress(0.5);
    await expect(splashFinish()).resolves.toBeUndefined();
    expect(() => { splashHide(); }).not.toThrow();
  });

  it('follows the download, never goes back, stops below 100% until the data is ready, then shows 100% and goes away', { timeout: 20_000 }, async () => {
    addSplash();
    splashProgress(0.5);
    await untilPercent(45);
    splashProgress(0.2);
    await frames(10);
    expect(percent()).toBe(45);
    splashProgress(1);
    await untilPercent(90);
    await frames(10);
    expect(percent()).toBe(90);
    await splashFinish();
    expect(percent()).toBe(100);
    expect(document.querySelector('.splash-percent')?.textContent).toBe('100%');
    splashHide();
    expect(document.getElementById('splash')?.classList.contains('splash-out')).toBe(true);
    await frames(60);
    expect(document.getElementById('splash')).toBeNull();
    expect(document.getElementById('root')?.classList.contains('page-enter') ?? false).toBe(false);
  });
});

describe('download with progress [LSN-UI-014]', () => {
  const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);

  it('gives the same bytes and reports a rising share that ends at 1 when the server gives the size', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(bytes, { headers: { 'content-length': '1000' } }))));
    const seen: number[] = [];
    const got = await fetchBytes('x.bin', (f) => { seen.push(f); });
    expect([...got]).toEqual([...bytes]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    expect(seen.every((f, i) => i === 0 || f >= (seen[i - 1] ?? 0))).toBe(true);
  });

  it('still downloads when the server gives no size, and reports an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(bytes))));
    const onProgress = vi.fn();
    expect((await fetchBytes('x.bin', onProgress)).length).toBe(1000);
    expect(onProgress).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('no', { status: 404 }))));
    await expect(fetchBytes('x.bin')).rejects.toThrow(/HTTP 404/);
  });
});
