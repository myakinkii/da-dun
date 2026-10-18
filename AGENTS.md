# Working on da-dun as an agent

This file is for AI agents (and people) collaborating on this repository, often
from a chat session with a sandbox: clone, change, test, deliver a patch, and
optionally publish the editor as a claude.ai artifact. Read README.md for what
the project is; this file is about how to work on it.

## The loop

1. Clone the public repo fresh at the start of each session (sandboxes don't
   keep state): `git clone https://github.com/myakinkii/da-dun.git`
2. `npm ci` then `npm test`. Everything should pass before you change anything.
3. Make the change, with tests (see "Tests" below).
4. `npm test` and `npm run build` again.
5. Commit and deliver it as a patch on top of the user's current `main`:
   `git format-patch -1 --stdout > NAME.patch`. Before handing it over, apply it
   to a second fresh clone with `git am`, run `npm ci`, `npm test` and
   `npm run build` there. Agents usually can't push; the user applies the patch
   with `git am < NAME.patch` and pushes.
6. If the user has unpushed commits, ask them to push first, or keep your
   changes away from the lines they touched and say so.

## Layout and rules

- `core/`: notation -> CSV (`notate.js`), CSV -> MIDI (`csvmidi.js`), CSV ->
  timed notes (`song.js`), the hum box logic (`hum.js`), a ZIP writer and the
  CLI. **No dependencies**, plain ES modules that run in browsers and Node.
- `web/`: Vite + Vue editor; `npm run build` makes one self-contained
  `dist/index.html` (no CDN at runtime). Keep it that way: it has to work
  opened from disk and inside a claude.ai artifact, whose content-security
  policy blocks most network access.
- `server/`: dependency-free HTTP API and LLM backends.
- `examples/` are the songs in the editor menu; `songs/` is the user's own
  folder and gitignored. They are music, not fixtures: don't make tests depend
  on their content.
- `perl/notate.pl` is the reference implementation of the notation. **Any change
  to the notation must be made in both `core/src/notate.js` and
  `perl/notate.pl`**, then `npm run fixtures` (needs perl and csvmidi:
  `apt install midicsv`) regenerates `core/test/expected/` from the Perl
  version, and the parity tests check the JavaScript against it, byte for byte.
- Also update `docs/notation.txt` (the guide shown in the editor and sent to
  the model by the hum box) whenever the notation changes.
- If a change makes existing text mean something different (as fixed octaves
  did), write a converter like `core/src/migrate.js`, keep the old-format test
  inputs in `core/test/legacy/` to prove it keeps every note, and bump
  `NOTATION` in `web/src/sketchbook.js` so the editor converts saved sketches
  once.

## Tests

- `core/test/`: parity against the Perl reference and fourmilab `csvmidi`,
  `csvToSong`, the hum loop with a fake model. Test inputs live in
  `core/test/cases/`.
- `web/test/`: the player against a fake Tone.js (`createPlayer({Tone})`).
- `server/test/`: the HTTP API with a fake model, the LLM dialects with a fake
  `fetch`.
- For UI changes, a jsdom run of `dist/index.html` catches most mistakes: strip
  the inline `<script type="module">`, eval it in the jsdom window, and provide
  `TextEncoder`/`TextDecoder` (and a fake `window.claude` to test artifact
  features). There is no audio in jsdom, so the play buttons stay disabled.

## Publishing the artifact

Build, then publish `dist/index.html` with the capabilities
`{"db": {}, "user": {}, "downloads": true, "sample": {}}`. If the user already
has a da-dun artifact, update that one (pass its URL) instead of creating a new
one; their sketches live in its database.

## Working on the user's music

Inside the artifact, sketches are synced to the artifact database, in the
user's private collection `data/users/<id>/` (address it as `data/users/me`):

- `sk-<id>`: `{type: "sketch", text, title, updated, by, notation: 2}`
- `draft-<example>`: an edited example, `{type: "draft", example, text, ...}`
- `hum-<doc>`: hum box history for a sketch, `{type: "hum", sketch, items, notation: 2}`

`notation: 2` means fixed octaves. Always write it: a doc without it is taken
to be in the old "nearest note" format and gets converted when the page loads.

Octaves are fixed per line (`piano (left) o3:`, default 4, bass instruments 2),
so check every note's octave: `'` and `,` move a single note, `o5` switches the
rest of the line. Splitting a part into hands (`piano (right)`, `piano (left) o3`)
and using `@N` for late entries keeps marks rare.

To read the user's piece, list that collection. To change it, update `text`
with `by: "claude"` and pass the version you read as `if_version`, so you never
overwrite edits the user made meanwhile; the open page picks up the change
live. Before writing notation, check it converts cleanly (for example with
`node core/src/cli.js file.txt --csv`), keep everything the user didn't ask to
change exactly as it is, and explain musical choices in plain words: the user
may not read music.
