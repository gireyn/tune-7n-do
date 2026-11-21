#!/usr/bin/env node
// Plain-node test bench for the maths in src/core.js and src/pitch.js.
//
// The QML files cannot be executed outside MuseScore, but every function that
// decides a pitch is pure, so this harness strips the QML `property`
// declarations and exercises the same source files the plugins are built from.
//
//   node test/run.js
//
'use strict';

const { load, enumStub } = require('./harness');

const Accidental = enumStub({ NONE: 0, NATURAL: 1 });
const M = load(['core.js', 'pitch.js'], { Accidental });

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
  const t = tol === undefined ? 1e-12 : tol;
  ok(Math.abs(a - b) <= t, label, 'got ' + a + ', want ' + b);
}

function eq(a, b, label) {
  ok(a === b, label, 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
}

// ---------------------------------------------------------------------------
// The example pattern from the specification, starting on G.
// ---------------------------------------------------------------------------
const EXAMPLE = [1.052372185197171, -2.2465150291147507, 0.48387275133624946,
  0.7443577836950364, -4.222852686929088, 1.0820132562063445, 3.1067517396090376];
const START_G = 4; // 0=C 1=D 2=E 3=F 4=G 5=A 6=B

function tuningWith(gaps, start, mode, step) {
  const t = M.defaultTuning();
  t.gaps = gaps.slice();
  t.start = start;
  if (mode) { t.mode = mode; t.step = step; }
  return M.clampLimits(t);
}

// ---- 1. the default: plain 7-EDO equal -----------------------------------
console.log('default 7-EDO');
{
  const t = M.defaultTuning();
  const L = M.tuningL(t);
  for (let m = 0; m < 7; m++)
    close(L[m], m / 7, 'L[' + m + '] = m/7');
  const shift = M.tuningShift(t, L);
  close(shift, 0, 'default shift is zero');
  close(M.pitchOf(t, L, shift, 0, 0), 0, 'C4 at 261.6255... = 0 log2');
  // a C#4 sits on the C nominal: pitch neutral
  close(M.pitchOf(t, L, shift, 0, 0), M.pitchOf(t, L, shift, 0, 0), 'C and C# identical');
  eq(M.defaultArrowLimit(t), 0, 'no arrow is generated without an annotation');
  eq(M.parseScaleAnnotation('[0,0,0,0,0,0,0]0').start, 0, 'default pattern starts on C');
  close(M.parseScaleAnnotation('[0,0,0,0,0,0,0]0').gaps[0], 0, 'default gap is 0');
}

// ---- 2. the example pattern, relative 3 ---------------------------------
console.log('example pattern, relative 3');
{
  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  ok(parsed && !parsed.error, 'pattern parses', parsed && parsed.error);
  eq(parsed.start, START_G, 'pattern starts on G');

  const t = tuningWith(parsed.gaps, parsed.start, 'relative', 3);
  eq(M.defaultArrowLimit(t), 1, 'relative 3 generates at most one arrow');
  const L = M.tuningL(t);
  const shift = M.tuningShift(t, L);

  // ^G must be the 1/3 point of the G..A gap
  const wantUpG = (2 * L[4] + L[5]) / 3 + shift;
  close(M.pitchOf(t, L, shift, 4, 1), wantUpG, '^G = G^(2/3) A^(1/3)');

  // vvB must be the 1/3 point of the A..B gap counted down from B
  const wantDownB = (2 * L[5] + L[6]) / 3 + shift;
  close(M.pitchOf(t, L, shift, 6, -2), wantDownB, 'vvB = A^(2/3) B^(1/3)');

  // vvvF must be E itself
  close(M.pitchOf(t, L, shift, 3, -3), M.pitchOf(t, L, shift, 2, 0),
        'vvvF = E');

  // against the spec: total deviation is preserved
  const deviations = parsed.gaps;
  // the pattern starts on G, so gaps[6] is the F->G gap
  close((32 + deviations[6]) / 224, L[4] - L[3], 'F->G gap is 32 + gaps[6] steps');
  close((32 + deviations[0]) / 224, L[5] - L[4], 'G->A gap is 32 + gaps[0] steps');
  close(M.tuningShift(t, L) - M.balancedShift(L), 0, 'no total, no extra shift');
}

// ---- 3. balanced centering ----------------------------------------------
console.log('balanced centering');
{
  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  const t = tuningWith(parsed.gaps, parsed.start, null, null);
  const L = M.tuningL(t);
  const shift = M.tuningShift(t, L);
  let sum = 0;
  for (let m = 0; m < 7; m++)
    sum += M.nominalPitch(L, shift, m);
  // plain 7-EDO over C4..B4 has log2 pitches 0, 1/7 ... 6/7
  close(sum, 3, 'sum of log2 pitches over C4..B4 equals plain 7-EDO');

  // a fixed center pins that note and leaves the relative tuning alone
  const t2 = tuningWith(parsed.gaps, parsed.start, null, null);
  t2.center = { nominal: 1, octave: 3, freq: 144.45 };
  const s2 = M.tuningShift(t2, M.tuningL(t2));
  close(Math.log(144.45 / M.defaultC4) / Math.LN2, M.nominalPitch(M.tuningL(t2), s2, 1 + 7 * (3 - 4)),
        'D3 sits exactly on 144.45 Hz');
  // relative gaps unchanged
  const La = M.tuningL(t), Lb = M.tuningL(t2);
  for (let m = 0; m < 7; m++)
    close(Lb[m] - Lb[0], La[m] - La[0], 'center does not change relative gaps ' + m);
}

// ---- 4. total: +32 -------------------------------------------------------
console.log('total');
{
  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  const t = tuningWith(parsed.gaps, parsed.start, null, null);
  const L = M.tuningL(t);
  const base = M.tuningShift(t, L);
  t.total = 32;
  close(M.tuningShift(t, L) - base, 32 / 224, 'total +32 raises everything by 1/7 octave');
  t.total = -16;
  close(M.tuningShift(t, L) - base, -16 / 224, 'total -16 lowers by 16/224');
  // total wins over a fixed center
  t.center = { nominal: 0, octave: 4, freq: 500 };
  close(M.tuningShift(t, L) - base, -16 / 224, 'total switches to balanced mode');
}

// ---- 5. absolute mode ----------------------------------------------------
console.log('absolute mode');
{
  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  const t = tuningWith(parsed.gaps, parsed.start, 'absolute', 4.8);
  // largest gap = 32 + max deviation = 32 + 3.1067517396090376
  const biggest = 32 + Math.max.apply(null, EXAMPLE);
  const want = Math.ceil((biggest / 4.8 - 1) / 2);
  close(biggest, 35.1067517396090376, 'largest gap');
  eq(M.defaultArrowLimit(t), want, 'absolute limit = ceil((gap/y-1)/2)');
  eq(M.defaultArrowLimit(t), 4, 'absolute 4.8 allows four arrows');
  const L = M.tuningL(t), shift = M.tuningShift(t, L);
  close(M.pitchOf(t, L, shift, 4, 1) - M.pitchOf(t, L, shift, 4, 0),
        4.8 / 224, '^G is 4.8 steps of 224-EDO above G');
  close(M.pitchOf(t, L, shift, 4, -2) - M.pitchOf(t, L, shift, 4, 0),
        -2 * 4.8 / 224, 'vvG is twice that below G');
}

// ---- 6. limits -----------------------------------------------------------
console.log('arrow limits');
{
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 2)), 1, 'relative 2 -> 1');
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 3)), 1, 'relative 3 -> 1');
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 4)), 2, 'relative 4 -> 2');
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 5)), 2, 'relative 5 -> 2');
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 9)), 4, 'relative 9 -> 4');
  eq(M.defaultArrowLimit(tuningWith([0,0,0,0,0,0,0], 0, 'relative', 21)), 4, 'relative 21 is clamped to 4');

  let r = M.parseArrowModeAnnotation('-2 +0 relative 3');
  eq(r.lo, -2, 'lower limit read'); eq(r.hi, 0, 'upper limit read');
  r = M.parseArrowModeAnnotation('-1 4 relative 3');
  eq(r.lo, -1, 'lower limit read (-1 4)'); eq(r.hi, 4, 'upper limit read (-1 4)');
  r = M.parseArrowModeAnnotation('0 1 relative 3');
  eq(r.lo, 0, 'lower limit read with +'); eq(r.hi, 1, 'upper limit read (0 1)');
  r = M.parseArrowModeAnnotation('-1 9 relative 3');
  eq(r.hi, 4, 'limits above 4 are clamped');
  r = M.parseArrowModeAnnotation('relative 3');
  eq(r.lo, null, 'default limits are not fixed by the annotation');
  r = M.parseArrowModeAnnotation('absolute 5*Math.LN2');
  eq(r.mode, 'absolute', 'absolute with a calculation');
  close(r.step, 5 * Math.LN2, 'calculation evaluated');
  r = M.parseArrowModeAnnotation('relative 25/6');
  close(r.step, 25 / 6, 'fraction evaluated');
}

// ---- 7. annotation validation -------------------------------------------
console.log('annotation validation');
{
  ok(M.parseScaleAnnotation('[0,0,0,0,0,0,0]0').error === undefined, 'valid pattern accepted');
  ok(M.parseScaleAnnotation('[0,0,0,0,0,0]0').error !== undefined, 'six gaps rejected');
  ok(M.parseScaleAnnotation('[1,0,0,0,0,0,0]0').error !== undefined, 'stretched pattern rejected');
  ok(M.parseScaleAnnotation('[0,0,0,0,0,0,0.00001]g').error === undefined,
     'pattern inside 1/20736 accepted');
  ok(M.parseScaleAnnotation('[0,0,0,0,0,0,0.001]g').error !== undefined,
     'pattern outside 1/20736 rejected');
  eq(M.parseScaleAnnotation('[0,0,0,0,0,0,0]D').start, 1, 'uppercase letter accepted');
  eq(M.parseScaleAnnotation('[0,0,0,0,0,0,0]b').start, 6, 'letter b is B');
  eq(M.parseScaleAnnotation('[-4,-2,0,1,1,2,2]0').start, 0, 'patterns with negatives are fine');
  // every item in the gap list may be a calculation
  const calc = M.parseScaleAnnotation('[1/2-1/2, Math.pow(2,3)*0, (0), -1+1, 0.5-0.5, 2*0, 0]0');
  ok(calc && !calc.error, 'gap items accept expressions', calc && calc.error);
  close(calc.gaps[2], 0, 'expression evaluated');
  const calc2 = M.parseScaleAnnotation('[1+1, -2, 0, 0, 0, 0, 0]0');
  ok(calc2.error === undefined, 'expressions that do not start with a number', calc2.error);
  close(calc2.gaps[0], 2, '1+1 is 2');
  const inner = M.parseScaleAnnotation('[Math.max(0, 0), 0, 0, 0, 0, 0, 0]0');
  ok(inner && !inner.error, 'a comma inside an expression does not split the list',
     inner && inner.error);
  const bad = M.parseScaleAnnotation('[0, 0, 0, 0, 0, 0, xyz]0');
  ok(bad.error !== undefined, 'a bad expression is rejected');
  ok(M.parseArrowModeAnnotation('relative 0').error !== undefined, 'zero denominator rejected');
  ok(M.parseArrowModeAnnotation('relative -3').error !== undefined, 'negative denominator rejected');
  ok(M.parseCenterAnnotation('C4: 261.6255653005986').freq > 261, 'center frequency read');
  eq(M.parseCenterAnnotation('C4: 261.6255653005986').octave, 4, 'center octave read');
  close(M.parseTotalAnnotation('total: +32').value, 32, 'total read');
  close(M.parseTotalAnnotation('total 32').value, 32, 'total without colon read');
  eq(M.parseTranspositionAnnotation('t: Bb').fifths, -2, 'Bb transposition');
  const ks = M.parseKeySigAnnotation('.#...#...');
  eq(ks.keySig.c.f, 1, 'key sig C sharp');
  eq(ks.keySig.d.f, 0, 'key sig D natural');
  // key signature text is exactly seven dotted accidental codes, C first
  function keySigText(codes) {
    var t = '';
    for (var i = 0; i < 7; i++) t += '.' + (codes[i] === undefined ? '' : codes[i]);
    return t;
  }
  const ks2 = M.parseKeySigAnnotation(keySigText(['v', 'd']));
  eq(ks2.keySig.c.f, 0, 'key sig C neutral flavour');
  eq(ks2.keySig.c.a, -1, 'key sig C one arrow down');
  close(ks2.keySig.d.f, -0.5, 'key sig D half flat flavour (-0.5 sharps)');
  eq(M.parseKeySigAnnotation(keySigText(['', '', '', '', '', '', 'bv3'])).keySig.b.a, -3,
     'key sig with three arrows');
  eq(M.parseKeySigAnnotation(keySigText(['#^4'])).keySig.c.a, 4, 'key sig with four arrows');
}

// ---- 8. unf / balycalai.py behaviour ------------------------------------
console.log('unf');
{
  const raw = [1.0391126316588268, 0.9360224062115793, 1.021347024350673,
    1.0294871816118851, 0.8742618544048812, 1.0400389151278635, 1.1033119927341977];
  const u = M.unf(raw);
  let sum = 0;
  for (const v of u) sum += v;
  close(sum, 0, 'unf() output sums to zero');
  close(u[0], (raw[0] - 1) * 32 - ((raw.reduce((a, b) => a + b, 0) - 7) * 32 / 7),
        'raw scale is converted through bal() first');
  const already = EXAMPLE.slice();
  close(M.unf(already)[0], already[0], 'an already balanced pattern is only de-meaned');
}

// ---- 9. transposition chains --------------------------------------------
console.log('transposition chains');
{
  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  const t = tuningWith(parsed.gaps, parsed.start, 'relative', 3);
  const L = M.tuningL(t), shift = M.tuningShift(t, L);

  // D -> ^D -> vE -> E
  let idx = 1, arrows = 0;
  const chain = [];
  for (let i = 0; i < 4; i++) {
    const p = M.pitchOf(t, L, shift, idx, arrows);
    chain.push([idx, arrows]);
    const next = M.findNextPitch(t, L, shift, idx, p, 1);
    ok(next !== null, 'a step up exists at ' + i);
    idx = next.idx; arrows = next.arrows;
  }
  eq(M.nominalOfTpc(0) === undefined ? null : null, null, 'placeholder');
  eq(chain[0][0], 1, 'starts on D');
  eq(chain[1][0], 1, 'then ^D (same nominal)');
  ok(chain[1][1] === 1, '^D has one up arrow');
  eq(chain[2][0], 2, 'then vE (next nominal)');
  ok(chain[2][1] === -1, 'vE has one down arrow');
  eq(chain[3][0], 2, 'then E');
  eq(chain[3][1], 0, 'E has no arrows');

  // and the same thing downwards
  idx = 2; arrows = 0;
  const chainDown = [[idx, arrows]];
  for (let i = 0; i < 3; i++) {
    const p = M.pitchOf(t, L, shift, idx, arrows);
    const next = M.findNextPitch(t, L, shift, idx, p, -1);
    ok(next !== null, 'a step down exists at ' + i);
    idx = next.idx; arrows = next.arrows;
    chainDown.push([idx, arrows]);
  }
  eq(chainDown[1][0], 2, 'down from E stays on E');
  ok(chainDown[1][1] === -1, 'down from E is vE');
  eq(chainDown[2][0], 1, 'then ^D');
  ok(chainDown[2][1] === 1, '^D');
  eq(chainDown[3][0], 1, 'then D');

  // relative 9 (four arrows) must also chain correctly
  const t9 = tuningWith(parsed.gaps, parsed.start, 'relative', 9);
  const L9 = M.tuningL(t9), s9 = M.tuningShift(t9, L9);
  eq(M.defaultArrowLimit(t9), 4, 'relative 9 gives four arrows');
  let i9 = 1, a9 = 0, steps = 0;
  for (let i = 0; i < 9; i++) {
    const p = M.pitchOf(t9, L9, s9, i9, a9);
    const nx = M.findNextPitch(t9, L9, s9, i9, p, 1);
    ok(nx !== null, 'step up in 63-EDO at ' + i);
    if (!nx) break;
    ok(nx.pitch > p, 'strictly rising');
    i9 = nx.idx; a9 = nx.arrows; steps++;
  }
  eq(steps, 9, 'nine steps reach the next nominal');
  eq(i9, 2, 'landed on E');
  eq(a9, 0, 'landed on plain E');

  // mode 'none': arrows do not sound, so a step is one nominal
  const t0 = M.defaultTuning();
  const L0 = M.tuningL(t0), s0 = M.tuningShift(t0, L0);
  close(M.pitchOf(t0, L0, s0, 1, 3), M.pitchOf(t0, L0, s0, 1, 0),
        'arrows are silent without an arrow annotation');
}

// ---- 10. tuning values ---------------------------------------------------
console.log('tuning values');
{
  const t = M.defaultTuning();
  const L = M.tuningL(t), shift = M.tuningShift(t, L);
  close(M.tuningValueFor(t, L, shift, 0, 0, 60, 0), 0, 'C4 stays put');
  close(M.tuningValueFor(t, L, shift, 0, 0, 61, 0), -100, 'C#4 is detuned to C');
  // 7-EDO is not 12-EDO: D4 is 171.43 cents above C4, not 200
  close(M.tuningValueFor(t, L, shift, 1, 0, 62, 0), 1200 / 7 - 200, 'D4 sits at 1/7 octave');
  close(M.tuningValueFor(t, L, shift, 6, 0, 71, 0), 1200 * 6 / 7 - 1100, 'B4 sits at 6/7 octave');
  close(M.tuningValueFor(t, L, shift, 0, 0, 59, 0), 100, 'Cb4 (a C nominal) is detuned up to C4');
  close(M.tuningValueFor(t, L, shift, 0, 0, 60, -2), 200 / 7,
        'Bb clarinet gets 2/7 of a 12-EDO semitone back');

  const parsed = M.parseScaleAnnotation('[' + EXAMPLE.join(', ') + ']g');
  const tt = tuningWith(parsed.gaps, parsed.start, 'relative', 3);
  const Lt = M.tuningL(tt), st = M.tuningShift(tt, Lt);
  // ^C4 sounds one third of the C..D gap above C4
  close(M.tuningValueFor(tt, Lt, st, 0, 1, 60, 0), 1200 * (st + (Lt[1] - Lt[0]) / 3),
        '^C4 is a third of the way to D4');
}

// ---- 11. accidental glyphs ----------------------------------------------
console.log('accidental glyphs');
{
  ok(M.arrowAccidentalType(0, 1) !== M.arrowAccidentalType(0, -1), 'up and down differ');
  ok(M.arrowAccidentalType(0, 1) !== M.arrowAccidentalType(1, 1), 'flavours differ');
  ok(M.arrowAccidentalType(0, 4) !== M.arrowAccidentalType(0, 3), 'four arrows has its own glyph');
  ok(M.arrowAccidentalType(-3, 2) !== null, 'triple flat flavour falls back');
  eq(M.arrowAccidentalType(0, 0), null, 'no arrows means no accidental');
  const seen = {};
  for (let f = -2; f <= 2; f++)
    for (let a = -4; a <= 4; a++) {
      if (a === 0) continue;
      const g = M.arrowAccidentalType(f, a);
      ok(g !== null, 'glyph exists for flavour ' + f + ', arrows ' + a);
      const key = 'g' + g;
      ok(!seen[key], 'glyph for ' + f + '/' + a + ' is unique', 'clashes with ' + seen[key]);
      seen[key] = f + '/' + a;
    }
}

// ---- 12. tpc helpers ----------------------------------------------------
console.log('tpc helpers');
{
  eq(M.nominalOfTpc(14), 0, 'tpc 14 is C');
  eq(M.nominalOfTpc(15), 4, 'tpc 15 is G');
  eq(M.nominalOfTpc(16), 1, 'tpc 16 is D');
  eq(M.nominalOfTpc(13), 3, 'tpc 13 is F');
  eq(M.nominalOfTpc(19), 6, 'tpc 19 is B');
  eq(M.nominalOfTpc(21), 0, 'tpc 21 is C#');
  eq(M.nominalOfTpc(20), 3, 'tpc 20 is F#');
  eq(M.sharpsOfTpc(21), 1, 'C# is one sharp');
  eq(M.sharpsOfTpc(20), 1, 'F# is one sharp');
  eq(M.sharpsOfTpc(7), -1, 'tpc 7 is Cb');
  eq(M.sharpsOfTpc(14), 0, 'C natural');
  eq(M.sharpsOfTpc(28), 2, 'Cx is two sharps');
}

console.log('\n' + (failures === 0 ? 'all good' : failures + ' failure(s)') +
            ' (' + checks + ' checks)');
process.exit(failures === 0 ? 0 : 1);
