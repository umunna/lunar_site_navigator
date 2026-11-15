// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import type { ReactElement } from 'react';
import { ARTEMIS_REGIONS, ROVER_DEMO } from '@lsn/shared';
import type { AppData, ValidationEntry } from '../lib/data';

const SOURCES: readonly { name: string; what: string }[] = [
  { name: 'NASA JPL Horizons', what: 'NASA’s online service for the positions of the Sun, Earth and Moon. It tells us where the Sun and Earth are in the Moon’s sky, every 10 minutes for three years.' },
  { name: 'LOLA height map', what: 'A map of the height of the Moon’s ground near the south pole. A laser on NASA’s Lunar Reconnaissance Orbiter measured it. We use it to find the hills and crater rims that can hide the Sun or Earth.' },
  { name: 'IAU Gazetteer', what: 'The official list of names and positions of craters and mountains on the Moon.' },
  { name: 'NASA NSSDC', what: 'NASA’s space science archive. It gives the positions of the six Apollo landing sites.' },
];

const LIMITS: readonly string[] = [
  'The app shows only where the Sun and Earth are in the sky. Sunlight is necessary for solar panels, and a view of Earth is necessary for direct radio. The app does not calculate electrical power or radio quality.',
  'The south-pole places are high points that we found on the height map, and the area of our rover simulation. They are near the areas that NASA named for Artemis III, but they are not official landing sites.',
  'The hills are only as exact as the height map. One point on the map is 80 m wide, so smaller rocks and slopes are not included.',
  'Apollo sites and points that you type have no hills in the app. Their horizon is flat, and the app says so.',
  'NASA does not endorse this app. It is a student project, not a flight tool.',
];

function regionText(r: (typeof ARTEMIS_REGIONS)[number]): ReactElement | string {
  if (r.iauFeature !== null) return `High point near ${r.iauFeature}`;
  if (r.name === ROVER_DEMO.regionName) return 'The area of our rover simulation';
  return <span className="muted">Not included. {r.why}</span>;
}

function StatusCell({ status }: { status: ValidationEntry['status'] }): ReactElement {
  return <span className="status" data-status={status}>{status === 'not run' ? 'Not run' : status === 'pass' ? 'Pass' : 'Fail'}</span>;
}

export function About({ data, validation }: { data: AppData; validation: ValidationEntry[] }): ReactElement {
  return (
    <div className="about">
      <section className="panel prose">
        <h1>About</h1>
        <p>
          A crew or a robot that lands near the Moon’s south pole needs sunlight and a clear view of Earth. There, the Sun stays very low, so a hill or a crater
          rim can hide it for days. This app shows, for a place and a date, if the Sun and Earth are in view, how long they stay in view, and how other places and
          dates compare.
        </p>
        <h2>Where the data comes from</h2>
        <ul>
          {SOURCES.map((s) => <li key={s.name}><strong>{s.name}.</strong> {s.what}</li>)}
        </ul>
        <h2>What the app does not tell you</h2>
        <ul>
          {LIMITS.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>

      <section className="panel prose">
        <h2>Checks that we ran</h2>
        <p>Each check compares our results with an independent answer. A check marked “Not run” has no result, and we make no claim for it.</p>
        {validation.length === 0 ? (
          <p className="note">The list of checks could not be loaded.</p>
        ) : (
          <table className="validation">
            <thead>
              <tr><th scope="col">Check</th><th scope="col">What it compares</th><th scope="col">Result</th></tr>
            </thead>
            <tbody>
              {validation.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{v.id}</th>
                  <td>
                    {v.title}
                    {v.summary !== '' ? <span className="summary">{v.summary}</span> : null}
                  </td>
                  <td><StatusCell status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel prose">
        <h2>NASA’s 13 candidate areas for Artemis III</h2>
        <p>
          In 2022 NASA named 13 areas near the south pole, each about 15 × 15 km, and gave no exact positions. Where the name of an area points to a crater or a
          mountain, we use a high point near it. Connecting Ridge has the area of our rover simulation. We do not invent a position for the other areas.
        </p>
        <table className="regions">
          <thead>
            <tr><th scope="col">Area</th><th scope="col">In the app</th></tr>
          </thead>
          <tbody>
            {ARTEMIS_REGIONS.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{regionText(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel prose">
        <h2>Credits</h2>
        <ul>
          <li>Sun and Earth positions: NASA JPL Horizons. {data.ephemerisNote.split(';')[0]}.</li>
          <li>Height map: NASA LRO LOLA, Barker et al. 2023, Planetary Science Journal 4, 183, doi 10.3847/PSJ/acf3e1.</li>
          <li>Place names: IAU Gazetteer of Planetary Nomenclature (USGS). Apollo landing sites: NASA NSSDC.</li>
          <li>Parts of this code were written with an AI assistant (Claude, by Anthropic). See docs/AI-USE.md in the repository.</li>
          <li>Code: Apache License 2.0.</li>
        </ul>
      </section>
    </div>
  );
}
