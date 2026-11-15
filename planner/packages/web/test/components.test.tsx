// @vitest-environment jsdom
// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Panorama } from '../src/components/Panorama';
import { selectSite } from '../src/lib/data';
import { skyNow } from '../src/lib/live';
import { skylinePaths } from '../src/lib/panorama';
import type * as PanoramaModule from '../src/lib/panorama';
import { loadTestData } from './helpers';

vi.mock('../src/lib/panorama', async (importOriginal) => {
  const actual = await importOriginal<typeof PanoramaModule>();
  return { ...actual, skylinePaths: vi.fn(actual.skylinePaths) };
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('panorama redraw cost [LSN-UI-008]', () => {
  it('does not rebuild the terrain path when only the time changes, as during playback', () => {
    const data = loadTestData();
    const site = selectSite('haworth-high', data);
    const at = (idx: number) => skyNow(data.eph, site.latDeg, site.lonDeg, site.skyline, idx);
    const { rerender } = render(<Panorama site={site} now={at(1900)} eph={data.eph} timeIdx={1900} />);
    expect(vi.mocked(skylinePaths)).toHaveBeenCalledTimes(1);
    for (const idx of [1901, 1902.5, 1950, 2400]) {
      rerender(<Panorama site={site} now={at(idx)} eph={data.eph} timeIdx={idx} />);
    }
    expect(vi.mocked(skylinePaths)).toHaveBeenCalledTimes(1);
    // The Sun is hidden at the last time: a dashed outline with a label says so. There are no adjust controls.
    expect(screen.getByText('How to read this picture')).toBeTruthy();
    expect(screen.queryByText('Adjust the picture')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find the Sun' })).toBeNull();
  });
});
