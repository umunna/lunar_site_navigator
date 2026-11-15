# Data files

The app reads two binary files from `planner/data/`. This document is the definition of their format.

| File | Contents | Made by | Read by |
|---|---|---|---|
| `ephemeris.bin` | The position of the Sun and the Earth as seen from the Moon, every 10 minutes for three years | `npm run fetch-ephemeris` | the app, `validate:v1`, `validate:v3` |
| `skylines.bin` | The horizon of each south-pole place: the height of the hills in 720 directions | `npm run build-skylines` | the app, `validate:v3` |

Rules for both files:

- The byte order is little-endian. The code stops on a big-endian computer.
- A reader must reject a file that fails a check. A reader must not repair a file. Build a damaged file again from its source.
- If you change a field, a unit or the order of fields, you must increase the version number. A reader rejects a version that it does not know.
- If this document and the code disagree, that is a defect. Correct both.

## 1. `ephemeris.bin`

The code for this format is in `packages/shared/src/ephemeris.ts`.

### 1.1 Conventions

- Units: kilometres for vectors, seconds for time.
- Time: UTC, as JPL Horizons prints it. For dates in the future, Horizons keeps the last known leap second.
- Frame: the centre of the Moon is the origin. The axes turn with the Moon (Horizons name: `MOON_ME`, mean Earth and polar axis). East longitude is positive. The LOLA height map uses the same frame.
- Numbers: 32-bit floats for vectors, a 64-bit float for the start time.

### 1.2 Layout, version 1

| Offset | Size | Type | Field | Value or meaning |
|---|---|---|---|---|
| 0 | 4 | ASCII | magic | `LSNE` |
| 4 | 2 | u16 | version | `1` |
| 6 | 2 | u16 | reserved | `0` |
| 8 | 8 | f64 | t0 | time of the first sample, seconds since 1970-01-01 UTC |
| 16 | 4 | u32 | step | seconds between samples (`600`) |
| 20 | 4 | u32 | count | number of samples (`157824`) |
| 24 | 4 | u32 | noteLen | length of the note in bytes, 4096 at most |
| 28 | 4 | u32 | crc | CRC-32 of the sample bytes |
| 32 | noteLen | UTF-8 | note | where the data comes from: source, query, frame, time span |
| dataOffset | count × 24 | f32 × 6 | samples | for each sample: Sun x, y, z, then Earth x, y, z, in km |

`dataOffset = ceil((32 + noteLen) / 4) × 4`. The file size must be `dataOffset + count × 24`.

### 1.3 Meaning of a sample

- Sun vector: from the centre of the Moon to the centre of the Sun.
- Earth vector: from the centre of the Moon to the centre of the Earth.
- Between two samples, the app interpolates the vectors linearly. Check V1 measures the error of this step.

### 1.4 Checks that a reader must do

1. The length is 32 bytes or more. The magic is `LSNE`. The version is `1`. The reserved field is `0`.
2. `noteLen` is 4096 or less. The file size is correct.
3. The CRC-32 of the sample bytes is equal to `crc`.

### 1.5 The file in this repository

3,788,172 bytes, 157,824 samples, from 2026-11-01 00:00 UTC to 2029-10-31 23:50 UTC. Horizons used its DE441 solution.

## 2. `skylines.bin`

The code for this format is in `packages/shared/src/skylinefile.ts`.

### 2.1 Conventions

- Direction (azimuth): degrees, clockwise from north. Sample `j` is at `j × 360 / bins` degrees. Between two samples, the app interpolates linearly, also across 360 degrees.
- Height of the horizon (elevation): degrees above the level plane at the observer. On a smooth Moon with no hills, an observer 2 m above the ground sees the horizon at -0.087 degrees.
- Ground height: metres above a sphere with a radius of 1737.4 km.

### 2.2 Layout, version 1

Header, 32 bytes:

| Offset | Size | Type | Field |
|---|---|---|---|
| 0 | 4 | ASCII | magic `LSNK` |
| 4 | 2 | u16 | version `1` |
| 6 | 2 | u16 | bins (`720`) |
| 8 | 4 | u32 | siteCount |
| 12 | 4 | f32 | observerHeightM: height of the observer above the ground, metres |
| 16 | 4 | f32 | stepM: step along each direction, metres (the size of one point of the height map) |
| 20 | 4 | u32 | recordBytes = 64 + 4 × bins |
| 24 | 4 | u32 | noteLen, 4096 at most |
| 28 | 4 | u32 | CRC-32 of all record bytes |

Then the note (UTF-8), with zeros added until the next multiple of 4 bytes. The note gives the name of the height-map file, the start of its SHA-256 value, the citation, the observer height and the step.

Each record:

| Offset | Size | Type | Field |
|---|---|---|---|
| 0 | 32 | UTF-8, filled with zeros | id of the place, 1 to 32 bytes, unique |
| 32 | 8 | f64 | latitude, degrees |
| 40 | 8 | f64 | east longitude, degrees |
| 48 | 4 | f32 | ground height at the place, metres |
| 52 | 4 | u32 | truncatedBins: number of directions where the height map ends before the horizon is sure |
| 56 | 8 | | reserved, zero |
| 64 | 4 × bins | f32 | height of the horizon, degrees |

The file size must be `dataOffset + siteCount × recordBytes`, with `dataOffset = ceil((32 + noteLen) / 4) × 4`.

### 2.3 Checks that a reader must do

Length, magic, version, `recordBytes` against `bins`, file size, CRC-32.

### 2.4 Limits of the data

- One point of the height map is 80 m wide. Smaller rocks and slopes are not in the horizon.
- The height map covers 80° S to 90° S. Near its edge, some directions are not complete (`truncatedBins`).
- The app takes the height of the hills at the centre of the Sun or Earth disc. The Sun disc is about 0.5 degrees wide.

### 2.5 The file in this repository

23,940 bytes, 8 places, observer 2 m above the ground, step 80 m.
