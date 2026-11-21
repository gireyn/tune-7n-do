# 7n-DO plugins for MuseScore 3.4+

> A companion to [`../tune-n-edo`](../tune-n-edo): same idea, different split.
> There the EDO decides both the *mapping* and the *tuning*; here the mapping is
> fixed at **7-EDO** (sharps and flats do not move the pitch at all) and the
> tuning is written directly as a balanced gap pattern. Arrows subdivide the
> gaps when you want a finer lattice.

Three plugins:

| Plugin | What it does |
| --- | --- |
| **tune 7n-do** | Retunes the selection — or the whole score when nothing is selected. |
| **pitch up** | Raises the selection by one step of the lattice. |
| **pitch down** | Lowers the selection by one step of the lattice. |

---

## Tuning model

The two procedures are kept apart on purpose.

### Mapping

The mapping is exactly 7-EDO with the generator fixed at `3/1 = 2^(11/7)`, so the
apotome is **0**:

> `C`, `C#`, `Cx`, `Cb`, `Cbb`, `Cd` (half flat), `C+` (half sharp), `C#+`
> (sesqui sharp), … are all the same pitch.

The **only** thing that moves a note off its nominal is an **arrow accidental**
(`^`, `v`, `^2`, `v3`, `^4`, `v4`, and their sharp/flat/double-sharp/double-flat
flavours).

Arrow size is set by an annotation, in one of two modes:

* **relative `x`** — the gap to the neighbouring nominal is divided into `x`
  equal parts. With `relative 3`, `^G` is `G^(2/3)·A^(1/3)`, `vvB` is
  `A^(2/3)·B^(1/3)`, and `vvvF` is exactly `E`.
* **absolute `y`** — one arrow is worth `y` steps of 224-EDO.

`x` may be any positive JavaScript expression, not just an integer
(`relative 25/6` is fine). It also picks the lattice: `relative 3` is 21-DO,
`relative 9` is 63-DO, and so on up to the four-arrow limit (`relative 9`,
i.e. 63-DO, is the finest that can be written).

When no `relative`/`absolute` annotation is in force, there is no arrow lattice
at all: arrow accidentals are still *recognised*, but they do not change the
pitch.

### Tuning

A tuning is a balanced gap pattern: seven deviations, in 224-EDO steps, from the
plain 32-step (1/7 octave) gaps of 7-EDO, plus which nominal the first gap starts
from.

```
[1.052372185197171, -2.2465150291147507, 0.48387275133624946, 0.7443577836950364, -4.222852686929088, 1.0820132562063445, 3.1067517396090376]1
```

The trailing `1` means "the first gap starts from D" (`0` = C, `1` = D, … `6` = B,
or write the letter: `c`…`b`, upper or lower case). The list must have **exactly
7** entries and must close the octave:

> |sum of the seven numbers| < 1/20736

Anything else is rejected, the annotation is ignored, and a dialog says why. The
pattern is then passed through `unf()` from `balycalai.py` (raw scales whose
entries all sit inside `(1/3, 2)` are converted with `bal()` first; then the mean
is removed) before it is applied.

Each of the seven items is a JavaScript expression, like every other annotation
here — `[1+0.052, -2.246, (0), 0.744, -4.22, 1.082, 3.106]1` — and a comma inside
an expression (`Math.pow(2, 3) - 8`) does not end the item.

Gaps are read cyclically: with start letter `g`, `gaps[0]` is G→A, `gaps[1]` is
A→B, `gaps[2]` is B→C, … and `gaps[6]` is F→G.

The default tuning is 7-EDO equal:

```
[0,0,0,0,0,0,0]0
```

### Where the whole scale sits

By default the scale is **balanced**: the arithmetic mean of `log2(pitch)` over
C4…B4 is the same as for standard 7-EDO anchored at
`C4 = 261.6255653005986 Hz`. There is no single fixed note.

Two annotations change that, and **neither of them changes the relative tuning**
— they only slide the finished scale around:

| Annotation | Effect |
| --- | --- |
| `C4: 261.6255653005986` | Pins that note to that frequency. |
| `total: +32` | Forces balanced mode and shifts everything by `32/224` octave. The `+` is optional; JavaScript expressions work (`total: 5*Math.LN2`). |

---

## Installation

1. Copy this folder into [MuseScore's plugins directory](https://musescore.org/en/handbook/3/plugins#windows).
2. Enable `tune 7n-do`, `pitch up` and `pitch down` in *Plugins → Plugin Manager*.
3. (Recommended) Assign shortcuts in *Edit → Preferences → Shortcuts*, and clear
   MuseScore's built-in *Pitch up* / *Pitch down* shortcuts so they do not fight
   the plugins.

The `.qml` files are generated: edit `src/`, then run `python3 build.py`.

---

## Score annotations

All annotations are Staff Text (`Ctrl-T`) or System Text (`Ctrl-Shift-T`); use
System Text to apply them to every staff. Each annotation goes in its own text
element, and takes effect from its position onwards.

| Annotation | Example | Effect |
| --- | --- | --- |
| Tuning pattern | `[...]1` | Sets the seven tuned gaps and the start nominal. |
| Absolute tuning | `C4: 261.6255653005986` | Pins one note to a frequency. |
| Total shift | `total: +32` | Balanced centering, shifted by 32/224 octave. |
| Arrow mode | `relative 3`, `absolute 4.8` | Turns on the arrow lattice. |
| Arrow limits | `-1 4 relative 3` | Same, with explicit generation limits. |
| Key signature | `.#...#...` | Announces the key signature (see below). |
| Transposition | `t: Bb` | Transposing instrument, fifth based. |
| Config | `config: {showallaccidentals: true}` | Writes courtesy naturals when transposing. |

The **EDO** (`42edo`) and **generator ratio** (`~3: 2.997`) annotations of the
reference plugin are deliberately **inactive** here — the mapping is fixed. Such
text is simply ignored.

### Arrow limits

How many arrows `pitch up` / `pitch down` will *generate* is limited; arrows
beyond the limit are still *recognised* (and sound right), they just are not
produced by transposing.

| Mode | Default limit |
| --- | --- |
| `relative x` | `±ceil((x-1)/2)` |
| `absolute y` | `±ceil(((32 + largest gap)/y - 1)/2)` |

`relative 3` therefore gives `±1` — exactly enough to name every step of a
3-way divided gap, since `D`, `^D`, `vE`, `E` covers it. Write the two limits
before the mode to override them:

```
-2 +0 relative 3      limits from two down to zero
-1 4 relative 3       limits from one down to four up
0 1 relative 3        limits from zero to one up
```

Limits beyond ±4 are clamped to ±4, because MuseScore has no glyph for a fifth
arrow.

### Key signatures

MuseScore's plugin API cannot report the key signature of a staff, so announce
each one with a dotted list of seven accidental codes, in the order C D E F G A B,
where blank means natural:

| Key | Text | Read as |
| --- | --- | --- |
| C major | `.......` | all natural |
| D major | `.#...#...` | C♯ and F♯ |
| F major | `...b....b` | E♭ and B♭ |
| with arrows | `.^...v...` | C up one arrow, F down one arrow |

The key signature never affects the sounding pitch here (every sharp and flat is
pitch neutral); it decides **which flavour of arrow accidental is drawn** — in a
key signature with F♯, an up-arrow on F is drawn `#^` rather than `^`. Key
signatures themselves are never modified.

### Transposing instruments

`t: Bb`, `t: Eb`, … declare a fifth-based transposition. It is only applied
outside concert pitch mode, and the plugin compensates for MuseScore
transposing in 12-EDO fifths (700 cents) instead of this lattice's fifths
(685.7 cents).

---

## What the transposing plugins do

`pitch up` builds the list of every legal spelled pitch — each nominal with each
arrow count the limits allow — sorts it by actual tuned pitch, and takes **the
lowest one that is higher than the current pitch**, regardless of which nominal
it lands on. That is what produces the ordinary ups-and-downs chain without any
special cases:

```
D  ->  ^D  ->  vE  ->  E          (relative 3)
D  ->  ^D  ->  ^^D ->  vE ->  E   (relative 4)
```

With no `relative`/`absolute` annotation the arrows are silent, so a step is
simply the next nominal — and, as in the mapping itself, `C#` and `Cb` and `Cx`
all become plain `D` on a pitch up when no key signature is set.

Two details worth knowing:

* The accidental on the new note is the arrow glyph in the flavour the key
  signature gives that nominal. Notes that need no arrows get no accidental.
* If a transposed note stops supplying an accidental to the rest of the bar,
  every following note that was relying on it is given that accidental
  explicitly, so nothing else in the bar changes pitch.

---

## Known issues

* Key signatures must be announced with the `.c.d.e.f.g.a.b` annotation; custom
  key signatures are not detected.
* Up to four arrows per accidental (that is the MuseScore glyph limit), so the
  finest lattice is `relative 9` / 63-DO.
* Cross-staff notation is not handled, exactly as in the reference plugin.
* In `absolute` mode the arrows are anchored to their nominal, so when `y` does
  not divide the tuned gap the step across a nominal boundary is whatever the
  tuned gap is, not `y`. This is deliberate: the transposing plugins always move
  to the next *pitch in the scale*, never to a pitch off the lattice.
* When transposing, notes later in the bar that were leaning on the transposed
  note's accidental are given that accidental explicitly. Notes that are simply
  following the key signature are left alone. One combination is still not
  covered: an *explicit* accidental that happens to equal the key signature,
  with a conflicting accidental earlier in the same bar, and the note then
  moving to another line.

---

## Developer notes

```
src/core.js    mapping, tuning maths, annotation parsing, score scanning
src/tune.js    the retuning plugin
src/pitch.js   the two transposing plugins (direction = +1 / -1)
build.py       assembles the three .qml files; the core is byte-identical in all
test/run.js    plain-node tests of the pitch maths
test/integration.js  mock-score tests of scanning, inheritance and transposition
test/build.js  checks the generated .qml files against src/
```

```sh
python3 build.py
node test/run.js && node test/integration.js && node test/build.js
```

Never edit the generated `.qml` files directly — `build.py` overwrites them.

Implementation notes:

* A written pitch is `(nominal, arrows)`. The nominal comes from `note.tpc` via
  the chain of fifths — `fifths = tpc - 14`, `nominal = (4·fifths) mod 7`,
  `sharps = (fifths - fifthsOf(nominal)) / 7` — and the arrows come from
  `note.accidentalType` (or from the accidental inherited within the bar).
* Because the mapping is 7-EDO, the number of sharps only matters for
  MuseScore's invisible 12-EDO midi index, and `note.tuning` simply cancels the
  difference between that index and the tuned pitch.
* Tuning values are written relative to the note's own 12-EDO pitch, so no
  octave arithmetic is needed: `tuning = 1200·log2(wanted) − 100·(midi − 60)`.
* When a note is moved, the order is line, then accidental, then tuning.
* MuseScore returns `note.accidentalType` and other enums as *stringified* names
  in some versions; `0 + value` coerces it back to the integer, which is why the
  code does that everywhere.
