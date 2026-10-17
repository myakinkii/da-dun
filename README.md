# da-dun

LLM assisted music creation tool.

Hum it as "da-da-da-DUN", let an LLM turn it into a tiny text notation, then
hear it in the browser and export MIDI.

```
title Our piece
tempo 96
time 4/4

piano: a'4 R | e R | r4 e8t f# g# a4 b8t c# b | a8 g# a2. |
```

The pipeline keeps CSV as a real, inspectable middle step:

```
notation ──[core/src/notate.js]──▶ midicsv CSV ──[core/src/csvmidi.js]──▶ MIDI file
                                              └──[core/src/song.js]──▶ player, piano roll
```

The CSV format is the one from John Walker's
[midicsv](https://www.fourmilab.ch/webtools/midicsv/), so any CSV the sketchbook
produces also works with the original `csvmidi` tool, and vice versa for the
record types we support.

## Quick start

Node 20.19+ (or 22.12+). The repository is an npm workspace with two packages:
`core` (no dependencies) and `web` (Vue, Vite, Tone.js).

```sh
npm install
npm run dev          # editor at http://localhost:5173, with hot reload
npm run build        # one self-contained file: dist/index.html
npm test             # core parity tests + player tests
```

`dist/index.html` has everything inlined (no CDN), so it works opened straight
from disk and is also what gets published as the claude.ai artifact.

In the editor, press **Ctrl+Enter** (or **Cmd+Enter**) to play from the start
and **Space** to play and stop. Warnings show up as you type; click one to jump
to its line. In the piano roll, click a note to play from that note, or click
anywhere to move the playhead. Edits and new sketches are saved in your
browser's local storage.

### Command line

```sh
node core/src/cli.js songs/01-our-piece.txt          # writes songs/01-our-piece.mid
node core/src/cli.js song.txt -o out.mid
node core/src/cli.js song.txt --csv                  # print the CSV instead
node core/src/cli.js some.csv -o some.mid            # CSV straight to MIDI, like csvmidi
```

`npm link -w core` makes it available as `da-dun`.

## Inside a claude.ai artifact

Published as a claude.ai artifact (with the `db`, `user` and `downloads`
capabilities), the page also syncs sketches to the artifact's database, so you
and Claude share one working copy:

- each sketch, and each edited example, is a document in your private
  collection `data/users/<you>/`: `sk-<id>` for sketches, `draft-<example>` for
  examples, with fields `type` (`"sketch"` or `"draft"`), `example` (drafts
  only), `text`, `title`, `updated` and `by` (`"page"` or `"claude"`)
- Claude can read your sketches from the chat and write new versions; the open
  page picks them up live, and asks before replacing text you're editing
- the Save buttons go through the platform's download prompt; MIDI arrives as a
  `.zip` because artifacts can't download `.mid` files directly

Opened from a file, the page simply uses your browser's local storage.

## The hum box

Inside the artifact, the page shows a "Hum it to Claude" box: describe what
you hear ("ta-ta-ta-TAAM, rising and heroic, as two new bars after bar 4"),
and Claude writes it into the sketch. You can play the proposal, use it (with
Undo), or discard it. It uses the artifact `sample` capability, so it runs on
the viewer's own Claude account and asks for permission the first time.

All the logic is in `core/src/hum.js` and doesn't depend on the page or on a
particular model: give it an `ask(prompt)` function that returns the model's
reply parsed as JSON. It builds the prompt (rules for reading da-duns, the
notation guide, the current sketch and the request), checks the answer with
`notate()`, and sends any problems back for one repair round. For example,
with the Anthropic API:

```js
import { readFileSync } from "node:fs";
import { hum } from "@da-dun/core";   // or "./core/src/hum.js"

const ask = async prompt => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01",
               "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 4000,
                           messages: [{ role: "user", content: prompt }] }),
  });
  const text = (await res.json()).content.map(c => c.text || "").join("");
  return JSON.parse(text.replace(/^```(json)?|```$/gm, ""));
};

const { notation, explanation, problems } = await hum({
  notation: readFileSync("songs/01-our-piece.txt", "utf8"),
  request: "ta-ta-ta-TAAM, rising, two more bars",
  guide: readFileSync("docs/notation.txt", "utf8"),
  ask,
});
```

## The notation

See [docs/notation.txt](docs/notation.txt) (also shown in the page's
"Notation guide" tab). In short: note names `c d e f g a b` with `#`/`b`,
durations `1 2 4 8 16 32` that carry over to the next notes, `8t` triplets,
`.` dots, `r` rest, `R` rest to the end of the bar, `~` ties, `>` accents,
`[c e g]` chords, `'` and `,` to move an octave, and step grids for drums:

```
kick:  |x.......x.x.....|
snare: |....x.......x...|
hat:   |x.x.x.x.x.x.x.x.|
```

The octave rule (each note lands closest to the previous one) and several symbols
are borrowed from [LilyPond](https://lilypond.org/).

## Layout

```
core/src/notate.js     notation -> CSV
core/src/csvmidi.js    CSV -> MIDI bytes (subset of fourmilab csvmidi)
core/src/song.js       CSV -> timed notes, for players and piano rolls
core/src/hum.js        the hum box: prompt, answer checking, repair round (any LLM)
core/src/zip.js        tiny ZIP writer (for hosts that won't download .mid)
core/src/gm.js         General MIDI instrument and drum names, short aliases
core/src/cli.js        command line
core/test/             parity tests and fixtures
web/src/App.vue        the editor page
web/src/sketchbook.js  app state: storage and sync, compiling, hum box, saving
web/src/player.js      our player: Tone.js synths and a synthesized drum kit
web/src/components/    PianoRoll.vue (clickable), HumBox.vue
docs/notation.txt      notation guide (shown in the page)
songs/                 example songs, shown in the page's menu (number prefix = order)
perl/                  the original Perl implementation, kept as the reference
```

## Parity tests

The JavaScript is held to the reference tools exactly:

- notation to CSV must be identical to `perl/notate.pl`
- CSV to MIDI must be byte-identical to fourmilab's `csvmidi`

The expected outputs live in `core/test/expected/`. After changing the notation,
update `perl/notate.pl` to match and run `npm run fixtures` (needs `perl` and
`csvmidi`; on Debian/Ubuntu: `apt install midicsv`) to regenerate them.

## Credits

- [midicsv / csvmidi](https://www.fourmilab.ch/webtools/midicsv/) by John Walker, public domain:
  the CSV format and the reference encoder
- [Tone.js](https://tonejs.github.io/) (MIT): audio scheduling and synths
- [Vue](https://vuejs.org/) and [Vite](https://vite.dev/) (MIT), with
  [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) (MIT)
- [html-midi-player](https://github.com/cifkao/html-midi-player) by Ondřej Cífka: the player in
  the first versions
- [LilyPond](https://lilypond.org/): inspiration for the note syntax

## License

MIT, see [LICENSE](LICENSE). The bundled fixtures were produced with midicsv, which is public domain.
