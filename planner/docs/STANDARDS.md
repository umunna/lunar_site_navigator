# Standards that we applied

**We follow these practices. We do not have a certificate.** We took practices from NASA software standards and from an aerospace writing standard, and we applied them in a small form. We do not claim that the project complies with these standards. NASA and JPL have no connection with this project.

## 1. Which standards

| Source | What we took from it | How sure we are about the source |
|---|---|---|
| ASD-STE100, Simplified Technical English | The writing rules for all documents and for the text in the app: short sentences, active voice, one word for one thing, simple verb forms | We applied the rules by hand. We did not use a certified STE tool, and we did not check each word against the STE dictionary |
| NPR 7150.2, NASA Software Engineering Requirements | Requirements with IDs, a link from each requirement to its tests, records of each check, control of versions | We did not read the full text |
| NASA-STD-8739.8, Software Assurance and Software Safety | Independent checks, tests before trust | We did not read the full text |
| NASA-STD-7009, Standard for Models and Simulations | Check the code and check the data as two different steps. State the limits. | From memory of its purpose only |
| "Power of 10" rules (Holzmann, 2006) and the JPL coding standard | The coding rules in section 2 | From memory. Read the rules again before you cite them |

## 2. Coding rules (Power of 10, adapted to TypeScript)

| Rule | What we do | What enforces it |
|---|---|---|
| 1. Simple control flow, no recursion | No labels. No recursion: `fetch-ephemeris` uses a work list when it must divide a request | ESLint (labels), review (recursion) |
| 2. Each loop has a fixed upper limit | `while` and `do...while` are not permitted. Each retry has a maximum. Each horizon ray has a maximum number of steps | ESLint |
| 3. No new memory in the main loops | JavaScript cannot enforce this. The main loops write into arrays that exist before the loop starts | Convention |
| 4. Functions of 60 lines or less | Limit of 60 lines, complexity 15, depth 4. React components can have 100 lines, because their markup is long but simple | ESLint (not for tests) |
| 5. Assertions | `invariant()` and `assertRange()` in `packages/shared/src/assert.ts`. They stay in the built app | Convention |
| 6. Smallest scope | `const` by default. No new value for a parameter. No name that hides another name | ESLint |
| 7. Check inputs and results | Public functions check their inputs. Each promise has a handler. A parser stops with an error and does not return a bad number | ESLint, tests |
| 8. No code that is made while the program runs | `eval` is not permitted | ESLint |
| 9. Strict types | `strict` mode, no `any`, no forced non-null values | `tsc`, ESLint |
| 10. All warnings on | `tsc --strict` and ESLint with type rules. Zero warnings are permitted | `npm run check` |

## 3. Process

- **Requirements and trace.** `docs/REQUIREMENTS.md` gives each requirement an ID, a method and a status. Each test has an ID in its name. `npm run trace` fails if a requirement has no test, or if a test names a requirement that does not exist.
- **Records of checks.** Each check writes a file in `data/validation/`. The scripts make `docs/VALIDATION.md` from these files. A check with no file shows "not run". If we change a pass limit after we see a result, the report keeps the first result and says so (V0 is the example).
- **Control of versions.** All dependencies have exact versions, and `npm ci` installs them from the lock file. Each data file has a version number, a CRC-32 and a note about its source (`docs/DATA-FILES.md`).
- **Units.** Each number name has its unit (`Km`, `M`, `S`, `Deg`, `Rad`). Functions give and take degrees. Radians stay inside a function.
- **Code check and data check.** V1, V2 and V4 check the code. V0 and V3 check the data against NASA sources.
- **Same result on each computer.** The build scripts run on Windows and on Linux (WSL). They keep the raw answers of each source. The same raw answers give the same bytes.
- **Automatic checks on GitLab.** `.gitlab-ci.yml` runs `npm run check` and builds the app for each push.

## 4. What is missing

- No person other than the authors has reviewed the code. An AI assistant wrote much of it (`docs/AI-USE.md`). This is the largest gap.
- We do not measure test coverage. We check recursion by eye.
- There is no software class, no hazard analysis and no safety case. This is a planning demo. Do not present it as flight software.
- There is no automatic test in a real browser. We looked at the app by hand in one browser, at computer width and at phone width.
- We did not confirm the height reference (vertical datum) of the height map. A constant error in height changes the horizon very little.
