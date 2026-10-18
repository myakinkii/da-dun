// song.js: midicsv CSV -> a timed note list, for players and piano rolls.
// Times are in seconds (tempo changes applied); ticks, bar and beat are kept
// so a UI can say where a note is in musical terms.

import { splitRecord } from "./csvmidi.js";

/**
 * @typedef {{start: number, end: number, startTick: number, endTick: number,
 *            bar: number, beat: number, track: number, ch: number,
 *            note: number, vel: number, prog: number}} SongNote
 * @typedef {{title: string, key: {sf: number, minor: boolean} | null, ppq: number,
 *            timeSig: [number, number], bpm: number,
 *            barTicks: number, duration: number, notes: SongNote[],
 *            tickToSec: (tick: number) => number}} Song
 */

/** Parse midicsv CSV into a Song. Records it doesn't need are skipped. */
export function csvToSong(csv) {
  let ppq = 480, title = "", timeSig = null, key = null;
  const tempos = [], recs = [];
  let order = 0;
  for (const raw of csv.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s[0] === "#" || s[0] === ";") continue;
    const f = splitRecord(s);
    if (f.length < 3 || typeof f[2] !== "string") continue;
    const track = Number(f[0]), time = Number(f[1]), type = f[2].toLowerCase();
    const n = k => Number(f[k]);
    if (type === "header") ppq = n(5) || 480;
    else if (type === "tempo") tempos.push([time, n(3)]);
    else if (type === "time_signature" && !timeSig) timeSig = [n(3), 2 ** n(4)];
    else if (type === "key_signature" && !key) {
      const mode = f[4] && typeof f[4] === "object" ? new TextDecoder().decode(new Uint8Array(f[4].bytes)) : String(f[4] || "");
      key = { sf: n(3), minor: /minor/i.test(mode) };
    }
    else if (type === "title_t" && !title && typeof f[3] === "object") title = new TextDecoder().decode(new Uint8Array(f[3].bytes));
    else if (type === "program_c") recs.push({ time, kind: 0, order: order++, track, ch: n(3), prog: n(4) });
    else if (type === "note_off_c" || (type === "note_on_c" && n(5) === 0)) recs.push({ time, kind: 1, order: order++, track, ch: n(3), note: n(4) });
    else if (type === "note_on_c") recs.push({ time, kind: 2, order: order++, track, ch: n(3), note: n(4), vel: n(5) });
  }
  timeSig = timeSig || [4, 4];
  tempos.sort((a, b) => a[0] - b[0]);
  if (!tempos.length || tempos[0][0] > 0) tempos.unshift([0, 500000]);

  // tempo map: [tick, seconds at that tick, microseconds per quarter]
  const map = [];
  for (const [tick, us] of tempos) {
    const prev = map[map.length - 1];
    const sec = prev ? prev[1] + (tick - prev[0]) * prev[2] / 1e6 / ppq : 0;
    map.push([tick, sec, us]);
  }
  const tickToSec = tick => {
    let i = map.length - 1;
    while (i > 0 && map[i][0] > tick) i--;
    return map[i][1] + (tick - map[i][0]) * map[i][2] / 1e6 / ppq;
  };

  const barTicks = Math.round(timeSig[0] * 4 * ppq / timeSig[1]);
  const beatTicks = barTicks / timeSig[0];
  recs.sort((a, b) => a.time - b.time || a.kind - b.kind || a.order - b.order);
  const prog = new Map(), open = new Map(), notes = [];
  for (const r of recs) {
    const chKey = r.track + ":" + r.ch;
    if (r.kind === 0) { prog.set(chKey, r.prog); continue; }
    const key = chKey + ":" + r.note;
    if (r.kind === 2) {
      const note = { startTick: r.time, endTick: null, track: r.track, ch: r.ch, note: r.note, vel: r.vel,
                     prog: r.ch === 9 ? 0 : (prog.get(chKey) ?? 0),
                     bar: Math.floor(r.time / barTicks) + 1, beat: Math.floor((r.time % barTicks) / beatTicks) + 1 };
      if (!open.has(key)) open.set(key, []);
      open.get(key).push(note);
      notes.push(note);
    } else {
      const q = open.get(key);
      if (q && q.length) q.shift().endTick = r.time;
    }
  }
  let duration = 0;
  for (const n of notes) {
    if (n.endTick === null) n.endTick = n.startTick + ppq / 2;
    n.start = tickToSec(n.startTick);
    n.end = Math.max(tickToSec(n.endTick), n.start + 0.02);
    duration = Math.max(duration, n.end);
  }
  notes.sort((a, b) => a.start - b.start || a.note - b.note);
  return { title, key, ppq, timeSig, bpm: 60e6 / map[0][2], barTicks, duration, notes, tickToSec };
}
