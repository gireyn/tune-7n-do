import QtQuick 2.1
import QtQuick.Controls 1.3
import QtQuick.Controls.Styles 1.3
import QtQuick.Dialogs 1.1
import MuseScore 3.0

// ---------------------------------------------------------------------------
//  GENERATED FILE -- do not edit.
//  Built by build.py from src/core.js plus src/tune.js
// ---------------------------------------------------------------------------

MuseScore {

      MessageDialog {
        id: errorDialog
        title: '7n-DO plugin:'
        text: ''
        onAccepted: Qt.quit()
      }

      version: "1.0.0"
      description: "Retune the selection (or the whole score) to a 7n-DO scale."
      menuPath: "Plugins.7n-DO.Tune"

      // =====================================================================
      //  7n-DO core
      //
      //  Two procedures are kept strictly apart:
      //
      //  * MAPPING  -- where a written pitch NAME sits in the lattice.  Here the
      //    lattice is exactly 7-EDO with the 3/1 generator fixed at 2^(11/7),
      //    so the apotome (sharpness) is 0: C, C#, Cx, Cb, Cbb, Cd, C+, C#+ ...
      //    are all THE SAME nominal.  The only thing that moves a note away
      //    from its nominal is an arrow accidental (1..4 arrows, up or down).
      //    Arrows subdivide the gap to the neighbouring nominal into a number
      //    of equal parts ("relative" mode) or move by a fixed number of
      //    224-EDO steps ("absolute" mode).
      //
      //  * TUNING   -- what frequency each resulting pitch name actually gets.
      //    A tuning is given by seven deviations of the seven adjacent gaps
      //    from 32/224 octaves, plus where that gap pattern starts.
      //
      //  Every number below that could disagree between the three plugins lives
      //  in this file, which is byte-identical in all three .qml files (built by
      //  build.py -- edit src/, never the generated .qml).
      // =====================================================================

      // ---- fixed numbers --------------------------------------------------
      // 224-EDO steps per 7-EDO step.
      property double stepsPerNominal: 32.0
      // 224-EDO steps per octave (only used for documentation / messages).
      property int resolution: 224
      // The seven nominals of the chain of fifths, in pitch order.
      property variant nominalNames: ['c', 'd', 'e', 'f', 'g', 'a', 'b']
      // 12-EDO semitones of each natural nominal, measured from C.
      property variant natSemitones: [0, 2, 4, 5, 7, 9, 11]
      // Position of each natural nominal in the chain of fifths (C = 0).
      property variant natFifths: [0, 2, 4, -1, 1, 3, 5]
      // Reference frequency used by the "balanced" tuning centering.
      property double defaultC4: 261.6255653005986
      // A gap pattern is only accepted if it closes the octave this tightly.
      property double gapSumTolerance: 1.0 / 20736.0
      // MuseScore has no support for more than four arrows on one accidental.
      property int maxArrows: 4
      // Tolerance for comparing two log2 pitches (in octaves).
      property double eps: 0.000000001

      // ---------------------------------------------------------------------
      //  Accidental text codes  ->  [number of sharps, number of arrows]
      //
      //  The number of sharps is what the 7-EDO mapping multiplies by 0, so it
      //  is only kept for displaying and for key-signature bookkeeping.  The
      //  arrows are the part that actually moves the pitch.
      // ---------------------------------------------------------------------
      property variant accCodes: (function () {
        return {
          // pitch-neutral flavours of zero arrows
          '': [0, 0],
          'd': [-0.5, 0], 'db': [-1.5, 0], 'bd': [-1.5, 0],
          '+': [0.5, 0], '#+': [1.5, 0], '+#': [1.5, 0],
          'b': [-1, 0], 'bb': [-2, 0], 'bbb': [-3, 0],
          '#': [1, 0], 'x': [2, 0], '#x': [3, 0],

          // natural flavour
          'v': [0, -1], 'v1': [0, -1], 'v2': [0, -2], 'v3': [0, -3], 'v4': [0, -4],
          '^': [0, 1], '^1': [0, 1], '^2': [0, 2], '^3': [0, 3], '^4': [0, 4],

          // flat flavour
          'bv': [-1, -1], 'bv1': [-1, -1], 'bv2': [-1, -2], 'bv3': [-1, -3], 'bv4': [-1, -4],
          'b^': [-1, 1], 'b^1': [-1, 1], 'b^2': [-1, 2], 'b^3': [-1, 3], 'b^4': [-1, 4],

          // double flat flavour
          'bbv': [-2, -1], 'bbv1': [-2, -1], 'bbv2': [-2, -2], 'bbv3': [-2, -3], 'bbv4': [-2, -4],
          'bb^': [-2, 1], 'bb^1': [-2, 1], 'bb^2': [-2, 2], 'bb^3': [-2, 3], 'bb^4': [-2, 4],

          // sharp flavour
          '#v': [1, -1], '#v1': [1, -1], '#v2': [1, -2], '#v3': [1, -3], '#v4': [1, -4],
          '#^': [1, 1], '#^1': [1, 1], '#^2': [1, 2], '#^3': [1, 3], '#^4': [1, 4],

          // double sharp flavour
          'xv': [2, -1], 'xv1': [2, -1], 'xv2': [2, -2], 'xv3': [2, -3], 'xv4': [2, -4],
          'x^': [2, 1], 'x^1': [2, 1], 'x^2': [2, 2], 'x^3': [2, 3], 'x^4': [2, 4]
        };
      })()

      // ---------------------------------------------------------------------
      //  Accidental enum  ->  number of arrows it carries.
      //  Anything that is not listed (half flats/sharps, triples, naturals)
      //  is pitch neutral: zero arrows in this mapping.
      //
      //  A switch rather than a lookup table: reading MuseScore's enum values
      //  while the QML component is still being constructed is unreliable, and
      //  a table would have to live in a QML property.
      // ---------------------------------------------------------------------
      function arrowsOfAccidentalCode(code) {
        if (code === null || code === undefined)
          return 0;
        switch (code) {
        // ---- natural flavour ----
        case Accidental.NATURAL_ARROW_UP:
        case Accidental.NATURAL_ONE_ARROW_UP:
          return 1;
        case Accidental.NATURAL_TWO_ARROWS_UP:
          return 2;
        case Accidental.NATURAL_THREE_ARROWS_UP:
          return 3;
        case Accidental.RAISE_ONE_SEPTIMAL_COMMA:
          return 4;
        case Accidental.NATURAL_ARROW_DOWN:
        case Accidental.NATURAL_ONE_ARROW_DOWN:
          return -1;
        case Accidental.NATURAL_TWO_ARROWS_DOWN:
          return -2;
        case Accidental.NATURAL_THREE_ARROWS_DOWN:
          return -3;
        case Accidental.LOWER_ONE_SEPTIMAL_COMMA:
          return -4;
        // ---- sharp flavour (# plus arrows) ----
        case Accidental.SHARP_ARROW_UP:
        case Accidental.SHARP_ONE_ARROW_UP:
          return 1;
        case Accidental.SHARP_TWO_ARROWS_UP:
          return 2;
        case Accidental.SHARP_THREE_ARROWS_UP:
          return 3;
        case Accidental.SHARP_SLASH2:
          return 4;
        case Accidental.SHARP_ARROW_DOWN:
        case Accidental.SHARP_ONE_ARROW_DOWN:
          return -1;
        case Accidental.SHARP_TWO_ARROWS_DOWN:
          return -2;
        case Accidental.SHARP_THREE_ARROWS_DOWN:
          return -3;
        case Accidental.RAISE_ONE_TRIDECIMAL_QUARTERTONE:
          return -4;
        // ---- flat flavour ----
        case Accidental.FLAT_ARROW_UP:
        case Accidental.FLAT_ONE_ARROW_UP:
          return 1;
        case Accidental.FLAT_TWO_ARROWS_UP:
          return 2;
        case Accidental.FLAT_THREE_ARROWS_UP:
          return 3;
        case Accidental.FOUR_TWELFTH_FLAT:
          return 4;
        case Accidental.FLAT_ARROW_DOWN:
        case Accidental.FLAT_ONE_ARROW_DOWN:
          return -1;
        case Accidental.FLAT_TWO_ARROWS_DOWN:
          return -2;
        case Accidental.FLAT_THREE_ARROWS_DOWN:
          return -3;
        case Accidental.THREE_TWELFTH_FLAT:
          return -4;
        // ---- double flat flavour ----
        case Accidental.FLAT2_ARROW_UP:
        case Accidental.DOUBLE_FLAT_ONE_ARROW_UP:
          return 1;
        case Accidental.DOUBLE_FLAT_TWO_ARROWS_UP:
          return 2;
        case Accidental.DOUBLE_FLAT_THREE_ARROWS_UP:
          return 3;
        case Accidental.TEN_TWELFTH_FLAT:
          return 4;
        case Accidental.FLAT2_ARROW_DOWN:
        case Accidental.DOUBLE_FLAT_ONE_ARROW_DOWN:
          return -1;
        case Accidental.DOUBLE_FLAT_TWO_ARROWS_DOWN:
          return -2;
        case Accidental.DOUBLE_FLAT_THREE_ARROWS_DOWN:
          return -3;
        case Accidental.NINE_TWELFTH_FLAT:
          return -4;
        // ---- double sharp flavour ----
        case Accidental.SHARP2_ARROW_UP:
        case Accidental.DOUBLE_SHARP_ONE_ARROW_UP:
          return 1;
        case Accidental.DOUBLE_SHARP_TWO_ARROWS_UP:
          return 2;
        case Accidental.DOUBLE_SHARP_THREE_ARROWS_UP:
          return 3;
        case Accidental.DOUBLE_SHARP_EQUAL_TEMPERED:
          return 4;
        case Accidental.SHARP2_ARROW_DOWN:
        case Accidental.DOUBLE_SHARP_ONE_ARROW_DOWN:
          return -1;
        case Accidental.DOUBLE_SHARP_TWO_ARROWS_DOWN:
          return -2;
        case Accidental.DOUBLE_SHARP_THREE_ARROWS_DOWN:
          return -3;
        case Accidental.SAGITTAL_SHARP25SD:
          return -4;
        default:
          // naturals, half flats/sharps, triple accidentals: pitch neutral
          return 0;
        }
      }

      // ---------------------------------------------------------------------
      //  (number of sharps in the key signature, number of arrows)  ->
      //  MuseScore accidental.  Used when the transposing plugins have to
      //  write a new accidental.  Returns null for "no accidental at all".
      // ---------------------------------------------------------------------
      function arrowAccidentalType(flavour, arrows) {
        if (arrows === 0)
          return null;
        var a = Math.abs(arrows);
        var up = arrows > 0;
        var f = flavour;
        // Only natural / flat / double flat / sharp / double sharp flavours have
        // a full set of arrow glyphs.  Anything else (triple, half) falls back
        // to the natural flavour.
        if (f !== Math.floor(f) || f > 2 || f < -2)
          f = 0;
        switch (f) {
        case -2:
          if (a === 1) return up ? Accidental.DOUBLE_FLAT_ONE_ARROW_UP : Accidental.DOUBLE_FLAT_ONE_ARROW_DOWN;
          if (a === 2) return up ? Accidental.DOUBLE_FLAT_TWO_ARROWS_UP : Accidental.DOUBLE_FLAT_TWO_ARROWS_DOWN;
          if (a === 3) return up ? Accidental.DOUBLE_FLAT_THREE_ARROWS_UP : Accidental.DOUBLE_FLAT_THREE_ARROWS_DOWN;
          return up ? Accidental.TEN_TWELFTH_FLAT : Accidental.NINE_TWELFTH_FLAT;
        case -1:
          if (a === 1) return up ? Accidental.FLAT_ONE_ARROW_UP : Accidental.FLAT_ONE_ARROW_DOWN;
          if (a === 2) return up ? Accidental.FLAT_TWO_ARROWS_UP : Accidental.FLAT_TWO_ARROWS_DOWN;
          if (a === 3) return up ? Accidental.FLAT_THREE_ARROWS_UP : Accidental.FLAT_THREE_ARROWS_DOWN;
          return up ? Accidental.FOUR_TWELFTH_FLAT : Accidental.THREE_TWELFTH_FLAT;
        case 1:
          if (a === 1) return up ? Accidental.SHARP_ONE_ARROW_UP : Accidental.SHARP_ONE_ARROW_DOWN;
          if (a === 2) return up ? Accidental.SHARP_TWO_ARROWS_UP : Accidental.SHARP_TWO_ARROWS_DOWN;
          if (a === 3) return up ? Accidental.SHARP_THREE_ARROWS_UP : Accidental.SHARP_THREE_ARROWS_DOWN;
          return up ? Accidental.SHARP_SLASH2 : Accidental.RAISE_ONE_TRIDECIMAL_QUARTERTONE;
        case 2:
          if (a === 1) return up ? Accidental.DOUBLE_SHARP_ONE_ARROW_UP : Accidental.DOUBLE_SHARP_ONE_ARROW_DOWN;
          if (a === 2) return up ? Accidental.DOUBLE_SHARP_TWO_ARROWS_UP : Accidental.DOUBLE_SHARP_TWO_ARROWS_DOWN;
          if (a === 3) return up ? Accidental.DOUBLE_SHARP_THREE_ARROWS_UP : Accidental.DOUBLE_SHARP_THREE_ARROWS_DOWN;
          return up ? Accidental.DOUBLE_SHARP_EQUAL_TEMPERED : Accidental.SAGITTAL_SHARP25SD;
        default:
          if (a === 1) return up ? Accidental.NATURAL_ONE_ARROW_UP : Accidental.NATURAL_ONE_ARROW_DOWN;
          if (a === 2) return up ? Accidental.NATURAL_TWO_ARROWS_UP : Accidental.NATURAL_TWO_ARROWS_DOWN;
          if (a === 3) return up ? Accidental.NATURAL_THREE_ARROWS_UP : Accidental.NATURAL_THREE_ARROWS_DOWN;
          return up ? Accidental.RAISE_ONE_SEPTIMAL_COMMA : Accidental.LOWER_ONE_SEPTIMAL_COMMA;
        }
      }

      // ---------------------------------------------------------------------
      //  Small helpers
      // ---------------------------------------------------------------------
      function clog(msg) {
        // Flip to true for a very chatty debug log.
        if (false)
          console.log(msg);
      }

      // Warnings are collected while scanning (parms.warnings) and shown once
      // at the end, so a typo in a tuning annotation does not silently
      // mis-tune the score.  They deliberately live in a plain object rather
      // than in a QML property.
      function warn(parms, msg) {
        for (var i = 0; i < parms.warnings.length; i++) {
          if (parms.warnings[i] === msg)
            return; // the same text is scanned once per voice
        }
        parms.warnings.push(msg);
        console.log('7n-do: ' + msg);
      }

      // Ends the run, first reporting any annotation that could not be read.
      function finishRun(parms) {
        if (parms.warnings.length > 0) {
          errorDialog.text = 'These annotations could not be read:\n\n- ' +
                             parms.warnings.join('\n- ');
          parms.warnings = [];
          errorDialog.open();
        } else {
          Qt.quit();
        }
      }

      // Where the run applies.  No selection at all means the whole score.
      function selectionRange() {
        var cursor = curScore.newCursor();
        cursor.rewind(1);
        if (!cursor.segment) {
          return {
            full: true,
            startStaff: 0,
            endStaff: curScore.nstaves - 1,
            startTick: -1,
            endTick: 1e18
          };
        }
        var startStaff = cursor.staffIdx;
        var startTick = cursor.tick;
        cursor.rewind(2);
        var endTick;
        if (cursor.tick == 0)
          endTick = curScore.lastSegment.tick + 1; // selection includes the last measure
        else
          endTick = cursor.tick;
        return {
          full: false,
          startStaff: startStaff,
          endStaff: cursor.staffIdx,
          startTick: startTick,
          endTick: endTick
        };
      }

      // MuseScore stores formatting codes (<b>, <font ...>) inside annotation
      // text.  Strip everything between angle brackets.
      function removeFormattingCode(str) {
        if (typeof (str) == 'string')
          return str.replace(/<[^>]*>/g, '');
        return null;
      }

      function mod7(n) {
        return ((n % 7) + 7) % 7;
      }

      // Evaluates a JavaScript expression from an annotation.  Returns a finite
      // number, or null when the text is not a usable expression.
      function evalNumber(str) {
        var v;
        try {
          v = eval('(' + String(str).trim() + ')');
        } catch (e) {
          return null;
        }
        if (typeof v === 'number' && isFinite(v))
          return v;
        return null;
      }

      // ---------------------------------------------------------------------
      //  Text annotation parsers.  Each returns null when the text is not an
      //  annotation of that kind.
      // ---------------------------------------------------------------------

      // Splits the inside of a gap list on the commas that separate items, so
      // an expression such as Math.pow(2, 3) - 1 keeps its own commas.
      function splitGapList(text) {
        var parts = [];
        var depth = 0;
        var current = '';
        for (var i = 0; i < text.length; i++) {
          var c = text.charAt(i);
          if (c === '(' || c === '[' || c === '{') {
            depth++;
          } else if (c === ')' || c === ']' || c === '}') {
            depth--;
          } else if (c === ',' && depth <= 0) {
            parts.push(current);
            current = '';
            continue;
          }
          current += c;
        }
        parts.push(current);
        return parts;
      }

      // "[1.05, -2.24, ..., 3.10]1"  or  "[...]g"
      // Each item is a JavaScript expression, like every other annotation here:
      //   [bal(1.04)[0], -2, Math.pow(2,0)-1, ...]g
      // Returns {gaps: [7 numbers], start: 0..6} or {error: 'message'}.
      function parseScaleAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^\[(.*)\]\s*([0-6a-gA-G])$/);
        if (!m)
          return null;
        var parts = splitGapList(m[1]);
        if (parts.length !== 7)
          return { error: 'the gap list must contain exactly 7 numbers, found ' + parts.length };
        var gaps = [];
        var sum = 0;
        for (var i = 0; i < parts.length; i++) {
          var v = evalNumber(parts[i]);
          if (v === null)
            return { error: 'gap #' + (i + 1) + ' ("' + parts[i].trim() +
                            '") is not a number or an expression' };
          gaps.push(v);
          sum += v;
        }
        if (Math.abs(sum) >= gapSumTolerance)
          return { error: 'the seven gaps must close the octave, |sum| = ' + Math.abs(sum) +
                          ' must be less than 1/20736 (' + gapSumTolerance + ')' };
        gaps = unf(gaps);
        var last = m[2];
        var start;
        if (last >= '0' && last <= '6')
          start = parseInt(last, 10);
        else
          start = nominalNames.indexOf(last.toLowerCase());
        if (start < 0 || start > 6)
          return { error: 'the letter after the bracket must be 0-6 or C-B' };
        return { gaps: gaps, start: start };
      }

      // balycalai.py's unf(): a pattern that is given in raw scale form (every
      // entry inside (1/3, 2)) is converted with bal() first; then the mean is
      // removed so the pattern is exactly period-closed.
      function unf(sc) {
        var raw = true;
        for (var i = 0; i < sc.length; i++) {
          if (!(sc[i] > 1.0 / 3.0 && sc[i] < 2.0))
            raw = false;
        }
        var src = sc;
        if (raw) {
          src = [];
          for (var j = 0; j < sc.length; j++)
            src.push((sc[j] - 1) * stepsPerNominal);
        }
        var mean = 0;
        for (var k = 0; k < src.length; k++)
          mean += src[k];
        mean /= src.length;
        var out = [];
        for (var l = 0; l < src.length; l++)
          out.push(src[l] - mean);
        return out;
      }

      // "relative 3"                 -> {mode:'relative', step:3, lo:null, hi:null}
      // "absolute 5*Math.LN2"        -> {mode:'absolute', step:..., lo:null, hi:null}
      // "-1 4 relative 3"            -> {... lo:-1, hi:4}
      function parseArrowModeAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var t = text.trim();
        var m = t.match(/^(relative|absolute)\s+([\s\S]+)$/i);
        if (m) {
          var step = evalNumber(m[2]);
          if (step === null || !(step > 0))
            return { error: '"' + m[2].trim() + '" is not a positive number' };
          return { mode: m[1].toLowerCase(), step: step, lo: null, hi: null };
        }
        m = t.match(/^(\S+)\s+(\S+)\s+(relative|absolute)\s+([\s\S]+)$/i);
        if (m) {
          var lo = evalNumber(m[1]);
          var hi = evalNumber(m[2]);
          var st = evalNumber(m[4]);
          if (lo === null || hi === null || st === null || !(st > 0))
            return { error: 'could not read the arrow limits or the step size' };
          lo = clampArrow(lo);
          hi = clampArrow(hi);
          if (lo > hi) {
            var tmp = lo;
            lo = hi;
            hi = tmp;
          }
          return { mode: m[3].toLowerCase(), step: st, lo: lo, hi: hi };
        }
        return null;
      }

      function clampArrow(v) {
        var r = Math.round(v);
        if (r > maxArrows) r = maxArrows;
        if (r < -maxArrows) r = -maxArrows;
        return r;
      }

      // "total: +32"
      function parseTotalAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^total\s*:?\s*([\s\S]+)$/i);
        if (!m)
          return null;
        var v = evalNumber(m[1]);
        if (v === null)
          return { error: '"' + m[1].trim() + '" is not a number' };
        return { value: v };
      }

      // "C4: 261.6255653005986"  (also "d3: 144.45Hz", "C4: 440*2^(1/4)")
      function parseCenterAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^([a-gA-G])(-?[0-9]+)\s*:\s*([\s\S]+)$/);
        if (!m)
          return null;
        var nominal = nominalNames.indexOf(m[1].toLowerCase());
        if (nominal < 0)
          return null;
        var freqText = m[3].trim().replace(/\s*hz$/i, '');
        var freq = evalNumber(freqText);
        if (freq === null || !(freq > 0))
          return { error: '"' + m[3].trim() + '" is not a positive frequency' };
        return { nominal: nominal, octave: parseInt(m[2], 10), freq: freq };
      }

      // "t: Bb"  (transposing instrument, fifth based)
      property variant fifthsFromC: { 'f': -1, 'c': 0, 'g': 1, 'd': 2, 'a': 3, 'e': 4, 'b': 5 }
      property variant standardAccFifths: { 'bbb': -21, 'bb': -14, 'b': -7, '': 0, '#': 7, 'x': 14, '#x': 21 }

      function parseTranspositionAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^t\s*:\s*([a-gA-G])\s*(.*)$/i);
        if (!m)
          return null;
        var nominal = m[1].toLowerCase();
        var acc = m[2].trim().toLowerCase();
        if (fifthsFromC[nominal] === undefined || standardAccFifths[acc] === undefined)
          return null;
        return { fifths: fifthsFromC[nominal] + standardAccFifths[acc] };
      }

      // "config: {showallaccidentals: true}"
      function parseConfigAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^config\s*:\s*([\s\S]+)$/i);
        if (!m)
          return null;
        var obj;
        try {
          obj = eval('(' + m[1].trim() + ')');
        } catch (e) {
          return { error: 'could not parse the config object' };
        }
        if (typeof obj !== 'object' || obj === null)
          return { error: 'the config annotation must contain an object' };
        return { config: obj };
      }

      // ".c.d.e.f.g.a.b"  ->  { c: {f: 0, a: 0}, d: ..., b: ... }
      function parseKeySigAnnotation(text) {
        if (typeof text !== 'string')
          return null;
        var m = text.trim().match(/^\.(.*)\.(.*)\.(.*)\.(.*)\.(.*)\.(.*)\.(.*)$/);
        if (!m)
          return null;
        var out = {};
        for (var i = 1; i <= 7; i++) {
          var code = m[i].replace(/\s+/g, '').toLowerCase();
          var info = accCodes[code];
          if (info === undefined)
            return { error: 'unknown accidental code "' + m[i].trim() + '" at position ' + i };
          out[nominalNames[i - 1]] = { f: info[0], a: info[1] };
        }
        return { keySig: out };
      }

      // ---------------------------------------------------------------------
      //  Tuning state
      //
      //  gaps   : seven deviations (in 224-EDO steps) from a plain 32-step gap
      //  start  : which nominal the first gap starts from (0 = C, 1 = D ...)
      //  mode   : 'none' (no arrow lattice: arrows are silent), 'relative' or 'absolute'
      //  step   : relative -> how many parts the gap is divided into
      //           absolute -> how many 224-EDO steps one arrow is worth
      //  lo/hi  : how many arrows may be generated (recognised arrows are not
      //           limited by this)
      //  total  : extra shift in 224-EDO steps from the default centering
      //  center : {nominal, octave, freq} when a note is pinned to a frequency
      // ---------------------------------------------------------------------
      function defaultTuning() {
        return {
          gaps: [0, 0, 0, 0, 0, 0, 0],
          start: 0,
          mode: 'none',
          step: 1,
          lo: null,
          hi: null,
          total: null,
          center: null
        };
      }

      function defaultKeySig() {
        var ks = {};
        for (var i = 0; i < nominalNames.length; i++)
          ks[nominalNames[i]] = { f: 0, a: 0 };
        return ks;
      }

      // g[m] = size of the gap from nominal m to nominal m+1, in octaves.
      function tuningGaps(t) {
        var g = [];
        for (var m = 0; m < 7; m++)
          g.push((stepsPerNominal + t.gaps[mod7(m - t.start)]) / resolution);
        return g;
      }

      // L[m] = log2 pitch of nominal m above the C of the same octave.
      function tuningL(t) {
        var g = tuningGaps(t);
        var L = [0];
        for (var m = 1; m < 7; m++)
          L.push(L[m - 1] + g[m - 1]);
        return L;
      }

      // The octave that the gap pattern must add up to; a pattern that has been
      // through unf() closes exactly.
      function tuningPeriod(t) {
        var g = tuningGaps(t);
        var s = 0;
        for (var m = 0; m < 7; m++)
          s += g[m];
        return s;
      }

      // Default centering: the arithmetic mean of log2(pitch) over C..B is the
      // same as for plain 7-EDO anchored at C4 = 261.6255653005986 Hz.
      function balancedShift(L) {
        var sum = 0;
        for (var m = 0; m < 7; m++)
          sum += L[m];
        // mean over C..B of standard 7-EDO = (0 + 1/7 + ... + 6/7)/7 = 3/7 octaves
        return 3.0 / 7.0 - sum / 7.0;
      }

      // The global octave shift that places the whole scale in the world.
      // A "total" annotation always switches to balanced centering and then
      // shifts by total/224 octaves; a fixed center pins one note instead.
      // Either way the RELATIVE tuning never changes.
      function tuningShift(t, L) {
        if (t.total !== null)
          return balancedShift(L) + t.total / resolution;
        if (t.center !== null) {
          var want = Math.log(t.center.freq / defaultC4) / Math.LN2;
          return want - (t.center.octave - 4) - L[t.center.nominal];
        }
        return balancedShift(L);
      }

      // log2 pitch of an arbitrary nominal index (0 = C4, 7 = C5, -1 = B3)
      // with a number of arrows attached, in octaves above C4.
      function nominalPitch(L, shift, idx) {
        var m = mod7(idx);
        var oct = (idx - m) / 7;
        return L[m] + shift + oct;
      }

      // How much one arrow is worth at nominal m, in octaves, on the side it
      // points to.  relative: one x-th of the tuned gap.  absolute: step/224.
      function arrowUnit(t, L, m, dir) {
        if (t.mode === 'none')
          return 0; // no arrow lattice in force: arrows are notation only
        if (t.mode === 'absolute')
          return t.step / resolution;
        var gap;
        if (dir > 0)
          gap = (m < 6) ? (L[m + 1] - L[m]) : (1.0 + L[0] - L[6]);
        else
          gap = (m > 0) ? (L[m] - L[m - 1]) : (1.0 + L[0] - L[6]);
        return gap / t.step;
      }

      // Full log2 pitch of a spelled pitch: nominal index plus arrows.
      function pitchOf(t, L, shift, idx, arrows) {
        var base = nominalPitch(L, shift, idx);
        if (!arrows)
          return base;
        return base + arrows * arrowUnit(t, L, mod7(idx), arrows > 0 ? 1 : -1);
      }

      // How many arrows may be generated by the transposing plugins by default.
      //   relative x : ceil((x-1)/2)   -- enough spellings to cover every step
      //   absolute y : ceil((gap/y-1)/2) with gap = largest tuned gap
      function defaultArrowLimit(t) {
        if (t.mode === 'none')
          return 0;
        var k;
        if (t.mode === 'relative') {
          k = Math.ceil((t.step - 1) / 2);
        } else {
          var biggest = 0;
          for (var i = 0; i < 7; i++) {
            if (t.gaps[i] + stepsPerNominal > biggest)
              biggest = t.gaps[i] + stepsPerNominal;
          }
          k = Math.ceil((biggest / t.step - 1) / 2);
        }
        if (k > maxArrows) k = maxArrows;
        if (k < 0) k = 0;
        return k;
      }

      function clampLimits(t) {
        var k = defaultArrowLimit(t);
        if (t.lo === null || t.lo === undefined)
          t.lo = -k;
        if (t.hi === null || t.hi === undefined)
          t.hi = k;
        if (t.lo < -maxArrows) t.lo = -maxArrows;
        if (t.hi > maxArrows) t.hi = maxArrows;
        if (t.lo > 0) t.lo = 0;
        if (t.hi < 0) t.hi = 0;
        return t;
      }

      // ---------------------------------------------------------------------
      //  Annotation history: one array of {tick, ...} per annotation kind, per
      //  staff.  Whatever was written last at or before a tick is the state
      //  in force for that tick.
      // ---------------------------------------------------------------------
      function newAnnotationHistory() {
        return {
          scale: [],      // {tick, gaps, start}
          mode: [],       // {tick, mode, step, lo, hi}
          total: [],      // {tick, value}
          center: [],     // {tick, nominal, octave, freq}
          trans: [],      // {tick, fifths}
          keySig: [],     // {tick, keySig}
          config: []      // {tick, config}
        };
      }

      function latestAt(history, tick) {
        var best = null;
        var bestTick = -1e18;
        for (var i = 0; i < history.length; i++) {
          if (history[i].tick <= tick && history[i].tick >= bestTick) {
            best = history[i];
            bestTick = history[i].tick;
          }
        }
        return best;
      }

      // Builds the full tuning state in force for one staff at one tick.
      function tuningAt(history, tick) {
        var t = defaultTuning();
        var e = latestAt(history.scale, tick);
        if (e) {
          t.gaps = e.gaps;
          t.start = e.start;
        }
        e = latestAt(history.mode, tick);
        if (e) {
          t.mode = e.mode;
          t.step = e.step;
          t.lo = e.lo;
          t.hi = e.hi;
        }
        e = latestAt(history.total, tick);
        if (e)
          t.total = e.value;
        e = latestAt(history.center, tick);
        if (e)
          t.center = { nominal: e.nominal, octave: e.octave, freq: e.freq };
        return clampLimits(t);
      }

      function keySigAt(history, tick) {
        var e = latestAt(history.keySig, tick);
        return e ? e.keySig : defaultKeySig();
      }

      function transpositionAt(history, tick) {
        var e = latestAt(history.trans, tick);
        return e ? e.fifths : 0;
      }

      function configAt(history, tick) {
        var out = {};
        for (var i = 0; i < history.config.length; i++) {
          if (history.config[i].tick > tick)
            continue;
          var keys = Object.keys(history.config[i].config);
          for (var k = 0; k < keys.length; k++)
            out[keys[k]] = history.config[i].config[keys[k]];
        }
        return out;
      }

      // ---------------------------------------------------------------------
      //  Reading a note
      //
      //  Returns {m, sharps, oct, arrows, explicit} where
      //    m       : nominal index 0=C .. 6=B
      //    sharps  : how many sharps the written accidental/key signature adds
      //              (only used to compensate MuseScore's 12-EDO midi index)
      //    oct     : octave relative to C4
      //    arrows  : the arrows counted for this note (inherited if implicit)
      //  'explicit' says whether the accidental state was read from the note
      //  itself (so the note can be used as a source for later notes in the bar).
      // ---------------------------------------------------------------------
      function nominalOfTpc(tpc) {
        var fifths = tpc - 14;
        return mod7(4 * fifths);
      }

      function sharpsOfTpc(tpc) {
        var fifths = tpc - 14;
        return (fifths - natFifths[mod7(4 * fifths)]) / 7;
      }

      // The accidental enum carried by a note, or null when the note has no
      // accidental element of its own.  Accidental.NONE means "nothing is
      // written on this note", so a following note of the same line inherits.
      function noteAccidentalCode(note) {
        var at = note.accidentalType;
        var code = 0 + at; // NaN when undefined/null, valid int otherwise
        if (!isNaN(code) && code !== Accidental.NONE)
          return code;
        var el = note.accidental;
        if (el !== undefined && el !== null) {
          var code2 = 0 + el.accidentalType;
          if (!isNaN(code2) && code2 !== Accidental.NONE)
            return code2;
        }
        return null;
      }

      function octaveOfNote(note, m, sharps) {
        return Math.round((note.pitch - sharps - natSemitones[m] - 60) / 12);
      }

      // ---------------------------------------------------------------------
      //  Whole-score scan: annotations + every note.
      //
      //  parms.hist[staff]  : annotation history
      //  parms.notes[staff] : {note, tick, bar, line, voice, m, sharps, oct,
      //                        arrows, explicit, seq}
      // ---------------------------------------------------------------------
      function scanScore(parms) {
        var cursor = curScore.newCursor();
        parms.hist = [];
        parms.notes = [];
        parms.warnings = [];

        for (var staff = 0; staff < curScore.nstaves; staff++) {
          var hist = newAnnotationHistory();
          parms.hist.push(hist);
          var list = [];
          parms.notes.push(list);

          for (var voice = 0; voice < 4; voice++) {
            // rewind(1) must come before setting voice/staffIdx, rewind(0) after.
            cursor.rewind(1);
            cursor.staffIdx = staff;
            cursor.voice = voice;
            cursor.rewind(0);

            var barTick = 0;

            while (cursor.segment) {
              if (cursor.measure && cursor.measure.firstSegment &&
                  cursor.segment.tick === cursor.measure.firstSegment.tick)
                barTick = cursor.segment.tick;

              scanAnnotationsAt(cursor, hist, staff, parms);
              scanSegmentNotes(cursor, list, staff, voice, barTick);

              if (!cursor.next())
                break;
            }
          }

          // Second step: an implicit accidental belongs to whatever explicit
          // accidental was written last on the same line, in the same bar, at
          // or before this note.  Notes on the same line inside one chord are
          // ordered left to right, so only notes earlier in the list count.
          var buckets = {};
          for (var a = 0; a < list.length; a++) {
            var e0 = list[a];
            if (!e0.explicit)
              continue;
            var key = e0.bar + ':' + e0.line;
            if (!buckets[key])
              buckets[key] = [];
            buckets[key].push(e0);
          }
          for (var b = 0; b < list.length; b++) {
            var n = list[b];
            if (n.explicit) {
              n.arrows = n.rawArrows;
              continue;
            }
            if (n.sharps !== 0) {
              // a regular accidental is in force, so no arrow can be inherited
              n.arrows = 0;
              continue;
            }
            n.arrows = 0;
            var bucket = buckets[n.bar + ':' + n.line];
            if (!bucket)
              continue;
            var bestTick = -1;
            var bestSeq = -1;
            for (var c = 0; c < bucket.length; c++) {
              var p = bucket[c];
              // only accidentals that come before this note in score order
              if (p.tick > n.tick || p.seq >= n.seq)
                continue;
              if (p.tick > bestTick || (p.tick === bestTick && p.seq > bestSeq)) {
                bestTick = p.tick;
                bestSeq = p.seq;
                n.arrows = p.rawArrows;
              }
            }
          }
        }
      }

      function scanAnnotationsAt(cursor, hist, staff, parms) {
        var anns = cursor.segment.annotations;
        if (!anns)
          return;
        for (var i = 0; i < anns.length; i++) {
          var a = anns[i];
          if (a.name != 'StaffText' && a.name != 'SystemText')
            continue;
          if (a.name == 'StaffText' && Math.floor(a.track / 4) != staff)
            continue;
          handleAnnotationText(removeFormattingCode(a.text), hist, cursor.tick, parms);
        }
      }

      function handleAnnotationText(text, hist, tick, parms) {
        if (typeof text !== 'string')
          return;
        var t = text.trim();
        if (t.length === 0)
          return;
        var r;

        // A tuning pattern.  Checked first: it is the only bracket form.
        r = parseScaleAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'tuning annotation ignored: ' + r.error);
          } else {
            hist.scale.push({ tick: tick, gaps: r.gaps, start: r.start });
          }
          return;
        }

        // Arrow mapping: "relative x", "absolute y", "-1 4 relative 3".
        r = parseArrowModeAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'arrow annotation ignored: ' + r.error);
          } else {
            hist.mode.push({ tick: tick, mode: r.mode, step: r.step, lo: r.lo, hi: r.hi });
          }
          return;
        }

        // "total: +32"
        r = parseTotalAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'total annotation ignored: ' + r.error);
          } else {
            hist.total.push({ tick: tick, value: r.value });
          }
          return;
        }

        // "C4: 261.6255653005986"
        r = parseCenterAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'tuning center annotation ignored: ' + r.error);
          } else {
            hist.center.push({ tick: tick, nominal: r.nominal, octave: r.octave, freq: r.freq });
          }
          return;
        }

        // "t: Bb"
        r = parseTranspositionAnnotation(t);
        if (r) {
          hist.trans.push({ tick: tick, fifths: r.fifths });
          return;
        }

        // "config: {...}"
        r = parseConfigAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'config annotation ignored: ' + r.error);
          } else {
            hist.config.push({ tick: tick, config: r.config });
          }
          return;
        }

        // ".c.d.e.f.g.a.b"
        r = parseKeySigAnnotation(t);
        if (r) {
          if (r.error) {
            warn(parms, 'key signature annotation ignored: ' + r.error);
          } else {
            hist.keySig.push({ tick: tick, keySig: r.keySig });
          }
          return;
        }

        // Anything else (including the now inactive "42edo" and "~3: ..."
        // annotations of the reference plugin) is left alone.
      }

      function scanSegmentNotes(cursor, list, staff, voice, barTick) {
        if (!cursor.element || cursor.element.type != Ms.CHORD)
          return;
        var chord = cursor.element;
        var graces = chord.graceNotes;
        if (graces && graces.length) {
          for (var g = 0; g < graces.length; g++)
            addChordNotes(graces[g].notes, list, staff, voice, cursor.tick, barTick);
        }
        addChordNotes(chord.notes, list, staff, voice, cursor.tick, barTick);
      }

      function addChordNotes(notes, list, staff, voice, tick, barTick) {
        if (!notes)
          return;
        for (var i = 0; i < notes.length; i++) {
          var note = notes[i];
          var m = nominalOfTpc(note.tpc);
          var sharps = sharpsOfTpc(note.tpc);
          var code = noteAccidentalCode(note);
          var entry = {
            note: note,
            tick: tick,
            bar: barTick,
            line: note.line,
            voice: voice,
            staff: staff,
            m: m,
            sharps: sharps,
            oct: octaveOfNote(note, m, sharps),
            explicit: code !== null,
            rawArrows: arrowsOfAccidentalCode(code),
            arrows: 0,
            seq: list.length
          };
          list.push(entry);
        }
      }

      // ---------------------------------------------------------------------
      //  The tuning value to write into note.tuning, in cents, for a note that
      //  reads as (nominal index, arrows) and whose 12-EDO written pitch is
      //  writtenMidi.
      //
      //  MuseScore plays  midi + tuning,  so tuning is simply the difference
      //  between the pitch this system wants and the pitch MuseScore would
      //  produce on its own.
      // ---------------------------------------------------------------------
      function tuningValueFor(t, L, shift, idx, arrows, writtenMidi, transFifths) {
        var want = 1200.0 * pitchOf(t, L, shift, idx, arrows);
        var have = 100.0 * (writtenMidi - 60);
        // MuseScore already applied a 12-EDO fifth-based transposition for
        // transposing instruments; the fifth of this lattice is 1200*4/7 cents.
        var transFix = -transFifths * (700.0 - 4.0 * 1200.0 / 7.0);
        return want - have + transFix;
      }

      // =====================================================================
      //  Tune 7n-DO  --  retune the selection (or the whole score)
      // =====================================================================

      // Writes the tuning value of one note.  The spelling is never touched:
      // in this mapping every sharp/flat flavour is pitch neutral, so the
      // written accidental only matters for display and for MuseScore's
      // invisible 12-EDO midi index, which the tuning value compensates for.
      function tuneEntry(entry, parms) {
        var hist = parms.hist[entry.staff];
        var t = tuningAt(hist, entry.tick);
        var L = tuningL(t);
        var shift = tuningShift(t, L);
        var note = entry.note;
        var isConcert = note.tpc == note.tpc1;
        var trans = isConcert ? 0 : transpositionAt(hist, entry.tick);
        note.tuning = tuningValueFor(t, L, shift, entry.m + 7 * entry.oct,
                                     entry.arrows, note.pitch, trans);
      }

      onRun: {
        if (typeof curScore === 'undefined') {
          Qt.quit();
          return;
        }
        var parms = {};
        scanScore(parms);

        var range = selectionRange();
        for (var staff = range.startStaff; staff <= range.endStaff; staff++) {
          var list = parms.notes[staff];
          if (!list)
            continue;
          for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            if (!range.full && (entry.tick < range.startTick || entry.tick >= range.endTick))
              continue;
            tuneEntry(entry, parms);
          }
        }

        clog('7n-do: tuning done');
        finishRun(parms);
      }
}
