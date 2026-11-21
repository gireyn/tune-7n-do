#!/usr/bin/env node
// End-to-end tests against a mock MuseScore score.
//
// This exercises the parts that the pure-maths bench cannot: annotation
// scanning, accidental inheritance inside a bar, key signatures, and what
// actually gets written into note.tuning / note.line / the accidental.
//
//   node test/integration.js
//
'use strict';

const { load, enumStub } = require('./harness');

let failures = 0;
let checks = 0;

function ok(cond, label, extra) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL  ' + label + (extra === undefined ? '' : '  -- ' + extra));
  }
}

function close(a, b, label, tol) {
  const t = tol === undefined ? 1e-9 : tol;
  ok(Math.abs(a - b) <= t, label, 'got ' + a + ', want ' + b);
}

function eq(a, b, label) {
  ok(a === b, label, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
}

// ---------------------------------------------------------------------------
// Mock score
// ---------------------------------------------------------------------------
const Accidental = enumStub({ NONE: 0, NATURAL: 1 });
const Element = { NOTE: 2, ACCIDENTAL: 3 };
const Ms = { CHORD: 1 };
const NoteType = { NORMAL: 0, ACCIACCATURA: 1, APPOGGIATURA: 2, GRACE4: 3, GRACE16: 4, GRACE32: 5 };

// line -> [tpc, midi] of the plain note with no accidental
// (higher line = lower on the staff)
const PLAIN = {
  12: [15, 55], // G3
  11: [19, 59], // B3
  10: [14, 60], // C4
  9: [16, 62],  // D4
  8: [18, 64],  // E4
  7: [13, 65],  // F4
  6: [15, 67],  // G4
  5: [17, 69],  // A4
  4: [19, 71],  // B4
  3: [14, 72]   // C5
};

function sharpsOf(name) {
  switch (name) {
  case 'SHARP': return 1;
  case 'FLAT': return -1;
  case 'SHARP2': return 2;
  case 'FLAT2': return -2;
  case 'SHARP3': return 3;
  case 'FLAT3': return -3;
  default: return 0;
  }
}

function makeNote(line, accName, concertTpc) {
  const n = {
    type: Element.NOTE,
    noteType: NoteType.NORMAL,
    tuning: 0,
    parent: null,
    children: [],
    accidental: undefined,
    firstTiedNote: undefined,
    _line: line,
    _acc: accName ? Accidental[accName] : Accidental.NONE,
    add(el) { this.children.push(el); this.accidentalType = el.accidentalType; },
    is(o) { return o === this; }
  };
  n._recompute = function () {
    const base = PLAIN[this._line];
    if (!base) throw new Error('mock note: no plain note on line ' + this._line);
    let sharps = 0;
    if (this._acc === Accidental.NATURAL) sharps = 0;
    else if (accNameOf(this._acc)) sharps = sharpsOf(accNameOf(this._acc));
    this._tpc = base[0] + 7 * sharps;
    this._pitch = base[1] + sharps;
  };
  Object.defineProperty(n, 'line', {
    get() { return this._line; },
    set(v) { this._line = v; this._recompute(); }
  });
  Object.defineProperty(n, 'accidentalType', {
    get() { return this._acc; },
    set(v) { this._acc = v; this._recompute(); }
  });
  Object.defineProperty(n, 'tpc', { get() { return this._tpc; } });
  Object.defineProperty(n, 'tpc1', {
    get() { return concertTpc === undefined ? this._tpc : concertTpc; }
  });
  Object.defineProperty(n, 'pitch', { get() { return this._pitch; } });
  n._recompute();
  return n;
}

function accNameOf(value) {
  for (const key of Object.keys(Accidental)) {
    if (Accidental[key] === value && typeof key === 'string') return key;
  }
  return null;
}

// segs: [{tick, bar, annotations: [{name, track, text}], voices: {0: [notes]}}]
function makeScore(segs) {
  const segments = segs.map((s) => {
    const seg = {
      tick: s.tick,
      annotations: s.annotations || [],
      voices: s.voices || {},
      measure: null
    };
    seg.measure = { firstSegment: { tick: s.bar === undefined ? s.tick : s.bar } };
    return seg;
  });
  const score = {
    nstaves: 1,
    segments: segments,
    lastSegment: { tick: segments.length ? segments[segments.length - 1].tick : 0 },
    selection: { elements: [] },
    newCursor() {
      let pos = 0;
      let noSel = true;
      const c = {
        staffIdx: 0,
        voice: 0,
        segment: null,
        element: null,
        tick: 0,
        measure: null,
        rewind(kind) {
          const phrase = score.selection.phrase;
          noSel = false;
          if (kind === 0) {
            pos = 0;
          } else if (phrase) {
            const want = (kind === 1) ? phrase.startTick : phrase.endTick;
            pos = 0;
            while (pos < score.segments.length && score.segments[pos].tick < want)
              pos++;
            c.staffIdx = (kind === 1) ? phrase.startStaff : phrase.endStaff;
          } else {
            noSel = true;
            pos = 0;
          }
          sync();
        },
        next() {
          if (pos + 1 < score.segments.length) { pos++; sync(); return true; }
          pos = score.segments.length;
          sync();
          return false;
        }
      };
      function sync() {
        const s = noSel ? null : score.segments[pos];
        c.segment = s;
        c.tick = s ? s.tick : 0;
        c.measure = s ? s.measure : null;
        if (!s) { c.element = null; return; }
        c.element = { type: Ms.CHORD, notes: s.voices[c.voice] || [], graceNotes: [] };
      }
      sync();
      return c;
    }
  };
  return score;
}

// Drag a phrase selection over (part of) the score.
function phraseSelect(score, startTick, endTick) {
  score.selection.phrase = {
    startTick: startTick === undefined ? 0 : startTick,
    endTick: endTick === undefined ? 1e15 : endTick,
    startStaff: 0,
    endStaff: 0
  };
  return score;
}

function staffText(text) {
  return { name: 'StaffText', track: 0, text: text };
}

function systemText(text) {
  return { name: 'SystemText', track: 0, text: text };
}

// Runs one of the plugins against a mock score.
function run(files, score, extra) {
  const calls = { cmd: [] };
  const dialogs = [];
  const api = load(files, {
    Accidental,
    Element,
    Ms,
    NoteType,
    curScore: score,
    Qt: { quit() {} },
    newElement: (type) => ({ type: type, accidentalType: Accidental.NATURAL }),
    cmd: (name) => calls.cmd.push(name),
    errorDialog: { text: '', open() { dialogs.push(this.text); } },
    warnings: [],
    direction: (extra && extra.direction) || 1
  });
  api.calls = calls;
  api.dialogs = dialogs;
  api.__onRun();
  return api;
}

const EXAMPLE = [1.052372185197171, -2.2465150291147507, 0.48387275133624946,
  0.7443577836950364, -4.222852686929088, 1.0820132562063445, 3.1067517396090376];
const PATTERN_G = '[' + EXAMPLE.join(', ') + ']g';

// ---------------------------------------------------------------------------
// 1. Nothing but plain notes: the default is 7-EDO.
// ---------------------------------------------------------------------------
console.log('plain 7-EDO');
{
  const c4 = makeNote(10, null);
  const cs4 = makeNote(10, 'SHARP');
  const cb4 = makeNote(11, null);
  cb4.accidentalType = Accidental.FLAT; // Cb4: line 10 with a flat
  const cb = makeNote(10, 'FLAT');
  const d4 = makeNote(9, null);
  const score = makeScore([{ tick: 0, bar: 0, voices: { 0: [c4, cs4, cb, d4] } }]);
  const api = run(['core.js', 'tune.js'], score);

  close(c4.tuning, 0, 'C4 at 261.6255 Hz');
  close(cs4.tuning, -100, 'C#4 is pulled down onto C4');
  close(cb.tuning, 100, 'Cb4 (a C nominal) is pulled up onto C4');
  close(d4.tuning, 1200 / 7 - 200, 'D4 sits a seventh of an octave above C4');
  eq(api.dialogs.length, 0, 'no warnings for a clean score');
}

// ---------------------------------------------------------------------------
// 2. The example pattern with relative 3, plus accidental inheritance.
// ---------------------------------------------------------------------------
console.log('pattern + relative 3');
{
  const d4 = makeNote(9, null);
  const dUp = makeNote(9, 'NATURAL_ONE_ARROW_UP');
  const dAfter = makeNote(9, null);            // same bar: inherits the arrow
  const dNextBar = makeNote(9, null);          // next bar: does not
  const score = makeScore([
    { tick: 0, bar: 0, annotations: [staffText(PATTERN_G), staffText('relative 3')],
      voices: { 0: [d4, dUp, dAfter] } },
    { tick: 1920, bar: 1920, voices: { 0: [dNextBar] } }
  ]);
  const api = run(['core.js', 'tune.js'], score);

  const parsed = api.parseScaleAnnotation(PATTERN_G);
  const tun = api.defaultTuning();
  tun.gaps = parsed.gaps;
  tun.start = parsed.start;
  tun.mode = 'relative';
  tun.step = 3;
  api.clampLimits(tun);
  const L = api.tuningL(tun);
  const shift = api.tuningShift(tun, L);
  eq(api.defaultArrowLimit(tun), 1, 'relative 3 allows one arrow');

  close(d4.tuning, 1200 * (L[1] + shift) - 200, 'plain D4');
  close(dUp.tuning, 1200 * (L[1] + shift + (L[2] - L[1]) / 3) - 200,
        '^D4 is a third of the D..E gap above D4');
  close(dAfter.tuning, dUp.tuning, 'the following implicit D inherits the arrow');
  close(dNextBar.tuning, d4.tuning, 'the next bar does not inherit the arrow');
}

// ---------------------------------------------------------------------------
// 3. total: and the tuning center
// ---------------------------------------------------------------------------
console.log('total and center');
{
  const c4 = makeNote(10, null);
  const score = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('total: +32')],
    voices: { 0: [c4] } }]);
  const api = run(['core.js', 'tune.js'], score);
  const parsed = api.parseScaleAnnotation(PATTERN_G);
  const tun = api.defaultTuning();
  tun.gaps = parsed.gaps;
  tun.start = parsed.start;
  tun.total = 32;
  api.clampLimits(tun);
  const L = api.tuningL(tun);
  close(c4.tuning, 1200 * (L[0] + api.tuningShift(tun, L)),
        'total +32 raises the whole scale by 32/224 octave');
  close(1200 * api.tuningShift(tun, L) - 1200 * api.balancedShift(L), 1200 * 32 / 224,
        'and that is exactly one seventh of an octave');

  const c4b = makeNote(10, null);
  const score2 = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('C4: 261.6255653005986')],
    voices: { 0: [c4b] } }]);
  run(['core.js', 'tune.js'], score2);
  close(c4b.tuning, 0, 'a C4 center at 261.6255 Hz leaves C4 where it is');
}

// ---------------------------------------------------------------------------
// 4. Invalid annotations are reported, and the default is used.
// ---------------------------------------------------------------------------
console.log('invalid annotations');
{
  const c4 = makeNote(10, null);
  const score = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText('[1,2,3,4,5,6,7]0')],
    voices: { 0: [c4] } }]);
  const api = run(['core.js', 'tune.js'], score);
  eq(api.dialogs.length, 1, 'one warning dialog');
  ok(/close the octave/.test(api.dialogs[0]), 'the dialog names the problem',
     api.dialogs[0]);
  close(c4.tuning, 0, 'the score is still tuned to the default');
}

// ---------------------------------------------------------------------------
// 5. pitch up / pitch down, no arrow annotation
// ---------------------------------------------------------------------------
console.log('pitch up / down, plain 7-EDO');
{
  const c4 = makeNote(10, null);
  const cs4 = makeNote(10, 'SHARP');
  const b3 = makeNote(11, null);
  const score = phraseSelect(makeScore([{ tick: 0, bar: 0, voices: { 0: [c4, cs4, b3] } }]));
  const api = run(['core.js', 'pitch.js'], score, { direction: 1 });

  eq(c4.line, 9, 'C4 moved up to the D line');
  eq(c4.tpc, 16, 'and is a D');
  eq(c4.pitch, 62, 'and sounds a whole tone higher');
  eq(c4.accidentalType, Accidental.NONE, 'with no accidental');
  close(c4.tuning, 1200 / 7 - 200, 'tuned as D');

  eq(cs4.line, 9, 'C#4 also becomes the D line');
  eq(cs4.tpc, 16, 'as a plain D');
  eq(cs4.accidentalType, Accidental.NONE, 'the sharp is dropped');

  eq(b3.line, 10, 'B3 moves up to C4');
  eq(b3.tpc, 14, 'as a C');
  eq(b3.pitch, 60, 'in the next octave');
  close(b3.tuning, 0, 'tuned as C4');

  // and downwards
  const d4 = makeNote(9, null);
  const score2 = phraseSelect(makeScore([{ tick: 0, bar: 0, voices: { 0: [d4] } }]));
  run(['core.js', 'pitch.js'], score2, { direction: -1 });
  eq(d4.line, 10, 'D4 moves down to the C line');
  eq(d4.tpc, 14, 'as a C');
}

// ---------------------------------------------------------------------------
// 6. pitch up through the ups-and-downs chain
// ---------------------------------------------------------------------------
console.log('pitch up through arrows (relative 3)');
{
  const d4 = makeNote(9, null);
  const score = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3')],
    voices: { 0: [d4] } }]));
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(d4.line, 9, '^D4 keeps the D line');
  eq(d4.accidentalType, Accidental.NATURAL_ONE_ARROW_UP, 'and gets one arrow up');

  // now from ^D4 the next step is vE4
  const histScore = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3')],
    voices: { 0: [makeNote(9, 'NATURAL_ONE_ARROW_UP')] } }]));
  const api2 = run(['core.js', 'pitch.js'], histScore, { direction: 1 });
  const upD = histScore.segments[0].voices[0][0];
  eq(upD.line, 8, '^D4 moves up to the E line');
  eq(upD.accidentalType, Accidental.NATURAL_ONE_ARROW_DOWN, 'as vE4');

  // vE4 then E4
  const third = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3')],
    voices: { 0: [makeNote(8, 'NATURAL_ONE_ARROW_DOWN')] } }]));
  run(['core.js', 'pitch.js'], third, { direction: 1 });
  const vE = third.segments[0].voices[0][0];
  eq(vE.line, 8, 'vE4 stays on the E line');
  eq(vE.accidentalType, Accidental.NONE, 'and becomes plain E4');

  // relative 9 gives four arrows and a nine step chain to the next nominal
  const nine = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 9')],
    voices: { 0: [makeNote(9, null)] } }]));
  run(['core.js', 'pitch.js'], nine, { direction: 1 });
  const four = nine.segments[0].voices[0][0];
  ok(/^NATURAL_(ONE|TWO|THREE)_ARROWS?_UP$|^RAISE_ONE_SEPTIMAL_COMMA$/.test('' + accNameOf(four.accidentalType)) ||
     four.accidentalType === Accidental.RAISE_ONE_SEPTIMAL_COMMA,
     'relative 9 reaches a fourth arrow', accNameOf(four.accidentalType));
}

// ---------------------------------------------------------------------------
// 7. Key signatures choose the accidental flavour
// ---------------------------------------------------------------------------
console.log('key signature flavours');
{
  const f4 = makeNote(7, null);
  const score = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3'), staffText('.#...#...')],
    voices: { 0: [f4] } }]));
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(f4.accidentalType, Accidental.SHARP_ONE_ARROW_UP,
     'a sharp is drawn on F because the key signature has an F#');

  const g4 = makeNote(6, null);
  const score2 = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3'), staffText('.#...#...')],
    voices: { 0: [g4] } }]));
  run(['core.js', 'pitch.js'], score2, { direction: -1 });
  eq(g4.accidentalType, Accidental.NATURAL_ONE_ARROW_DOWN,
     'a natural arrow is drawn on G, which the key signature leaves natural');
}

// ---------------------------------------------------------------------------
// 8. Following notes are pinned when the transposed note stops supplying an
//    accidental to the rest of the bar.
// ---------------------------------------------------------------------------
console.log('bar accidental fix-up');
{
  const up = makeNote(9, 'NATURAL_ONE_ARROW_UP');
  const after = makeNote(9, null); // would inherit the arrow
  const score = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText(PATTERN_G), staffText('relative 3')],
    voices: { 0: [up, after] } }]);
  // only the first note is selected, so the second one must be protected
  score.selection.elements = [up];
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(up.line, 8, '^D4 was moved to E');
  eq(after.accidentalType, Accidental.NATURAL_ONE_ARROW_UP,
     'the following D keeps its inherited arrow explicitly');
}

// ---------------------------------------------------------------------------
// 9. No arrow annotation: arrows are written but silent.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 9b. config: {showallaccidentals: true} writes the naturals out
// ---------------------------------------------------------------------------
console.log('config annotation');
{
  const c4 = makeNote(10, null);
  const score = phraseSelect(makeScore([{ tick: 0, bar: 0,
    annotations: [staffText('config: {showallaccidentals: true}')],
    voices: { 0: [c4] } }]));
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(c4.line, 9, 'D line');
  eq(c4.accidentalType, Accidental.NATURAL, 'the natural is written out');
}

// ---------------------------------------------------------------------------
// 9c. transposing instruments
// ---------------------------------------------------------------------------
console.log('transposing instrument');
{
  // written C4 (tpc 14) on a Bb instrument sounds Bb3 (concert tpc 12)
  const c4 = makeNote(10, null, 12);
  const score = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText('t: Bb')], voices: { 0: [c4] } }]);
  const api = run(['core.js', 'tune.js'], score);
  eq(api.dialogs.length, 0, 'the transposition annotation is accepted');
  close(c4.tuning, 2 * (700 - 4 * 1200 / 7),
        'open fifths are 685.7 cents wide, so two of them need a correction');
}

// ---------------------------------------------------------------------------
// 8b. a regular accidental supplied to the rest of the bar is pinned too
// ---------------------------------------------------------------------------
console.log('bar fix-up for regular accidentals');
{
  const dSharp = makeNote(9, 'SHARP');   // explicit D#
  const after = makeNote(9, null);       // implicit, currently sounds D#
  after._tpc = 23;
  const score = makeScore([{ tick: 0, bar: 0, voices: { 0: [dSharp, after] } }]);
  score.selection.elements = [dSharp];
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(dSharp.line, 8, 'D# moved up to the E line');
  eq(dSharp.accidentalType, Accidental.NONE, 'without an accidental');
  eq(after.accidentalType, Accidental.SHARP,
     'the following note keeps its inherited sharp explicitly');
  eq(after.tpc, 23, 'so it is still a D#');
}

// ---------------------------------------------------------------------------
// 8c. notes that were only following the key signature are left alone
// ---------------------------------------------------------------------------
console.log('bar fix-up leaves key-signature notes alone');
{
  const fSharp = makeNote(7, 'SHARP');  // explicit F# in a G major bar
  const plainF = makeNote(7, null);     // implicit, following the key signature
  plainF._tpc = 20;                     // ... which makes it an F# too
  const score = makeScore([{ tick: 0, bar: 0,
    annotations: [staffText('.#...#...')],
    voices: { 0: [fSharp, plainF] } }]);
  score.selection.elements = [fSharp];
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(fSharp.line, 6, 'F# moved up to G');
  eq(plainF.tpc, 20, 'the following F keeps the key signature sharp');
  eq(plainF.accidentalType, Accidental.NONE,
     'and is not given a redundant accidental');
}

console.log('arrows without an annotation are silent');
{
  const a = makeNote(10, 'NATURAL_TWO_ARROWS_UP');
  const b = makeNote(10, 'NATURAL_TWO_ARROWS_UP');
  const score = makeScore([{ tick: 0, bar: 0, voices: { 0: [a, b] } }]);
  run(['core.js', 'tune.js'], score, { direction: 1 });
  close(a.tuning, 0, 'two arrows on C4 sound like C4');
  close(b.tuning, 0, 'and the arrows do not leak into the tuning');
}

// ---------------------------------------------------------------------------
// 10. Individual note selection
// ---------------------------------------------------------------------------
console.log('individual note selection');
{
  const c4 = makeNote(10, null);
  const score = makeScore([{ tick: 0, bar: 0, voices: { 0: [c4] } }]);
  score.selection.elements = [c4];
  run(['core.js', 'pitch.js'], score, { direction: 1 });
  eq(c4.line, 9, 'the selected note was transposed');

  const untouched = makeNote(10, null);
  const score2 = makeScore([{ tick: 0, bar: 0, voices: { 0: [untouched] } }]);
  const api2 = run(['core.js', 'pitch.js'], score2, { direction: 1 });
  eq(untouched.line, 10, 'nothing else moved');
  eq(api2.calls.cmd.length, 1, 'without a selection MuseScore is asked to do it');
  eq(api2.calls.cmd[0], 'pitch-up', 'through the pitch-up command');
}

console.log('\n' + (failures === 0 ? 'all good' : failures + ' failure(s)') +
            ' (' + checks + ' checks)');
process.exit(failures === 0 ? 0 : 1);
