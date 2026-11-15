# Requirements and how we verify them

This file lists what the planner must do. Each requirement has an ID, a method and a status.

**Method:**

- `T` test: an automatic test in `packages/*/test`.
- `A` analysis: a check that writes its result to `docs/VALIDATION.md`.
- `I` inspection: a person looks at a file or a result.
- `D` demonstration: a person operates the app.

**Status:** `implemented` means that the code exists and that the method was applied.

Each test has the ID of its requirement in its name, for example `describe('... [LSN-EPH-001]')`. The command `npm run trace` checks two things: each implemented requirement with method `T` has a test, and each ID in a test is in this file.

| ID | Requirement | Method | Status |
|---|---|---|---|
| LSN-EPH-001 | `ephemeris.bin` gives back the same numbers that were written. A reader rejects a wrong magic, version, size or CRC-32 and does not repair the data (`DATA-FILES.md`). | T | implemented |
| LSN-EPH-002 | The Sun and Earth data has 157,824 samples, 600 s apart, from 2026-11-01 00:00 UTC (three years, 1096 days). | T | implemented |
| LSN-EPH-003 | The pipeline accepts an answer from Horizons only if the number of rows, the date of each row and the distances of the Sun and the Earth are as expected. If not, it stops with an error. | T | implemented |
| LSN-GEO-001 | Direction (azimuth) is clockwise from north, from 0 to 360 degrees. Height (elevation) is above the level plane, from -90 to 90 degrees. | T | implemented |
| LSN-GEO-002 | The Sun and Earth directions from `ephemeris.bin` agree with Horizons to 0.001 degrees (Sun) and 0.01 degrees (Earth) (V1). | T+A | implemented |
| LSN-TIME-001 | Times are in UTC. The format does not change with the language or the time zone of the computer. | T | implemented |
| LSN-DEM-001 | The south-pole map projection gives the correct size of the height map (304.0 km at 80° S) and the orientation that V0 found. The inverse gives back the same point. | T | implemented |
| LSN-DEM-002 | The reader of the 80 m LOLA height map puts known craters on low ground and Mons Malapert on high ground, with one orientation only (V0). | A | implemented |
| LSN-DEM-003 | The V0 code finds a test crater only with the correct orientation, counts a feature outside the data as a failure, and reports the range of limits that leaves one orientation. | T | implemented |
| LSN-DEM-004 | The height-map reader gives the value at the centre of a point, interpolates between points, gives "no value" outside the map, and converts latitude and longitude with the south-pole projection. Tested on a small test file. | T | implemented |
| LSN-EVT-001 | The visible share of a disc is 0.5 when its centre is on the horizon, 1 when it is fully above, and 0 when it is fully below. The disc size comes from the distance (Sun about 0.27 degrees radius, Earth about 0.95 degrees). | T | implemented |
| LSN-EVT-002 | The time to the next sunset, sunrise, Earthset or Earthrise agrees with a slow, simple search. It is interpolated inside the 10-minute step. It is "none" when no event comes before the data ends. | T | implemented |
| LSN-EVT-003 | The numbers for a stay (share of time with the Sun in view, longest time in sunlight and in the dark, share with the Earth in view, longest time without the Earth, both, neither, longest time with neither, highest Sun, mean visible share of the Sun) are correct on a hand-made example. | T | implemented |
| LSN-EVT-004 | On the real data, the results agree with physics: a point in the middle of the near side sees the Earth almost always, a point in the middle of the far side never, and the Sun is up about half of the time at the equator. | T | implemented |
| LSN-SKY-001 | On a smooth sphere the horizon is at -acos(R / (R + h)) in each direction, for each latitude and observer height. | T | implemented |
| LSN-SKY-002 | A hill at a known direction, distance and height gives the correct horizon in that direction, and not in the opposite direction. If the terrain turns, the horizon turns with it. | T | implemented |
| LSN-SKY-003 | Half the step changes the horizon by less than 0.001 degrees on smooth terrain. An early stop of a ray does not change the result. A ray that reaches the edge of the data is reported. | T | implemented |
| LSN-SKY-004 | The horizon between two of the 720 directions is interpolated linearly, also across 360 degrees. | T | implemented |
| LSN-SKY-005 | `skylines.bin` has one horizon for each catalog place inside the height map, with the number of directions that the edge of the map cuts. | I | implemented |
| LSN-SKY-006 | `skylines.bin` gives back the same numbers that were written. A reader rejects a wrong magic, version, size or CRC-32. The writer refuses a double, empty or too long ID. | T | implemented |
| LSN-CAT-001 | Each catalog place has a source and a kind. The IDs are unique. A high point that we found is never named a landing site. The 13 NASA areas are listed, each with the reason if it is not in the app. The generator makes the positions from cited sources. | T+I | implemented |
| LSN-CAT-002 | The reader of the IAU Gazetteer gives the ID, name, centre, size and status of a feature, ignores rows with no position, and refuses a name that is not unique. | T | implemented |
| LSN-CAT-003 | The reader of the NASA Apollo page and the high-point search give correct results on the real page and on test terrain. They stop with an error if the page changes. | T | implemented |
| LSN-PLN-004 | The best value in a row is the highest or the lowest, as the row defines. Equal values are all marked. The start of a stay stays inside the data. | T | implemented |
| LSN-VAL-001 | A check with no result file is shown as "not run". | I | implemented |
| LSN-VAL-002 | The trace check reports a requirement with no test, a test ID that is not in this file, a double ID, and an empty requirements file. | T | implemented |
| LSN-VAL-003 | The result file of a group of automatic tests (V2, V4) comes from the real test results. It passes only if each requirement of the group has tests and all tests pass. | T | implemented |
| LSN-VAL-004 | The comparison with NASA's light map (V3) finds the correct pixel for a point, converts the raw numbers of the map to percent, refuses a value outside 0 to 1, and passes only if each place is inside the stated tolerance. | T | implemented |
| LSN-UI-001 | Numbers and times on the screen do not change with the language of the computer: durations, degrees with a true minus sign, N/S and E/W letters, spans of hours. | T | implemented |
| LSN-UI-002 | The picture of the horizon keeps the directions true and stretches the height 8 times, with the lowest ground just above the bottom edge. The Sun and the Earth are round marks of a fixed size with the centre at the true direction and height. A hidden Sun or Earth is a dashed outline with the word "hidden". The horizon closes at 360 degrees, and the dotted paths are cut at the edge. | T | implemented |
| LSN-UI-003 | The bars of the Compare places page follow the "in view" state exactly and are cut at the edges of the stay. | T | implemented |
| LSN-UI-004 | The link of the page keeps the place, the time and the page. A bad value in the link falls back to a good value. The link contains nothing personal. | T | implemented |
| LSN-UI-005 | The sentences on the screen come from the calculated numbers. They never use words for power, link or communication. | T | implemented |
| LSN-UI-006 | On the real data, the live position agrees with the stored track, and a sunset countdown ends where the Sun crosses the horizon. | T | implemented |
| LSN-UI-007 | The Sky view page, with the real data files, shows in this order: the place and the time, the three large numbers with the known values, the picture of the horizon with the time controls below it, and the next days in sentences with the table of numbers behind "Show the numbers". The place is changed on the Compare places page only. An Apollo site says that its horizon is flat. The About page lists the checks. The app loads when the list of checks is missing, and it reports a missing data file. | T | implemented |
| LSN-UI-008 | The picture of the horizon does not draw the hills again when only the time changes. | T | implemented |
| LSN-UI-009 | The built app has no errors in the browser console and no cut or overlapping parts, at computer width and at phone width. | D | implemented |
| LSN-UI-010 | The link also keeps the places to compare and the length of the stay. It keeps only known places (2 to 4) and refuses a length or a page that the app does not offer. | T | implemented |
| LSN-UI-011 | Each number of a stay has one definition and one "better" direction, used by the next-days card and the Compare table. The Compare table marks the best value, keeps equal values, and marks nothing when all values are equal. | T | implemented |
| LSN-UI-012 | The app calculates the track of a place one time and uses it again. It removes the track that was not used for the longest time. | T | implemented |
| LSN-UI-013 | With the real data: Compare places shows three places with the best values marked and keeps 2 to 4 places. Rover sim explains the simulation, plays the recording or shows the terrain picture if the recording is missing, says that the rover is simulated, and opens its place in Sky view. | T | implemented |
| LSN-UI-014 | The loading screen shows the LSN logo and an orange bar from 0 to 100%. The bar follows the real download of the data, never goes back, and reaches 100% only when the data is ready. The app appears behind the screen before the screen goes away. A download gives the same bytes with or without a known file size. | T | implemented |
| LSN-UI-015 | The small Moon picture puts the south pole at the bottom and the centre of the near side in the middle, and marks a place on the far side. One sentence says where the place is: the distance from the pole for a polar place, or the side and the half of the Moon for other places. | T | implemented |
| LSN-QA-001 | `tsc --strict` and ESLint (rules from the "Power of 10", `docs/STANDARDS.md`) report nothing. `npm run check` runs them with the tests and the trace. | I | implemented |
| LSN-CFG-001 | All dependencies have exact versions and `npm ci` installs them from the lock file. | I | implemented |
