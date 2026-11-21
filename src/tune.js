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
