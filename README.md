# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026, Vienna (TU Wien, 14 to 15 Nov 2026).
Team:Cosmioneers.

This repository has two parts that work side by side:

| Folder | What it is | Made by |
|---|---|---|
| `planner/` | A web app. It shows when a place on the Moon can see the Sun and the Earth. | Nkem Kingsley Umunna |
| `rover-slam/` | A rover simulation. It shows how a rover keeps its position when it drives into a dark shadow. | Kalidas Shaji |

This file is the only top-level document. More detail is in `planner/docs/` and in `rover-slam/README.md`.

The text in this repository follows the writing rules of ASD-STE100 (Simplified Technical English): short sentences, active voice, one word for one thing. We did not check it with a certified STE tool.

---

## 1. The problem from NASA

NASA wants to land crews and robots near the south pole of the Moon. The challenge asks for a tool that helps mission planners, teachers and the public to compare landing sites and dates. The tool must answer these questions:

- Where are the Sun and the Earth in the sky of a landing site, on a given date?
- How much time is left before the Sun or the Earth goes out of view?
- How do two or more sites compare?
- What changes if the landing date moves?

Why these questions are important:

- A lander gets its electrical power and its heat from sunlight.
- A lander needs a clear line to the Earth for direct radio.
- Near the south pole, the Sun is never more than a few degrees above the horizon. A hill or a crater rim can hide the Sun or the Earth for many days.

NASA already has strong tools for this (JPL Horizons, Moon Trek, QuickMap). They are made for experts. An ordinary person cannot get a fast answer from them.

## 2. Our solution

### 2.1 The planner (`planner/`)

The planner is a web page. You select a place and a date. The page shows the result in plain words and in pictures.

| Page | What you see | Which NASA question it answers |
|---|---|---|
| **Sky view** | Three large numbers first, each with one sentence that says what it means: the height of the Sun, the time until the Sun sets or rises, the time until the Earth sets or rises. Then the place with a small picture of where it is on the Moon, a picture of the full horizon with the real hills, the Sun and the Earth, the date and Play controls, and a summary of the next 14 days. | Where are the Sun and the Earth? How much time is left? |
| **Compare places** | 2 to 4 places for the same dates. Coloured bars show when the Sun and the Earth are in view. A table marks the best value in each row. | How do the sites compare? |
| **Rover sim** | A recording of the rover simulation, a short explanation, the result of the run, and a button that opens the same place in Sky view. | What can a rover do in the dark? |
| **About** | Where the data comes from, what the app does not tell you, and the result of each check. | Can I trust it? |

### 2.2 The rover simulation (`rover-slam/`)

The planner finds the times when a place has no Sun and no Earth in view. The rover simulation shows what a rover can do in such a dark area.

A simulated rover drives from sunlight into a deep shadow at Connecting Ridge, on real NASA terrain. It finds its own position from a laser scanner (LiDAR), a motion sensor and its wheels. This method is known as SLAM (simultaneous localization and mapping). The simulation uses ROS 2 Jazzy, Gazebo Harmonic and RViz 2. Its own README reports a final position error of 0.25 m after the full route. We did not repeat that measurement in this part of the repository.

`rover-slam/README.md` gives the full description. The two parts use different software, so they do not run in one program. They share the same place: the planner has the centre of the rover area in its list of places ("Connecting Ridge (rover simulation area)"). `npm run build-catalog` reads that position from `rover-slam/config/terrain_meta.json`. The NASA height maps of the two parts agree at that point.

### 2.3 Words that we use

| Word | Meaning |
|---|---|
| Horizon | The line where the ground meets the sky. In the app, the horizon is the real outline of the hills and crater rims around a place. |
| In view | Some part of the Sun or the Earth is above the horizon. |
| Lunar day | One full cycle of light and dark on the Moon. It is 29.5 Earth days. |
| Rover simulation | A computer model of a rover that drives on NASA terrain. No real rover exists in this project. |
| Stay | The days on the Moon that you look at: 7 days, 14 days or 29.5 days. |
| Height map | A map that gives the height of the ground at each point. Engineers call it a digital elevation model (DEM). |
| UTC | The world standard time. All dates and times in the app are UTC. |

## 3. How we thought about the problem

1. **Use NASA data, not our own guesses.** The positions of the Sun and the Earth come from NASA JPL Horizons. The hills come from NASA's LOLA height map. The app does not make its own estimate of these.
2. **Calculate one time, then keep the app simple.** We get the data when we build the app. The result is two small files. The web page reads only these files. It needs no server and no account.
3. **Use one clear rule.** The Sun or the Earth is "in view" when some part of its disc is above the horizon. NASA's light map uses the same rule.
4. **Say only what we calculate.** The app shows where the Sun and the Earth are. It does not calculate electrical power or radio quality. Every page keeps to this.
5. **Do not invent places.** NASA named 13 areas for Artemis III and gave no exact positions. We use a high point near 9 of them, where the name points to a crater or a mountain. For Connecting Ridge, we use the centre of the area of our rover simulation. We leave the other 3 out.
6. **Use simple words.** A person with no space knowledge must understand each label. Expert words are in the documents, not on the screen.
7. **Check each step against NASA.** Section 6 gives the checks and their results.

## 4. How the planner works

```
NASA JPL Horizons ──► fetch-ephemeris ──► data/ephemeris.bin ──┐
(Sun and Earth,        (one time,          (3 years,            │
 every 10 minutes)      at build)           10-minute steps)    ├──► web app in the browser
                                                                │    (no server)
NASA LOLA height map ─► build-skylines ──► data/skylines.bin ──┘
(south pole, 80 m)     (one time,          (the horizon of each
                        at build)           place, 720 directions)
```

1. **Sun and Earth.** `fetch-ephemeris` asks NASA JPL Horizons for the position of the Sun and the Earth, as seen from the Moon. It stores three years (1 Nov 2026 to 31 Oct 2029) in `ephemeris.bin`.
2. **Places.** `build-catalog` makes the list of places. For each crater or mountain that NASA named, it finds the highest point of the rim on the height map. It adds the six Apollo landing sites from the NASA archive. Each place keeps a note of its source.
3. **Horizon.** `build-skylines` looks out from each place in 720 directions. It finds how high the hills are in each direction. It stores the result in `skylines.bin`.
4. **App.** For a place and a time, the app calculates the direction of the Sun and the Earth. It compares their height with the height of the hills in that direction. All other numbers come from this comparison.

The folder `planner/packages/` has three parts:

| Package | Contents |
|---|---|
| `shared` | The mathematics and the file formats. The pipeline and the app use the same code. |
| `pipeline` | The build scripts: download, catalog, horizons, checks. |
| `web` | The web app (React and Vite). |

## 5. The challenge, item by item

| The challenge asks for | Where it is |
|---|---|
| A list of landing sites | 8 places near the south pole and the 6 Apollo sites. You choose places on the Compare places page and open one in Sky view. |
| Your own position | Not in the app. We removed the field for your own point to keep one place list. |
| Sun and Earth against the horizon on a date | Sky view, picture of the horizon |
| Time left before sunset or Earthset | Sky view, the three large numbers |
| Numbers: height of the Sun, time in sunlight, time with Earth in view | Sky view ("Show the numbers"), Compare places |
| Comparison of sites | Compare places |
| Dates, lunar days, seasons | Date field, 1-day and 29.5-day buttons |
| Changes of the schedule | Move the date with the 29.5-day buttons (one lunar day) and read the new numbers. The app has no separate page for this. |
| Timelines and animation | Sky view: Play moves the time and the picture of the horizon |
| Easy for planners, teachers and the public | Plain words on every page, keyboard use, colours that are safe for colour-blind persons, phone width |
| Positions from Horizons | Yes, at build time |
| Hills from LOLA | Yes, for the 8 south-pole places |
| The Moon has no air, so the horizon is hills plus the curve of the Moon | Yes, exact geometry on a sphere |
| The small wobble of the Moon (libration) | It is in the Horizons data |

Not done:

- **No sites of robotic landers.** No Artemis mission has landed on the Moon, so there are no Artemis landing positions to use. The catalog has no positions for robotic landers (for example the NASA commercial landers), because we did not get a source for them in time.
- **3 of the 13 Artemis III areas are not in the app.** Their names do not point to one crater or mountain.
- **No separate page for a change of the schedule.** We removed the calendar, the delay tool and the date search to keep the app simple.
- **The rover simulation does not run in the browser.** It needs ROS 2 and Gazebo on a Linux computer. The Rover sim page plays a recording. Put the recording in `planner/data/rover-demo.mp4`. Until that file exists, the page shows the terrain picture.
- **No 3D view.**
- **The height map has 80 m points.** A finer map (20 m) is available from NASA. We did not use it.

## 6. Checks

Each check compares our result with an independent answer. `planner/docs/VALIDATION.md` has the full report. The scripts make that file.

| Check | What it compares | Result |
|---|---|---|
| V0 | The height map is the right way round. Known craters must be low, and Mons Malapert must be high. | Pass |
| V1 | Our Sun and Earth directions against NASA JPL Horizons, at 8 places and 300 times. | Pass. Largest difference: Sun 0.0002°, Earth 0.006° |
| V2 | The horizon calculation against exact formulas on test shapes. | Pass |
| V3 | Sunlight at 3 places against NASA's published light map (Mazarico et al. 2011). | Pass. See the table below |
| V4 | Countdowns and the totals of a stay against a slow, simple count. | Pass |

V3 in detail. "Ours" is the share of time with the Sun in view, over the three years of the app. "NASA" is the lowest and the highest value in the 9 pixels (180 m) around the place.

| Place | Ours | NASA |
|---|---|---|
| Shackleton rim (high point) | 88% | 0% to 85% |
| Haworth rim (high point) | 41% | 24% to 39% |
| Mons Malapert (summit) | 67% | 49% to 60% |

Our values are 2 to 6 points above the highest NASA value nearby. The allowed difference is 15 points. We set this limit before the first run. An exact match is not possible: NASA used about 18.6 years and we use 3 years, the two height maps have different detail, and our observer is 2 m above the ground.

The automated tests (`npm run check`) also make sure that each requirement in `planner/docs/REQUIREMENTS.md` has a test.

## 7. How to run the planner

You need Node.js 22 and npm.

```bash
cd planner
npm ci
npm run dev
```

Open the address that the command prints (usually http://localhost:5173).

| Command (in `planner/`) | What it does |
|---|---|
| `npm run dev` | Starts the app for development |
| `npm run build` | Builds the app into `packages/web/dist/` |
| `npm run preview` | Shows the built app |
| `npm run check` | Runs the type check, the code rules, all tests and the requirement trace |
| `npm run validate:unit` | Runs checks V2 and V4 and writes the report |
| `npm run validate:v0`, `validate:v1`, `validate:v3` | Runs one check against NASA data |

The two data files are in the repository (`planner/data/`). You do not need to build them. To build them again from NASA's sources, you need an internet connection:

```bash
npm run fetch-ephemeris      # Sun and Earth from JPL Horizons, about 5 minutes
npm run fetch-dem            # the LOLA height map, 189 MB
npm run build-catalog        # the list of places
npm run build-skylines -- --catalog
```

On Windows with WSL: copy or clone the repository into the Linux file system, not under `/mnt/c`. Make sure that `command -v node npm` shows a path in `/home/`. Run `npm ci` again in WSL. Do not share `node_modules` between Windows and WSL.

How to run the rover simulation: see `rover-slam/README.md`. It needs Ubuntu 24.04 with ROS 2 Jazzy and Gazebo Harmonic. Do its commands in the folder `rover-slam/`:

```bash
cd rover-slam
python3 -m venv --system-site-packages venv
venv/bin/pip install -r requirements.txt
./run_demo.sh
```

## 8. The pitch and the demo

### 8.1 The pitch in 30 seconds

> NASA wants to land at the south pole of the Moon. There, the Sun stays so low that one hill can hide it for days. No sunlight means no power. No view of Earth means no direct radio.
>
> NASA has the data, but the tools are for experts. We made **LSN, the Lunar Site Navigator**. Select a place and a date. In plain words, it tells you if you see the Sun and the Earth, and how long you have.
>
> It uses NASA's own data, and we checked it against NASA's maps. And when a place is dark, our simulated rover shows the next step: it drives into the shadow and still knows its position to 25 centimetres.
>
> LSN: know your light before you land.

About 95 words. Show Sky view during the second paragraph and the rover recording during the third.

### 8.2 The demo

1. **Planner, 2 minutes.** Open Sky view at "Haworth rim (high point)". Show the picture: the Sun is very low, and a ridge can hide it. Read the three numbers. Press Play.
2. Open **Compare places**. Show which of three places has the most sunlight and the shortest dark time.
3. Press the "29.5 days" button to move one lunar day later. Show that the numbers change with the season.
4. **Link to the rover.** Open **Rover sim**. Say: "A rover that works in such a shadow is in the dark. This is our second part." Press play on the recording.
5. **Rover, live (optional).** Start `./run_demo.sh` on the Ubuntu computer before the talk, because one run takes about 5 minutes. Show the three windows: the Moon scene, the map that grows, and the camera picture.

## 9. Repository layout

```
README.md            this file
LICENSE, NOTICE      Apache License 2.0, data credits
.gitlab-ci.yml       automatic checks and the public web page
planner/
  packages/shared    mathematics and file formats
  packages/pipeline  build scripts and checks
  packages/web       the web app
  data/              ephemeris.bin, skylines.bin, results of the checks
  docs/              requirements, check report, file formats, standards, design, AI use
rover-slam/          the rover simulation (see its README)
```

## 10. Limits

- The app shows where the Sun and the Earth are. It does not calculate power or radio quality.
- The south-pole places are high points that we found. They are not official NASA landing sites.
- The hills are only as exact as the 80 m height map.
- The Apollo sites have a flat horizon in the app.
- The data covers 1 Nov 2026 to 31 Oct 2029.
- No person other than the authors has reviewed the code. `planner/docs/AI-USE.md` tells you which parts an AI assistant wrote.
- NASA and JPL do not endorse this project.

## 11. Data sources and credits

- Sun and Earth positions: [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/).
- Height map: LOLA south-pole elevation model, [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90), Barker et al. (2023), Planetary Science Journal 4, 183.
- Light map for check V3: [NASA PGDA product 69](https://pgda.gsfc.nasa.gov/products/69), Mazarico et al. (2011), Icarus 211, 1066-1081.
- Names and positions of craters and mountains: IAU Gazetteer of Planetary Nomenclature (USGS).
- Apollo landing sites: NASA Space Science Data Coordinated Archive (NSSDC).
- Parts of the code and the documents were written with an AI assistant (Claude, by Anthropic). See `planner/docs/AI-USE.md`.

## 12. Status and license

We built this during the hackathon. The repository is closed for contributions after 15 Nov 2026. You can clone it and build on it. Give credit to this repository if you do.

Code: Apache License 2.0 (`LICENSE`). The license covers our code. It does not cover NASA's data (`NOTICE`).
