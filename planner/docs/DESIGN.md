# Design of the web app

The app is a tool. A person selects a place and a date, and reads the answer. The design uses standard controls, a white page, and colour only where the colour has a job. The colour values are in `packages/web/src/styles.css`.

## 1. Main idea

The picture of the horizon draws the Sun and the Earth **behind** the hills. A ridge hides them on the screen as it does on the Moon. The sky in the picture is black, because the Moon has no air; the page around it stays white. The Sun and the Earth are round marks, larger than the real discs, with the centre in the correct place. When the Sun or the Earth is hidden, a dashed circle with the word "hidden" shows where it is. The picture is always stretched upward 8 times, because the Sun stays within a few degrees of the horizon. The user cannot change the scale.

## 2. Colour

The page is white. Text is near black. Only the data has strong colour.

| Job | Name in the code | Value | Contrast on white |
|---|---|---|---|
| Page | `--bg` | `#ffffff` | |
| Panels | `--panel`, `--panel-raised` | `#f7f8fa`, `#eceff3` | |
| Text | `--text` | `#121722` | 17.9 : 1 |
| Second text | `--text-dim` | `#475467` | 7.7 : 1 |
| Third text | `--text-faint` | `#5f6b7d` | 5.4 : 1 |
| Sun | `--sun` (lines, bars), `--sun-fill` with `--sun-edge` (disc) | `#c27400`, `#f2a93b`, `#7a4500` | 3 : 1 or more for lines |
| Earth | `--earth` | `#1460b8` | 6.2 : 1 |
| No Sun and no Earth | `--neither` | `#c2417f` | 3 : 1 or more |
| Best value | `--good` | `#18794e` | 5.4 : 1 |
| Caution, worse | `--warn` | `#b54708` | 5.4 : 1 |
| Selection and focus | `--accent` | `#4b3fc4` | 7.5 : 1 |

We checked the data colours (Sun, Earth, neither, best) with a palette tool for the common types of colour blindness. All checks pass, with one warning for the pair green and pink. These two colours are never on the screen at the same time.

Colour is never the only sign. The Sun is a solid disc and the Earth is a disc with a ring. Each has a label. Each row of a chart has a name.

## 3. Text

- The system font. Numbers have equal width, so a countdown does not move from side to side.
- Body text is 15 px. The three large numbers are 1.5 rem.
- Words on the screen are plain: "in view", not "above the skyline"; "29.5 days", with an explanation of the lunar day.

## 4. Pages

- **Sky view.** From top to bottom: three large numbers in one row, each with one sentence that says what it means; the name of the place with a small Moon picture that shows where it is; the picture of the horizon with the date, step and Play controls below it; a summary of the next 14 days. Details are closed until the user opens them.
- **Compare places.** The list of 2 to 4 places, bars for each place (Sun, Earth, no Sun/Earth), three sentences that name the best place, and a table. The best value in each row has a green cell and the word "best".
- **Rover sim.** A recording of the rover simulation (or the terrain picture if the recording is missing), three sentences, the result of the run, and a button that opens the same place in Sky view.
- **About.** The purpose, the sources in plain words, the limits, the checks and the credits.

On a narrow screen, the panels are one below the other. Wide pictures and tables scroll inside their panel. The page does not scroll sideways.

## 5. Parts

- Text that opens more detail ("About this place", "More detail", "Show the numbers") is black and bold, with an arrow that turns.
- Sections are soft grey areas with round corners and no lines, so the page reads as one flow.
- Header: the LSN logo (a low Sun behind a crater rim), the name, and four page buttons.
- Place list: on the Compare places page only. "Open in Sky view" shows one place in detail, and "Change place" in Sky view goes back.
- Buttons with icons from one set of 16 px drawings.

## 6. What the app must not say

The app does not say that there is electrical power or radio contact. It says where the Sun and the Earth are. A test reads the sentences that the app makes and fails if they use words such as "power" or "link". The south-pole places are never named landing sites.

## 7. Known gaps

- The pictures (horizon, bars) react to a pointer. The same actions are available from the keyboard through the date field, the sliders and the buttons. The pictures themselves cannot get the keyboard focus.
- There is no automatic test in a real browser.
