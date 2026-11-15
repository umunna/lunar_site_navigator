// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findUnique, parseGazetteerHtml } from '../src/gazetteer/gazetteer';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'fixtures', 'gazetteer-haworth-row.html'), 'utf8');

describe('IAU Gazetteer parser [LSN-CAT-002]', () => {
  const features = parseGazetteerHtml(html);

  it('reads the real Haworth row: id, centre, size, coordinate system, status', () => {
    expect(features).toHaveLength(1);
    const f = features[0];
    expect(f?.id).toBe(14502);
    expect(f?.name).toBe('Haworth');
    expect(f?.centerLatDeg).toBe(-87.45);
    expect(f?.centerLonDeg).toBe(-5.17);
    expect(f?.diameterKm).toBeCloseTo(51.42, 6);
    expect(f?.northLatDeg).toBe(-86.6);
    expect(f?.westLonDeg).toBe(-24.55);
    expect(f?.coordSystem).toBe('Planetographic, +East, -180 - 180');
    expect(f?.featureType).toBe('Crater, craters');
    expect(f?.approval).toBe('Approved');
  });

  it('findUnique returns one match and throws on zero or several', () => {
    expect(findUnique(features, 'Haworth').id).toBe(14502);
    expect(() => findUnique(features, 'Nowhere')).toThrow(/found 0/);
    expect(() => findUnique([...features, ...features], 'Haworth')).toThrow(/found 2/);
  });

  it('skips rows without coordinates instead of inventing them', () => {
    expect(parseGazetteerHtml('<tr><td class="featureIDColumn right hidden">1</td></tr>')).toHaveLength(0);
  });
});
