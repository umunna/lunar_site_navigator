# Use of AI in this project

An AI assistant wrote parts of the planner: **Claude (Anthropic), used through Claude Code**. This includes source code, tests, build scripts and documents in `planner/` and the configuration files at the top of the repository. Each source file has a line at its top that says so.

The NASA Space Apps rules ask teams to say where they used AI. This file is that statement for the planner. The rover simulation has its own notes in `rover-slam/README.md`.

## What the AI did not do

- It did not make data. The positions of the Sun and the Earth come from NASA JPL Horizons. The hills come from NASA's LOLA height map. The names and positions of craters come from the IAU Gazetteer. The Apollo positions come from the NASA archive (NSSDC). Each data file has a note inside it that gives its source.
- It did not set the goal. The team decided what to build and what to remove.

## How we checked the AI's work

- Automatic checks: the type check, the code rules, and the tests. Each test has the ID of a requirement in `docs/REQUIREMENTS.md`.
- A test that must fail: we broke the compass convention of the horizon code on purpose. The tests failed, as they must.
- Checks against NASA sources: V0, V1 and V3 in `docs/VALIDATION.md`.
- A review by a person: **not done.** When a team member reviews the code, write the name and the date here.

| Reviewer | Date | Scope |
|---|---|---|
| (no review yet) | | |

## Where the AI text can be wrong

- The summary of NASA standards in `docs/STANDARDS.md`. The AI wrote parts of it from memory.
- The cause of the small difference for the Earth direction in check V1. We did not examine it.
