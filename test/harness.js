#!/usr/bin/env node
// Loads the plugin sources as plain JavaScript so the pitch maths can be
// exercised outside MuseScore.
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// QML -> JS: `property <type> <name>: <expr>` becomes `var <name> = (<expr>);`
// and the `onRun:` signal handler becomes a plain function.
function toJs(src) {
  const lines = src.split('\n');
  const out = [];
  const balance = (s) => {
    let n = 0;
    for (const c of s) {
      if ('([{'.indexOf(c) >= 0) n++;
      else if (')]}'.indexOf(c) >= 0) n--;
    }
    return n;
  };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)property\s+\w+\s+(\w+)\s*:\s*(.*)$/);
    if (!m) {
      out.push(lines[i].replace(/^(\s*)onRun\s*:\s*\{/, '$1function __onRun() {'));
      continue;
    }
    let expr = m[3];
    while (balance(expr) > 0 && i + 1 < lines.length) {
      i++;
      expr += '\n' + lines[i];
    }
    out.push(`${m[1]}var ${m[2]} = (${expr});`);
  }
  return out.join('\n');
}

// MuseScore's enums are plain integers; the exact values never matter here as
// long as every name is stable and unique.
function enumStub(pinned) {
  const values = Object.assign({}, pinned || {});
  let next = 100;
  return new Proxy(values, {
    get(target, key) {
      if (typeof key === 'symbol') return undefined;
      if (!(key in target)) target[key] = next++;
      return target[key];
    },
    has() { return true; }
  });
}

const EXPORTS = [
  // core
  'parseScaleAnnotation', 'parseArrowModeAnnotation', 'parseTotalAnnotation',
  'parseCenterAnnotation', 'parseTranspositionAnnotation', 'parseKeySigAnnotation',
  'parseConfigAnnotation', 'handleAnnotationText', 'unf', 'defaultTuning',
  'defaultKeySig', 'tuningGaps', 'tuningL', 'tuningShift', 'balancedShift',
  'pitchOf', 'nominalPitch', 'arrowUnit', 'defaultArrowLimit', 'clampLimits',
  'arrowAccidentalType', 'accCodes', 'arrowTable', 'buildArrowTable', 'defaultC4', 'resolution',
  'stepsPerNominal', 'maxArrows', 'nominalNames', 'natSemitones', 'natFifths',
  'tuningAt', 'keySigAt', 'transpositionAt', 'configAt', 'latestAt',
  'scanScore', 'tuningValueFor', 'noteAccidentalCode', 'nominalOfTpc',
  'sharpsOfTpc', 'octaveOfNote', 'arrowsOfAccidentalCode', 'selectionRange',
  'finishRun',
  // tune
  'tuneEntry', '__onRun',
  // pitch
  'findNextPitch', 'glyphFor', 'transposeEntry', 'pinFollowingNotes',
  'setAccidental', 'findEntryFor'
];

function load(files, globals) {
  const src = files
    .map((f) => toJs(fs.readFileSync(path.join(SRC, f), 'utf8')))
    .join('\n');
  const ret = 'return {' +
    EXPORTS.map((n) => `${n}: (typeof ${n} === 'undefined' ? undefined : ${n})`).join(',') +
    '};';
  const g = Object.assign({ loadWarnings: [] }, globals);
  const factory = new Function(
    'Accidental', 'Ms', 'Element', 'NoteType', 'curScore', 'Qt',
    'newElement', 'cmd', 'errorDialog', 'console', 'warnings', 'direction',
    src + '\n' + ret);
  const api = factory(
    g.Accidental, g.Ms, g.Element, g.NoteType, g.curScore, g.Qt,
    g.newElement, g.cmd, g.errorDialog, console, g.warnings || [],
    g.direction === undefined ? 1 : g.direction);
  // finishRun() assigns a fresh array to `warnings`; expose the live value.
  return api;
}

module.exports = { load, toJs, enumStub, EXPORTS, SRC };
