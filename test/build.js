#!/usr/bin/env node
// Checks the generated .qml files against the sources they are built from,
// so a stale build cannot be shipped by accident.
//
//   node test/build.js
//
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let failures = 0;
let checks = 0;

function ok(cond, label, extra) {
  checks++;
  if (!cond) {
    failures++;
    console.log('  FAIL  ' + label + (extra === undefined ? '' : '  -- ' + extra));
  }
}

const core = fs.readFileSync(path.join(SRC, 'core.js'), 'utf8');
const tune = fs.readFileSync(path.join(SRC, 'tune.js'), 'utf8');
const pitch = fs.readFileSync(path.join(SRC, 'pitch.js'), 'utf8');

const TARGETS = [
  { file: 'tune 7n-do.qml', main: tune, direction: null },
  { file: 'pitch up.qml', main: pitch, direction: 1 },
  { file: 'pitch down.qml', main: pitch, direction: -1 }
];

const cores = [];

for (const target of TARGETS) {
  console.log(target.file);
  const p = path.join(ROOT, target.file);
  ok(fs.existsSync(p), 'exists');
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');

  ok(text.indexOf(core) >= 0, 'contains the current src/core.js');
  ok(text.indexOf(target.main) >= 0, 'contains the current main block');
  const coreAt = text.indexOf(core);
  cores.push([target.file, text.slice(coreAt, text.indexOf(target.main))]);

  // the shared block must start at the same offset in all three plugins
  const header = text.slice(0, coreAt);
  ok(/^import QtQuick 2\.1\n/.test(header), 'starts with the QtQuick import');
  ok(header.indexOf('MuseScore {') >= 0, 'opens the MuseScore element');
  ok(header.indexOf('id: errorDialog') >= 0, 'declares the warning dialog');

  // rough bracket balance, ignoring the code's own braces in comments is fine
  // because every comment that mentions a brace mentions both
  const open = (text.match(/{/g) || []).length;
  const close = (text.match(/}/g) || []).length;
  ok(open === close, 'curly braces balance (' + open + ' vs ' + close + ')');
  ok(/}\n$/.test(text), 'ends with the closing brace');

  // the direction property is the only difference between up and down
  if (target.direction === null) {
    ok(text.indexOf('property int direction') < 0, 'no direction property');
    ok(/menuPath: "Plugins\.7n-DO\.Tune"/.test(text), 'tune menu path');
  } else {
    ok(new RegExp('property int direction: ' + target.direction).test(text),
       'direction property is ' + target.direction);
    ok(/menuPath: "Plugins\.7n-DO\.(Raise|Lower) Pitch By 1 Step"/.test(text),
       'transposition menu path');
  }
}

// all three share exactly the same core block
if (cores.length === 3) {
  ok(cores[1][1] === cores[0][1],
     'pitch up and tune share the same core block');
  ok(cores[2][1] === cores[0][1],
     'pitch down and tune share the same core block');
}

// up and down differ only in direction
const up = fs.readFileSync(path.join(ROOT, 'pitch up.qml'), 'utf8');
const down = fs.readFileSync(path.join(ROOT, 'pitch down.qml'), 'utf8');
const upBody = up.split('property int direction: 1').join('');
const downBody = down.split('property int direction: -1').join('');
ok(upBody.replace(/"Plugins\.7n-DO\.Raise Pitch By 1 Step"/, '')
       .replace('"Raise the selection by one step of the 7n-DO lattice."', '') ===
   downBody.replace(/"Plugins\.7n-DO\.Lower Pitch By 1 Step"/, '')
           .replace('"Lower the selection by one step of the 7n-DO lattice."', ''),
   'raising and lowering differ only in direction, wording and menu path');

console.log('\n' + (failures === 0 ? 'all good' : failures + ' failure(s)') +
            ' (' + checks + ' checks)');
process.exit(failures === 0 ? 0 : 1);
