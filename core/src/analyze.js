// analyze.js: name the chords of a Song and, when it has a key, number them
// with Roman numerals (A major: F#m is vi, E is V, F is bVI).
// A chord is three or more notes of one part that start together, as in
// [c# e a]1. Broken chords and melodies are left alone on purpose.

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// iv: semitones above the root. sym: name suffix. lower: minor-ish, so a lowercase numeral.
// rom: numeral suffix for root position, first, second, third inversion.
// When two chords have the same notes (C6, Am7) the bass decides, then this order.
const CHORDS = [
  { sym: "", iv: [0, 4, 7], rom: ["", "6", "64"] },
  { sym: "m", iv: [0, 3, 7], lower: true, rom: ["", "6", "64"] },
  { sym: "7", iv: [0, 4, 7, 10], rom: ["7", "65", "43", "42"] },
  { sym: "m7", iv: [0, 3, 7, 10], lower: true, rom: ["7", "65", "43", "42"] },
  { sym: "maj7", iv: [0, 4, 7, 11], rom: ["maj7"] },
  { sym: "dim", iv: [0, 3, 6], lower: true, dim: true, rom: ["°", "°6", "°64"] },
  { sym: "m7b5", iv: [0, 3, 6, 10], lower: true, dim: true, rom: ["ø7", "ø65", "ø43", "ø42"] },
  { sym: "dim7", iv: [0, 3, 6, 9], lower: true, dim: true, rom: ["°7", "°65", "°43", "°42"] },
  { sym: "aug", iv: [0, 4, 8], rom: ["+"] },
  { sym: "sus4", iv: [0, 5, 7], rom: ["sus4"] },
  { sym: "sus2", iv: [0, 2, 7], rom: ["sus2"] },
  { sym: "6", iv: [0, 4, 7, 9], rom: ["6"] },
  { sym: "m6", iv: [0, 3, 7, 9], lower: true, rom: ["6"] },
  { sym: "add9", iv: [0, 2, 4, 7], rom: ["add9"] },
  { sym: "5", iv: [0, 7], rom: ["5"] },
];

// Numeral for each semitone above the tonic, written against the major or the natural minor scale.
const MAJOR_DEGREES = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
const MINOR_DEGREES = ["I", "bII", "II", "III", "#III", "IV", "#IV", "V", "VI", "#VI", "VII", "#VII"];

/** The key's tonic as a pitch class, from a MIDI key signature ({sf: sharps(+)/flats(-), minor}). */
const tonicOf = key => (((key.sf * 7) % 12) + 12 + (key.minor ? 9 : 0)) % 12;
const names = key => (key && key.sf < 0 ? FLAT : SHARP);

/** "A major", "F# minor" */
export function keyName(key) {
  return key ? `${names(key)[tonicOf(key)]} ${key.minor ? "minor" : "major"}` : "";
}

function nameChord(pcs, bass) {
  let best = null;
  for (let i = 0; i < CHORDS.length; i++) {
    const c = CHORDS[i];
    if (c.iv.length !== pcs.size) continue;
    for (const root of pcs) {
      if (!c.iv.every(k => pcs.has((root + k) % 12))) continue;
      const score = (root === bass ? 0 : 100) + i;
      if (!best || score < best.score) best = { c, root, score };
    }
  }
  return best;
}

function roman(c, root, bass, key) {
  const d = (root - tonicOf(key) + 12) % 12;
  let numeral = (key.minor ? MINOR_DEGREES : MAJOR_DEGREES)[d];
  if (key.minor && d === 11 && c.dim) numeral = "VII";   // the leading-tone chord is just vii°
  if (c.lower) numeral = numeral.replace(/[IV]+/, m => m.toLowerCase());
  const inv = c.iv.indexOf((bass - root + 12) % 12);
  return numeral + (c.rom[inv] ?? c.rom[0]);
}

/**
 * @param {import("./song.js").Song} song
 * @param {{sf: number, minor: boolean} | null} [key] defaults to the song's own key
 * @returns {{startTick: number, endTick: number, start: number, end: number, bar: number, beat: number,
 *            name: string, roman: string | null, notes: number[]}[]} in time order
 */
export function analyzeChords(song, key = song.key) {
  const spell = names(key);
  const groups = new Map();                               // "track:tick" -> notes starting together
  for (const n of song.notes) {
    if (n.ch === 9) continue;
    const id = n.track + ":" + n.startTick;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(n);
  }
  const byTick = new Map();                               // one chord per moment, the fullest wins
  for (const g of groups.values()) {
    if (g.length < 3) continue;
    const pcs = new Set(g.map(n => n.note % 12));
    if (pcs.size < 2) continue;
    const lowest = Math.min(...g.map(n => n.note));
    const hit = nameChord(pcs, lowest % 12);
    if (!hit) continue;
    const tick = g[0].startTick, old = byTick.get(tick);
    if (old && (old.pcs > pcs.size || (old.pcs === pcs.size && old.count >= g.length))) continue;
    const { c, root } = hit, bass = lowest % 12;
    byTick.set(tick, {
      pcs: pcs.size, count: g.length,
      chord: {
        startTick: tick, endTick: Math.max(...g.map(n => n.endTick)),
        start: g[0].start, end: Math.max(...g.map(n => n.end)), bar: g[0].bar, beat: g[0].beat,
        name: spell[root] + c.sym + (bass === root ? "" : "/" + spell[bass]),
        roman: key ? roman(c, root, bass, key) : null,
        notes: g.map(n => n.note).sort((a, b) => a - b),
      },
    });
  }
  return [...byTick.values()].map(v => v.chord).sort((a, b) => a.startTick - b.startTick);
}
