// @vitest-environment jsdom
// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
//
// The whole app rendered with the real data files. Layout and real-browser behaviour are
// not covered here (LSN-UI-009); this catches thrown errors, wrong wiring and wrong numbers.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { loadValidationIndex } from '../src/lib/data';
import { dataBytes, dataText } from './helpers';

const HASH = '#site=haworth-high&t=2026-11-14T16:20&view=site';

type IndexMode = 'real' | 'html' | 'network-error' | 'missing';

function stubFetch(index: IndexMode): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string): Promise<Response> => {
      if (url.endsWith('ephemeris.bin')) return Promise.resolve(new Response(dataBytes('ephemeris.bin').slice().buffer));
      if (url.endsWith('skylines.bin')) return Promise.resolve(new Response(dataBytes('skylines.bin').slice().buffer));
      if (url.endsWith('validation/index.json')) {
        if (index === 'network-error') return Promise.reject(new TypeError('Failed to fetch'));
        if (index === 'missing') return Promise.resolve(new Response('not found', { status: 404 }));
        if (index === 'html') return Promise.resolve(new Response('<!doctype html><html></html>', { status: 200 }));
        return Promise.resolve(new Response(dataText('validation/index.json')));
      }
      return Promise.resolve(new Response('unexpected', { status: 500 }));
    }),
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  window.location.hash = HASH;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('app render on the real data [LSN-UI-007]', () => {
  it('shows the place, the three readouts with the known numbers, the view of the horizon with the time controls, and the next days', async () => {
    stubFetch('real');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Haworth rim (high point)' })).toBeTruthy();
    expect(screen.getByText('Sun height above level ground')).toBeTruthy();
    expect(screen.getByText('+0.04°')).toBeTruthy();
    expect(screen.getByText('Sun sets in')).toBeTruthy();
    expect(screen.getByText('5 d 0 h 39 min')).toBeTruthy();
    expect(screen.getByText('Earth rises in')).toBeTruthy();
    expect(screen.getByText('6 d 20 h 51 min')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^View from Haworth/ })).toBeTruthy();
    expect(screen.getByLabelText('Date and time (UTC)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Next 14 days from 2026-11-14' })).toBeTruthy();
    expect(screen.getByText(/The hills and crater rims around it come from NASA’s Moon height map/)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says what each of the three numbers means, says the next days in plain sentences, with the numbers one click away', async () => {
    stubFetch('real');
    render(<App />);
    await screen.findByRole('heading', { name: 'Haworth rim (high point)' });
    expect(screen.getByText('The Sun is in view. Sunlight reaches this place now.')).toBeTruthy();
    expect(screen.getByText('This place has sunlight for this long. Then the dark starts.')).toBeTruthy();
    expect(screen.getByText('Earth is out of view for this long. Then it comes back into direct view.')).toBeTruthy();
    expect(screen.getByText(/^In these 14 days the Sun is in view 40% of the time/)).toBeTruthy();
    expect(screen.getByText('Show the numbers')).toBeTruthy();
    expect(screen.getByText('40.3%')).toBeTruthy();
  });

  it('the place is changed on Compare places, and an Apollo site says that its horizon is flat', async () => {
    stubFetch('real');
    render(<App />);
    await screen.findByRole('heading', { name: 'Haworth rim (high point)' });
    expect(screen.queryByLabelText('Place on the Moon')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change place' }));
    fireEvent.change(screen.getByLabelText(/^Add a place/), { target: { value: 'apollo-11' } });
    const openButtons = screen.getAllByRole('button', { name: 'Open in Sky view' });
    const last = openButtons[openButtons.length - 1];
    if (last === undefined) throw new Error('no place to open');
    fireEvent.click(last);
    expect(await screen.findByRole('heading', { name: 'Apollo 11 landing site' })).toBeTruthy();
    expect(screen.getByText(/outside NASA’s south-pole height map.*The horizon is flat/)).toBeTruthy();
  });

  it('About lists every check from the validation index with its result', async () => {
    stubFetch('real');
    render(<App />);
    await screen.findByRole('heading', { name: 'Haworth rim (high point)' });
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.getByText('V0')).toBeTruthy();
    const index = JSON.parse(dataText('validation/index.json')) as { status: string }[];
    expect(screen.queryAllByText('Not run')).toHaveLength(index.filter((e) => e.status === 'not run').length);
    expect(screen.getAllByText('Pass')).toHaveLength(index.filter((e) => e.status === 'pass').length);
  });

  it.each<IndexMode>(['html', 'network-error', 'missing'])('still loads when the optional validation index is unusable (%s)', async (mode) => {
    stubFetch(mode);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Haworth rim (high point)' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByText('The list of checks could not be loaded.')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says so, plainly, when a required data file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))));
    render(<App />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('The data files could not be loaded')).toBeTruthy();
  });
});

describe('Compare places and Rover sim pages on the real data [LSN-UI-013]', () => {
  it('Compare shows three places side by side with best values marked, and keeps between two and four places', async () => {
    stubFetch('real');
    render(<App />);
    await screen.findByRole('heading', { name: 'Haworth rim (high point)' });
    fireEvent.click(screen.getByRole('button', { name: 'Compare places' }));
    expect(screen.getByRole('heading', { name: 'Side by side' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^When the Sun and Earth are in view at Haworth rim \(high point\), Shackleton rim \(high point\), Mons Malapert \(summit\)/ })).toBeTruthy();
    expect(screen.getAllByText('best').length).toBeGreaterThan(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Shackleton rim (high point)' }));
    const removes = screen.getAllByRole('button', { name: /^Remove / });
    expect(removes).toHaveLength(2);
    expect(removes.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Add a place/), { target: { value: 'apollo-11' } });
    expect(screen.getByRole('columnheader', { name: 'Apollo 11 landing site' })).toBeTruthy();
    expect(screen.getByText('Apollo 11 landing site (flat horizon)')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Rover sim explains the simulation, shows the picture when the recording is missing, and opens its place in Sky view', async () => {
    stubFetch('real');
    render(<App />);
    await screen.findByRole('heading', { name: 'Haworth rim (high point)' });
    fireEvent.click(screen.getByRole('button', { name: 'Rover sim' }));
    expect(screen.getByRole('heading', { name: 'Rover simulation at Connecting Ridge' })).toBeTruthy();
    expect(screen.getByText('Position error at the end')).toBeTruthy();
    expect(screen.getByText(/The rover is simulated, not real/)).toBeTruthy();
    fireEvent.error(screen.getByLabelText('Recording of one run of the rover simulation'));
    expect(screen.getByRole('img', { name: /^Map of the simulation area/ })).toBeTruthy();
    expect(screen.getByText(/The recording of the run is not in the app yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See the Sun and Earth at this place' }));
    expect(await screen.findByRole('heading', { name: 'Connecting Ridge (rover simulation area)' })).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('optional validation index loader [LSN-UI-007]', () => {
  it('gives an empty list for every failure and the list for a good file', async () => {
    stubFetch('html');
    expect(await loadValidationIndex('./')).toEqual([]);
    stubFetch('network-error');
    expect(await loadValidationIndex('./')).toEqual([]);
    stubFetch('missing');
    expect(await loadValidationIndex('./')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"not":"a list"}'))));
    expect(await loadValidationIndex('./')).toEqual([]);
    stubFetch('real');
    expect((await loadValidationIndex('./')).length).toBe(5);
  });
});
