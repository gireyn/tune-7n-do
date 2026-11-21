#!/usr/bin/env python3
"""Assemble the three MuseScore plugin files from the sources in src/.

The 7n-DO core (src/core.js) is shared by all three plugins and must stay
byte-identical in each of them, so the .qml files are generated instead of
hand-maintained.  Edit the files in src/, then run

    python3 build.py

Never edit the generated *.qml files directly.
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

HEADER = """\
import QtQuick 2.1
import QtQuick.Controls 1.3
import QtQuick.Controls.Styles 1.3
import QtQuick.Dialogs 1.1
import MuseScore 3.0

// ---------------------------------------------------------------------------
//  GENERATED FILE -- do not edit.
//  Built by build.py from src/core.js plus src/{main}
// ---------------------------------------------------------------------------

MuseScore {{

      MessageDialog {{
        id: errorDialog
        title: '7n-DO plugin:'
        text: ''
        onAccepted: Qt.quit()
      }}

      version: "1.0.0"
      description: {description}
      menuPath: {menu_path}
{direction}
"""

TARGETS = [
    dict(
        file="tune 7n-do.qml",
        main="tune.js",
        description='"Retune the selection (or the whole score) to a 7n-DO scale."',
        menu_path='"Plugins.7n-DO.Tune"',
        direction=None,
    ),
    dict(
        file="pitch up.qml",
        main="pitch.js",
        description='"Raise the selection by one step of the 7n-DO lattice."',
        menu_path='"Plugins.7n-DO.Raise Pitch By 1 Step"',
        direction=1,
    ),
    dict(
        file="pitch down.qml",
        main="pitch.js",
        description='"Lower the selection by one step of the 7n-DO lattice."',
        menu_path='"Plugins.7n-DO.Lower Pitch By 1 Step"',
        direction=-1,
    ),
]


def read(name):
    text = (SRC / name).read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    return text


def build_core():
    """The shared block, exactly as it will appear in every plugin."""
    core = read("core.js")
    marker = "      // ---- fixed numbers"
    if marker not in core:
        sys.exit("core.js lost its start marker")
    return core


def main():
    core = build_core()
    for target in TARGETS:
        if target["direction"] is None:
            direction = ""
        else:
            direction = "      // +1 raises, -1 lowers.  One plugin per direction.\n" \
                        "      property int direction: %d\n" % target["direction"]
        text = HEADER.format(
            main=target["main"],
            description=target["description"],
            menu_path=target["menu_path"],
            direction=direction,
        )
        text += core
        text += "\n"
        text += read(target["main"])
        text += "}\n"
        out = ROOT / target["file"]
        out.write_text(text, encoding="utf-8")
        print("wrote %s (%d lines)" % (out.name, text.count("\n")))


if __name__ == "__main__":
    main()
