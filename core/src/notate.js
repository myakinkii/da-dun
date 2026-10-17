// notate.js: turn a quick text music sketch into midicsv-style CSV.
// A faithful port of perl/notate.pl; test/parity.test.js checks they agree.
// See docs/notation.txt for the notation itself.

import { GM_PATCHES, GM_DRUMS, GM_DRUM_FIRST, INST_ALIAS, DRUM_ALIAS } from "./gm.js";

export const PPQ = 480;

const STEP = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
const SEMI = [0, 2, 4, 5, 7, 9, 11];
const PATCH_LC = new Map(GM_PATCHES.map((n, i) => [n.toLowerCase(), i]));
const DRUM_LC = new Map(GM_DRUMS.map((n, i) => [n.toLowerCase(), GM_DRUM_FIRST + i]));
const mod = (a, n) => ((a % n) + n) % n;

/** Thrown for problems that stop conversion entirely. */
export class NotationError extends Error {
  constructor(line, message) {
    super(line ? `line ${line}: ${message}` : message);
    this.name = "NotationError";
    this.line = line;
    this.detail = message;
  }
}

function resolveInstrument(name, line) {
  const n = name.toLowerCase().replace(/\s+/g, " ");
  if (n in DRUM_ALIAS) return { kind: "drum", num: DRUM_ALIAS[n] };
  if (DRUM_LC.has(n)) return { kind: "drum", num: DRUM_LC.get(n) };
  if (n in INST_ALIAS) return { kind: "inst", num: INST_ALIAS[n] };
  if (PATCH_LC.has(n)) return { kind: "inst", num: PATCH_LC.get(n) };
  const m = [...PATCH_LC.keys()].filter(k => k.includes(n));
  if (m.length === 1) return { kind: "inst", num: PATCH_LC.get(m[0]) };
  throw new NotationError(line, `unknown instrument or drum "${name}"` +
    (m.length ? ` (could be: ${m.sort().join(", ")})` : ""));
}

const fmtNum = x => String(Number(x.toFixed(3)));

function addDots(dur, dots) {
  let add = dur;
  for (let i = 0; i < dots.length; i++) { add /= 2; dur += add; }
  return dur;
}

function parseMelody(p, song, warn) {
  const ev = [];                       // [tick, on(1)/off(0), note, velocity]
  let t = 0, dur = PPQ;                // durations stick; a part starts with quarters
  let ref = (p.num >= 32 && p.num <= 39 ? 2 : 4) * 7;   // diatonic reference: c2 for basses, else c4
  let tied = [];                       // notes held by a tie from the previous token
  let barStart = 0, barNo = 1;
  const { barTicks } = song;

  for (const [line, rawBody] of p.chunks) {
    const body = rawBody.replace(/\|/g, " | ");
    for (const tok of body.match(/\[[^\]]*\]\S*|\S+/g) || []) {
      if (tok === "|") {
        const len = t - barStart;
        if (len !== barTicks && !(barNo === 1 && len < barTicks && len > 0)) {
          warn(line, `${p.name}, bar ${barNo} has ${fmtNum(len / PPQ * song.tsd / 4)} beats, expected ${song.tsn}`);
        }
        barStart = t; barNo++;
        continue;
      }
      let m = tok.match(/^o(\d)$/);
      if (m) { ref = Number(m[1]) * 7; continue; }
      if (tok === "R") {               // rest until the end of the bar
        const left = barTicks - (t - barStart);
        if (left <= 0) { warn(line, `${p.name}: R in bar ${barNo}, but that bar is already full`); continue; }
        for (const h of tied) ev.push([t, 0, h, 0]);
        tied = [];
        t += left;
        continue;
      }
      m = tok.match(/^(>?)(\[[^\]]*\]|[a-gA-G](?:#|b)?[',]*|r)(\d+)?(t?)(\.*)(~?)$/);
      if (!m) { warn(line, `${p.name}: can't read "${tok}"`); continue; }
      const [, acc, what, num, trip, dots, tie] = m;

      if (num !== undefined) {
        if (!/^(1|2|4|8|16|32|64)$/.test(num)) { warn(line, `${p.name}: duration ${num} isn't 1,2,4,8,16,32`); continue; }
        dur = 4 * PPQ / Number(num);
        if (trip) dur = dur * 2 / 3;   // triplet: three in the time of two
        dur = addDots(dur, dots);
      } else if (trip) {
        warn(line, `${p.name}: "t" needs a number in front, like 8t`); continue;
      } else if (dots.length) {
        dur = addDots(PPQ, dots);
      }

      const vel = acc ? 115 : 82;
      const pitches = [];
      if (what !== "r") {
        const names = what.startsWith("[") ? (what.slice(1, -1).match(/\S+/g) || []) : [what];
        let r = ref, first;
        for (const n of names) {
          const nm = n.match(/^([a-gA-G])(#|b)?([',]*)$/);
          if (!nm) { warn(line, `${p.name}: bad note "${n}" in chord`); continue; }
          let pos = r - mod(r, 7) + STEP[nm[1].toLowerCase()];   // same octave as the reference
          if (pos - r > 3) pos -= 7;
          if (r - pos > 3) pos += 7;
          pos += 7 * (nm[3].split("'").length - 1) - 7 * (nm[3].split(",").length - 1);
          const midi = (Math.floor(pos / 7) + 1) * 12 + SEMI[mod(pos, 7)]
                     + (nm[2] === "#" ? 1 : nm[2] === "b" ? -1 : 0);
          pitches.push(midi);
          r = pos;
          if (first === undefined) first = pos;
        }
        if (first !== undefined) ref = first;
      }

      const cont = new Set();
      if (tied.length) {
        const want = new Set(pitches);
        for (const h of tied) { if (want.has(h)) cont.add(h); else ev.push([t, 0, h, 0]); }
        tied = [];
      }
      const gap = tie ? 0 : (dur >= 120 ? 30 : Math.trunc(dur / 4));
      for (const p2 of pitches) {
        if (p2 < 0 || p2 > 127) { warn(line, `${p.name}: note out of MIDI range`); continue; }
        if (!cont.has(p2)) ev.push([t, 1, p2, vel]);
        if (tie) tied.push(p2); else ev.push([t + dur - gap, 0, p2, 0]);
      }
      t += dur;
    }
  }
  for (const h of tied) ev.push([t, 0, h, 0]);
  return { ev, len: t };
}

function parseDrum(p, song, warn) {
  const ev = [];
  const step = PPQ / 4, barSteps = song.barTicks / step;
  let t = 0;
  for (const [line, rawBody] of p.chunks) {
    const body = rawBody.replace(/\s+/g, "");
    for (const bar of body.split("|")) {
      if (bar === "") continue;
      if (bar.length !== barSteps) warn(line, `${p.name}: bar "${bar}" has ${bar.length} steps, expected ${barSteps}`);
      for (const ch of bar) {
        if (ch === "x" || ch === "X") {
          ev.push([t, 1, p.num, ch === "X" ? 120 : 90], [t + step / 2, 0, p.num, 0]);
        } else if (ch !== "." && ch !== "-") {
          warn(line, `${p.name}: "${ch}" isn't x, X, . or -`);
        }
        t += step;
      }
    }
  }
  return { ev, len: t };
}

/**
 * Convert notation text to midicsv CSV.
 * @param {string} text
 * @returns {{csv: string, warnings: {line: number|null, message: string}[],
 *            title: string, tempo: number, ticks: number, barTicks: number, notes: number}}
 * @throws {NotationError} when the input can't be converted at all
 */
export function notate(text) {
  const warnings = [];
  const warn = (line, message) => warnings.push({ line, message });
  let title = "Untitled", tempo = "120", tsn = "4", tsd = "4";
  const parts = [], byKey = new Map();

  text.split(/\r?\n/).forEach((raw, i) => {
    const ln = i + 1;
    const l = raw.replace(/(^|\s)#.*$/, "").trim();
    if (l === "") return;
    let m;
    if ((m = l.match(/^title\s+(.+)$/i))) title = m[1];
    else if ((m = l.match(/^tempo\s+(\d+(?:\.\d+)?)$/i))) tempo = m[1];
    else if ((m = l.match(/^time\s+(\d+)\s*\/\s*(\d+)$/i))) { tsn = m[1]; tsd = m[2]; }
    else if ((m = l.match(/^([A-Za-z][\w\s\-+]*?)\s*(\(([^)]*)\))?\s*:\s*(.*)$/))) {
      const [, name, , label, body] = m;
      const key = name.toLowerCase() + (label !== undefined ? ` (${label})` : "");
      let p = byKey.get(key);
      if (!p) {
        const { kind, num } = resolveInstrument(name, ln);
        p = { name: name + (label !== undefined ? ` (${label})` : ""), kind, num, chunks: [] };
        byKey.set(key, p); parts.push(p);
      }
      p.chunks.push([ln, body]);
    }
    else throw new NotationError(ln, `can't understand "${l}"`);
  });
  if (!parts.length) throw new NotationError(null, "No parts found. Write a line like:  piano: c d e f g2");

  const song = { tsn, tsd: Number(tsd), barTicks: Math.trunc(Number(tsn) * 4 * PPQ / Number(tsd)) };
  const tracks = [], drumEv = [];
  let chan = 0, drumEnd = 0, end = 0;
  for (const p of parts) {
    if (p.kind === "drum") {
      const { ev, len } = parseDrum(p, song, warn);
      drumEv.push(...ev);
      if (len > drumEnd) drumEnd = len;
      continue;
    }
    if (chan === 9) chan++;
    if (chan > 15) throw new NotationError(null, "Too many melody parts (max 15)");
    const { ev, len } = parseMelody(p, song, warn);
    tracks.push({ name: p.name, chan, prog: p.num, ev, len });
    chan++;
  }
  if (drumEv.length) tracks.push({ name: "Drums", chan: 9, prog: null, ev: drumEv, len: drumEnd });
  for (const tr of tracks) if (tr.len > end) end = tr.len;

  const q = s => s.replace(/"/g, '""');
  const out = [
    `0, 0, Header, 1, ${tracks.length + 1}, ${PPQ}`,
    "1, 0, Start_track",
    `1, 0, Title_t, "${q(title)}"`,
    `1, 0, Time_signature, ${tsn}, ${Math.trunc(Math.log(Number(tsd)) / Math.log(2) + 0.5)}, 24, 8`,
    `1, 0, Tempo, ${Math.trunc(60000000 / Number(tempo) + 0.5)}`,
    `1, ${end}, End_track`,
  ];
  let tn = 2, notes = 0;
  for (const tr of tracks) {
    out.push(`${tn}, 0, Start_track`, `${tn}, 0, Title_t, "${q(tr.name)}"`);
    if (tr.prog !== null) out.push(`${tn}, 0, Program_c, ${tr.chan}, ${tr.prog}`);
    let last = 0;
    for (const [t, on, n, v] of tr.ev.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      out.push(`${tn}, ${t}, ${on ? "Note_on_c" : "Note_off_c"}, ${tr.chan}, ${n}, ${v}`);
      if (on) notes++;
      if (t > last) last = t;
    }
    out.push(`${tn}, ${last}, End_track`);
    tn++;
  }
  out.push("0, 0, End_of_file");
  return { csv: out.join("\n") + "\n", warnings, title, tempo: Number(tempo),
           ticks: end, barTicks: song.barTicks, notes };
}
