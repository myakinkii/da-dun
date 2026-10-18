// migrate.js: convert notation written for the old "nearest note" octave rule
// (da-dun before fixed octaves) into fixed octaves, keeping every pitch.
//
// Old rule: each note landed in the octave closest to the previous note
// (within 3 letter steps); a chord's first note set the reference for the next
// note; "o4" reset the reference; ' and , moved one note.
// New rule: notes are in the line's octave (4, or 2 for bass instruments,
// unless the part line says "o3:"), "o5" switches it, ' and , move one note.
//
// For every line, the new octave is the one most of its notes live in; notes
// elsewhere get ' or , marks. Everything else in the text is left alone.

import { INST_ALIAS, DRUM_ALIAS, GM_PATCHES, GM_DRUMS } from "./gm.js";

const STEP = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
const mod = (a, n) => ((a % n) + n) % n;
const PART = /^([A-Za-z][\w\s\-+]*?)\s*(\(([^)]*)\))?\s*:\s*(.*)$/;
const TOKEN = />?\[[^\]]*\][^\s|]*|[^\s|]+|\|/g;
const NOTE_TOKEN = /^(>?)(\[[^\]]*\]|[a-gA-G](?:#|b)?[',]*|r)(\d+)?(t?)(\.*)(~?)$/;
const NOTE = /([a-gA-G])(#|b)?([',]*)/g;
const lc = s => s.toLowerCase().replace(/\s+/g, " ");
const DRUMS = new Set([...Object.keys(DRUM_ALIAS), ...GM_DRUMS.map(lc)]);
function isBass(name) {
  const n = lc(name);
  const prog = n in INST_ALIAS ? INST_ALIAS[n] : GM_PATCHES.findIndex(p => lc(p) === n);
  if (prog >= 0) return prog >= 32 && prog <= 39;
  const m = GM_PATCHES.map((p, i) => [lc(p), i]).filter(([p]) => p.includes(n));
  return m.length === 1 && m[0][1] >= 32 && m[0][1] <= 39;
}

/**
 * Convert old-style notation to fixed octaves. Lines that can't be read are
 * left as they are (the converter never fails; notate() reports problems).
 * @param {string} text
 * @returns {string}
 */
export function toFixedOctaves(text) {
  const refs = new Map();                                // part key -> diatonic reference
  return text.split("\n").map(raw => {
    const code = raw.replace(/(^|\s)#.*$/, "");
    const lead = code.length - code.trimStart().length;
    const l = code.trim();
    if (!l || /^(title|tempo|time)\s/i.test(l)) return raw;
    const m = l.match(PART);
    if (!m) return raw;
    const [, name, , label, body] = m;
    if (DRUMS.has(lc(name))) return raw;
    const key = lc(name) + (label !== undefined ? ` (${label})` : "");
    const bass = isBass(name);
    if (!refs.has(key)) refs.set(key, (bass ? 2 : 4) * 7);
    let ref = refs.get(key);

    // 1. replay the old rule: the octave of every note, by token
    const bodyAt = lead + l.length - body.length;
    const edits = [];                                    // {at, len, notes: [{at, len, letter, acc, oct}]} or {drop}
    for (const t of body.matchAll(TOKEN)) {
      const tok = t[0], at = bodyAt + t.index;
      const o = tok.match(/^o(\d)$/);
      if (o) { ref = Number(o[1]) * 7; edits.push({ at, len: tok.length, drop: true }); continue; }
      const nt = tok.match(NOTE_TOKEN);
      if (!nt || nt[2] === "r") continue;
      const notes = [];
      let r = ref, first;
      const inner = nt[2], innerAt = at + nt[1].length;
      for (const n of inner.matchAll(NOTE)) {
        let pos = r - mod(r, 7) + STEP[n[1].toLowerCase()];
        if (pos - r > 3) pos -= 7;
        if (r - pos > 3) pos += 7;
        pos += 7 * (n[3].split("'").length - 1) - 7 * (n[3].split(",").length - 1);
        notes.push({ at: innerAt + n.index, len: n[0].length, letter: n[1], acc: n[2] || "", oct: Math.floor(pos / 7) });
        r = pos;
        if (first === undefined) first = pos;
      }
      if (first !== undefined) ref = first;
      if (notes.length) edits.push({ notes });
    }
    refs.set(key, ref);

    // 2. the line's octave: where most notes are (ties go to the default)
    const def = bass ? 2 : 4, count = {};
    for (const e of edits) for (const n of e.notes || []) count[n.oct] = (count[n.oct] || 0) + 1;
    let lineOct = def;
    for (const [o, c] of Object.entries(count)) {
      const best = count[lineOct] || 0;
      if (c > best || (c === best && Math.abs(o - def) < Math.abs(lineOct - def))) lineOct = Number(o);
    }

    // 3. rewrite marks, drop o-tokens, add "oN" to the part name if needed
    const changes = [];
    for (const e of edits) {
      if (e.drop) { changes.push({ at: e.at, len: e.len, text: "", drop: true }); continue; }
      for (const n of e.notes) {
        const d = n.oct - lineOct;
        changes.push({ at: n.at, len: n.len, text: n.letter + n.acc + (d > 0 ? "'".repeat(d) : ",".repeat(-d)) });
      }
    }
    let out = raw;
    for (const c of changes.sort((a, b) => b.at - a.at)) {
      let start = c.at, end = c.at + c.len;
      if (c.drop) { while (end < out.length && out[end] === " ") end++; }   // the token and the space after it
      out = out.slice(0, start) + c.text + out.slice(end);
    }
    if (lineOct !== def) {
      const colon = out.indexOf(":");
      out = out.slice(0, colon).replace(/\s+$/, "") + ` o${lineOct}` + out.slice(colon);
    }
    return out;
  }).join("\n");
}
