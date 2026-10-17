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
notation ──[src/notate.js]──▶ midicsv CSV ──[src/csvmidi.js]──▶ MIDI file ──▶ player
```

The CSV format is the one from John Walker's
[midicsv](https://www.fourmilab.ch/webtools/midicsv/), so any CSV the sketchbook
produces also works with the original `csvmidi` tool, and vice versa for the
record types we support.

## Quick start

No dependencies; Node 18 or newer.

```sh
npm run build        # writes dist/sketchbook.html
npm run watch        # same, rebuilding on every change
npm test             # parity tests (see below)
```

Open `dist/sketchbook.html` in a browser: type in the editor, press
**Ctrl+Enter** (or **Cmd+Enter**) to play from the start. Warnings show up as you
type; click one to jump to its line. Edits and new sketches are saved in your
browser's local storage. The page needs internet access once to load the player
scripts from jsDelivr; everything else is inlined.

### Command line

```sh
node src/cli.js songs/01-our-piece.txt              # writes songs/01-our-piece.mid
node src/cli.js song.txt -o out.mid
node src/cli.js song.txt --csv                     # print the CSV instead
node src/cli.js some.csv -o some.mid               # CSV straight to MIDI, like csvmidi
```

`npm link` makes it available as `da-dun`.

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
src/gm.js          General MIDI instrument and drum names, short aliases
src/notate.js      notation -> CSV
src/csvmidi.js     CSV -> MIDI bytes (subset of fourmilab csvmidi)
src/cli.js         command line
web/index.html     editor page template (build.js inlines src/ into it)
docs/notation.txt  notation guide
songs/             example songs, shown in the page's menu (number prefix = order)
perl/              the original Perl implementation, kept as the reference
test/              parity tests and fixtures
```

## Parity tests

The JavaScript is held to the reference tools exactly:

- notation to CSV must be identical to `perl/notate.pl`
- CSV to MIDI must be byte-identical to fourmilab's `csvmidi`

The expected outputs live in `test/expected/`. After changing the notation,
update `perl/notate.pl` to match and run `npm run fixtures` (needs `perl` and
`csvmidi`; on Debian/Ubuntu: `apt install midicsv`) to regenerate them.

## Credits

- [midicsv / csvmidi](https://www.fourmilab.ch/webtools/midicsv/) by John Walker, public domain:
  the CSV format and the reference encoder
- [html-midi-player](https://github.com/cifkao/html-midi-player) by Ondřej Cífka (BSD-2-Clause)
  and [Magenta.js](https://github.com/magenta/magenta-js): playback and piano roll
- [LilyPond](https://lilypond.org/): inspiration for the note syntax

## License

MIT, see [LICENSE](LICENSE). The bundled fixtures were produced with midicsv, which is public domain.
