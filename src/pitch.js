      // =====================================================================
      //  Transpose by one step of the 7n-DO lattice
      //
      //  direction = +1 (pitch up) or -1 (pitch down), set by the header.
      //
      //  In this mapping a written pitch is (nominal, arrows).  Raising by one
      //  step means: arrange every legal spelled pitch in order, then take the
      //  lowest one that is higher than the current pitch -- regardless of
      //  which nominal it happens to land on.  That reproduces the plain
      //  ups-and-downs chain (D -> ^D -> vE -> E) without any special cases,
      //  and it degrades to "one nominal up" when no arrows are active.
      // =====================================================================

      // Every legal spelling within reach, ordered by actual tuned pitch.
      // Only the current nominal and its two neighbours can be the answer.
      function findNextPitch(t, L, shift, idx, pCur, dir) {
        var best = null;
        for (var dj = -5; dj <= 5; dj++) {
          var i2 = idx + dj;
          for (var a = t.lo; a <= t.hi; a++) {
            var p = pitchOf(t, L, shift, i2, a);
            if (best === null) {
              if (dir > 0 ? (p > pCur + eps) : (p < pCur - eps))
                best = { idx: i2, arrows: a, pitch: p };
              continue;
            }
            var onTheRightSide = (dir > 0) ? (p > pCur + eps) : (p < pCur - eps);
            if (!onTheRightSide)
              continue;
            var closer = (dir > 0) ? (p < best.pitch - eps) : (p > best.pitch + eps);
            var tie = Math.abs(p - best.pitch) <= eps;
            // On an exact tie (which happens when the arrow limit leaves more
            // spellings than the gap has steps) continue on the same side we
            // are travelling: the lower nominal when going up.
            var preferThisTie = tie && ((dir > 0) ? (i2 < best.idx) : (i2 > best.idx));
            if (closer || preferThisTie)
              best = { idx: i2, arrows: a, pitch: p };
          }
        }
        return best;
      }

      // An accidental with the given number of arrows, drawn with the flavour
      // the key signature annotates for that nominal.  MuseScore has no glyph
      // set for more than four arrows.
      function glyphFor(whichKeySig, nominalIdx, arrows) {
        if (arrows === 0)
          return null;
        var flavour = 0;
        var ks = whichKeySig[nominalNames[nominalIdx]];
        if (ks)
          flavour = ks.f;
        return arrowAccidentalType(flavour, arrows);
      }

      // A plain accidental for a number of sharps, or null when the number
      // cannot be written with one glyph.
      function sharpsGlyph(k) {
        if (k !== Math.floor(k))
          return null; // half flats/sharps have no plain glyph
        switch (k) {
        case 3: return Accidental.SHARP3;
        case 2: return Accidental.SHARP2;
        case 1: return Accidental.SHARP;
        case -1: return Accidental.FLAT;
        case -2: return Accidental.FLAT2;
        case -3: return Accidental.FLAT3;
        }
        return null;
      }

      // If the transposed note stops supplying an accidental to the rest of the
      // bar, every following note that was relying on it has to be given that
      // accidental explicitly, or its written pitch -- and therefore its tuning
      // -- would silently change.
      //
      // Notes whose accidental is simply the key signature need nothing: they
      // can only have been sitting on the "natural for this key" state, which
      // is exactly where they stay once the note moves away.
      function pinFollowingNotes(parms, entry, oldLine, newLine) {
        var list = parms.notes[entry.staff];
        var hist = parms.hist[entry.staff];
        for (var i = 0; i < list.length; i++) {
          var q = list[i];
          if (q.seq <= entry.seq || q.bar !== entry.bar)
            continue;
          if (q.line !== oldLine && q.line !== newLine)
            continue;
          if (q.explicit)
            continue;
          var ks = keySigAt(hist, q.tick);
          var ksf = 0;
          if (ks[nominalNames[q.m]])
            ksf = ks[nominalNames[q.m]].f;
          var glyph;
          if (q.sharps !== ksf)
            glyph = sharpsGlyph(q.sharps);
          else if (q.arrows !== 0)
            glyph = glyphFor(ks, q.m, q.arrows);
          else
            continue;
          if (glyph === null)
            continue;
          setAccidental(q.note, glyph);
          q.explicit = true;
          q.rawArrows = q.arrows;
        }
      }

      function transposeEntry(entry, parms, dir) {
        var note = entry.note;
        var hist = parms.hist[entry.staff];
        var tick = entry.tick;
        var t = tuningAt(hist, tick);
        var L = tuningL(t);
        var shift = tuningShift(t, L);
        var idx = entry.m + 7 * entry.oct;

        var target;
        if (t.mode === 'none') {
          // No arrow annotation in force: arrows are pure notation and do not
          // sound.  One step up is simply the next nominal, and the arrows
          // written on the note are carried along untouched.
          var idx2 = idx + dir;
          target = { idx: idx2, arrows: entry.arrows, pitch: nominalPitch(L, shift, idx2) };
        } else {
          var pCur = pitchOf(t, L, shift, idx, entry.arrows);
          target = findNextPitch(t, L, shift, idx, pCur, dir);
          if (target === null) {
            // Every legal spelling is on the wrong side already.
            console.log('7n-do: no legal spelling beyond this pitch; note left alone');
            return;
          }
        }

        var nominalNew = mod7(target.idx);
        var oldLine = note.line;
        var oldArrows = entry.arrows;

        // The order matters: line, then accidental, then tuning.
        note.line = note.line - (target.idx - idx);
        var ks = keySigAt(hist, tick);
        var glyph = glyphFor(ks, nominalNew, target.arrows);
        if (glyph === null && configAt(hist, tick).showallaccidentals === true)
          glyph = Accidental.NATURAL; // courtesy accidental requested
        setAccidental(note, glyph === null ? Accidental.NONE : glyph);

        // Read back what MuseScore actually made of the note, so the tuning is
        // right even when the score's own key signature disagrees with the
        // annotation.
        var m2 = nominalOfTpc(note.tpc);
        var sharps2 = sharpsOfTpc(note.tpc);
        var oct2 = octaveOfNote(note, m2, sharps2);
        var arrows2 = target.arrows;

        var isConcert = note.tpc == note.tpc1;
        var trans = isConcert ? 0 : transpositionAt(hist, tick);
        note.tuning = tuningValueFor(t, L, shift, m2 + 7 * oct2, arrows2,
                                     note.pitch, trans);

        // The bar only needs fixing up when this note moved away from its old
        // line, or when the accidental it supplies changed.
        var oldKsFlavour = 0;
        var ksOld = keySigAt(hist, tick);
        if (ksOld[nominalNames[entry.m]])
          oldKsFlavour = ksOld[nominalNames[entry.m]].f;
        if (oldLine !== note.line || oldArrows !== arrows2 || entry.sharps !== oldKsFlavour)
          pinFollowingNotes(parms, entry, oldLine, note.line);

        // Keep the scan cache in step in case a later bar or note needs it.
        entry.m = m2;
        entry.sharps = sharps2;
        entry.oct = oct2;
        entry.line = note.line;
        entry.arrows = arrows2;
        entry.explicit = true;
        entry.rawArrows = arrows2;
      }

      // If it is stupid but it works, it is not stupid.
      // (Copy of the reference plugin's accidentals-are-sticky trick.)
      function setAccidental(note, accidentalType) {
        var acc = newElement(Element.ACCIDENTAL);
        acc.accidentalType = Accidental.NATURAL;
        note.add(acc);
        note.accidentalType = Accidental.NATURAL;

        acc = newElement(Element.ACCIDENTAL);
        acc.accidentalType = Accidental.NATURAL;
        note.add(acc);
        note.accidentalType = Accidental.NATURAL;

        acc = newElement(Element.ACCIDENTAL);
        acc.accidentalType = accidentalType;
        note.add(acc);
        note.accidentalType = accidentalType;

        acc = newElement(Element.ACCIDENTAL);
        acc.accidentalType = accidentalType;
        note.add(acc);
        note.accidentalType = accidentalType;
      }

      // Finds the scan entry of a note object (ties are followed back to the
      // first note of the tie).
      function findEntryFor(parms, note) {
        var target = note;
        if (note.firstTiedNote)
          target = note.firstTiedNote;
        for (var staff = 0; staff < parms.notes.length; staff++) {
          var list = parms.notes[staff];
          for (var i = 0; i < list.length; i++) {
            if (list[i].note.is(target))
              return list[i];
          }
        }
        return null;
      }

      onRun: {
        if (typeof curScore === 'undefined') {
          Qt.quit();
          return;
        }
        var parms = {};
        scanScore(parms);

        var cursor = curScore.newCursor();
        cursor.rewind(1);

        if (cursor.segment) {
          // Phrase (range) selection: transpose every note inside it.
          var range = selectionRange();
          for (var staff = range.startStaff; staff <= range.endStaff; staff++) {
            var list = parms.notes[staff];
            if (!list)
              continue;
            for (var i = 0; i < list.length; i++) {
              var entry = list[i];
              if (entry.tick < range.startTick || entry.tick >= range.endTick)
                continue;
              transposeEntry(entry, parms, direction);
            }
          }
        } else {
          // Individually selected note elements (Ctrl-click), if any.
          var elements = curScore.selection.elements;
          var selected = [];
          for (var k = 0; k < elements.length; k++) {
            if (elements[k].type == Element.NOTE)
              selected.push(elements[k]);
          }

          if (selected.length === 0) {
            // Nothing to work with: hand the job back to MuseScore so that the
            // arrow keys keep doing everything else they normally do.
            cmd(direction > 0 ? 'pitch-up' : 'pitch-down');
            Qt.quit();
            return;
          }

          var done = [];
          for (var s = 0; s < selected.length; s++) {
            var note = selected[s];
            if (note.firstTiedNote)
              note = note.firstTiedNote;
            var already = false;
            for (var d = 0; d < done.length; d++) {
              if (done[d].is(note)) {
                already = true;
                break;
              }
            }
            if (already)
              continue;
            done.push(note);

            var entry2 = findEntryFor(parms, note);
            if (entry2)
              transposeEntry(entry2, parms, direction);
          }
        }

        clog('7n-do: transposition done');
        finishRun(parms);
      }
