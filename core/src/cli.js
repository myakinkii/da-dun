#!/usr/bin/env node
// Command line: da-dun song.txt [-o song.mid] [--csv]
//               da-dun migrate song.txt [--write]
//   song.txt   our notation (a .csv file is converted straight to MIDI)
//   -o FILE    write MIDI to FILE (default: song name with .mid)
//   --csv      print the CSV instead of writing MIDI
//   -x         no running status (like csvmidi -x)
//   migrate    convert a song written for the old "nearest note" octave rule to
//              fixed octaves (same pitches); prints it, or rewrites the file with
//              --write. Run it once per file: it assumes the old rule.

import { readFileSync, writeFileSync } from "node:fs";
import { notate, NotationError } from "./notate.js";
import { toFixedOctaves } from "./migrate.js";
import { csvToMidi } from "./csvmidi.js";

const args = process.argv.slice(2);
if (args[0] === "migrate") {
  const write = args.includes("--write"), files = args.slice(1).filter(a => a !== "--write");
  if (!files.length) { console.error("usage: da-dun migrate song.txt [more.txt ...] [--write]"); process.exit(2); }
  for (const f of files) {
    const out = toFixedOctaves(readFileSync(f, "utf8"));
    if (write) { writeFileSync(f, out); console.error(`converted ${f}`); }
    else process.stdout.write(out);
  }
  process.exit(0);
}
const flag = f => { const i = args.indexOf(f); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const csvOnly = flag("--csv"), noRunning = flag("-x");
let out = null;
const oi = args.indexOf("-o");
if (oi >= 0) { out = args[oi + 1]; args.splice(oi, 2); }
const input = args[0];
if (!input || flag("-h") || flag("--help")) {
  console.error("usage: da-dun song.txt [-o song.mid] [--csv] [-x]\n       da-dun migrate song.txt [--write]");
  process.exit(2);
}

const report = (file, ws) => ws.forEach(w => console.error(`${file}:${w.line ?? "-"}: ${w.message}`));
let csv;
try {
  const text = readFileSync(input, "utf8");
  if (/\.csv$/i.test(input)) csv = text;
  else { const r = notate(text); csv = r.csv; report(input, r.warnings); }
} catch (e) {
  console.error(e instanceof NotationError ? `${input}:${e.line ?? "-"}: ${e.detail}` : e.message);
  process.exit(1);
}
if (csvOnly) { process.stdout.write(csv); process.exit(0); }
const { bytes, warnings } = csvToMidi(csv, { runningStatus: !noRunning });
report(input + " (csv)", warnings);
const target = out || input.replace(/\.(txt|csv)$/i, "") + ".mid";
if (target === "-") process.stdout.write(bytes); else { writeFileSync(target, bytes); console.error(`wrote ${target}`); }
