// csvmidi.js: encode midicsv-format CSV as a Standard MIDI File.
// A small JavaScript take on John Walker's csvmidi (fourmilab.ch/webtools/midicsv),
// covering the common record types. Output matches csvmidi byte for byte for
// everything notate.js produces; test/parity.test.js checks this.

const TEXT_META = {
  text_t: 0x01, copyright_t: 0x02, title_t: 0x03, instrument_name_t: 0x04,
  lyric_t: 0x05, marker_t: 0x06, cue_point_t: 0x07,
};
// [status nibble, number of data fields]
const CHANNEL = {
  note_off_c: [0x80, 2], note_on_c: [0x90, 2], poly_aftertouch_c: [0xA0, 2],
  control_c: [0xB0, 2], program_c: [0xC0, 1], channel_aftertouch_c: [0xD0, 1],
};

/** Split one CSV record into fields. Quoted fields become {bytes}. */
export function splitRecord(s) {
  const fields = [];
  let i = 0;
  while (i <= s.length) {
    while (s[i] === " " || s[i] === "\t") i++;
    if (s[i] === '"') {
      const bytes = [];
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '"') {
          if (s[i + 1] === '"') { bytes.push(0x22); i += 2; continue; }
          i++; break;
        }
        if (c === "\\") {
          if (s[i + 1] === "\\") { bytes.push(0x5C); i += 2; continue; }
          const oct = s.slice(i + 1, i + 4);
          if (/^[0-7]{3}$/.test(oct)) { bytes.push(parseInt(oct, 8) & 0xFF); i += 4; continue; }
        }
        const cp = s.codePointAt(i);
        bytes.push(...new TextEncoder().encode(String.fromCodePoint(cp)));
        i += cp > 0xFFFF ? 2 : 1;
      }
      fields.push({ bytes });
      while (i < s.length && s[i] !== ",") i++;
    } else {
      let j = s.indexOf(",", i);
      if (j < 0) j = s.length;
      fields.push(s.slice(i, j).trim());
      i = j;
    }
    i++;
  }
  return fields;
}

function vlq(n) {
  const out = [n & 0x7F];
  while ((n >>= 7) > 0) out.unshift((n & 0x7F) | 0x80);
  return out;
}

const u32 = n => [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
const u16 = n => [(n >>> 8) & 0xFF, n & 0xFF];

/**
 * Convert midicsv CSV text to MIDI file bytes.
 * @param {string} csv
 * @param {{runningStatus?: boolean}} [opts]  runningStatus false is like csvmidi -x
 * @returns {{bytes: Uint8Array, warnings: {line: number, message: string}[]}}
 */
export function csvToMidi(csv, opts = {}) {
  const running = opts.runningStatus !== false;
  const warnings = [];
  const warn = (line, message) => warnings.push({ line, message });
  let header = null;
  const tracks = [];
  let cur = null;

  const lines = csv.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const s = lines[i].trim();
    if (s === "" || s[0] === "#" || s[0] === ";") continue;
    const f = splitRecord(s);
    if (f.length < 3 || typeof f[2] !== "string") { warn(ln, "record needs at least track, time and type"); continue; }
    const track = Number(f[0]), time = Number(f[1]), type = f[2].toLowerCase();
    if (!Number.isInteger(track) || !Number.isInteger(time) || time < 0) { warn(ln, "track and time must be whole numbers"); continue; }
    const nums = f.slice(3).map(x => (typeof x === "string" ? Number(x) : NaN));
    const need = (n, ...ranges) => {
      if (nums.length < n) { warn(ln, `${f[2]} needs ${n} values`); return false; }
      for (let k = 0; k < ranges.length; k++) {
        const [lo, hi] = ranges[k], v = nums[k];
        if (!Number.isInteger(v) || v < lo || v > hi) { warn(ln, `${f[2]}: value ${f[3 + k]} should be ${lo} to ${hi}`); return false; }
      }
      return true;
    };

    if (type === "header") {
      if (!need(3, [0, 2], [1, 65535], [1, 65535])) continue;
      header = { format: nums[0], ntracks: nums[1], division: nums[2] };
      continue;
    }
    if (type === "end_of_file") break;
    if (type === "start_track") {
      cur = { num: track, data: [], last: 0, status: 0, ended: false };
      tracks.push(cur);
      continue;
    }
    if (!cur || cur.num !== track || cur.ended) { warn(ln, `record for track ${track} outside its Start_track/End_track`); continue; }
    if (time < cur.last) { warn(ln, `time ${time} is earlier than the previous record in this track`); continue; }

    const emit = (bytes, isChannel) => {
      cur.data.push(...vlq(time - cur.last));
      cur.last = time;
      if (isChannel && running && bytes[0] === cur.status) bytes = bytes.slice(1);
      else cur.status = isChannel ? bytes[0] : 0;
      cur.data.push(...bytes);
    };
    const meta = (kind, payload) => emit([0xFF, kind, ...vlq(payload.length), ...payload], false);

    if (type in CHANNEL) {
      const [st, n] = CHANNEL[type];
      if (!need(n + 1, ...[[0, 15], [0, 127], [0, 127]].slice(0, n + 1))) continue;
      emit([st | nums[0], ...nums.slice(1, n + 1)], true);
    } else if (type === "pitch_bend_c") {
      if (!need(2, [0, 15], [0, 16383])) continue;
      emit([0xE0 | nums[0], nums[1] & 0x7F, nums[1] >> 7], true);
    } else if (type in TEXT_META) {
      const txt = f[3];
      if (!txt || typeof txt === "string") { warn(ln, `${f[2]} needs a quoted string`); continue; }
      meta(TEXT_META[type], txt.bytes);
    } else if (type === "tempo") {
      if (!need(1, [1, 16777215])) continue;
      meta(0x51, [(nums[0] >> 16) & 0xFF, (nums[0] >> 8) & 0xFF, nums[0] & 0xFF]);
    } else if (type === "time_signature") {
      if (!need(4, [0, 255], [0, 255], [0, 255], [0, 255])) continue;
      meta(0x58, nums.slice(0, 4));
    } else if (type === "key_signature") {
      if (!need(1, [-7, 7])) continue;
      const mode = f[4] && typeof f[4] !== "string" ? new TextDecoder().decode(new Uint8Array(f[4].bytes)) : String(f[4] || "");
      meta(0x59, [nums[0] & 0xFF, /minor/i.test(mode) ? 1 : 0]);
    } else if (type === "sequence_number") {
      if (!need(1, [0, 65535])) continue;
      meta(0x00, u16(nums[0]));
    } else if (type === "midi_port") {
      if (!need(1, [0, 255])) continue;
      meta(0x21, [nums[0]]);
    } else if (type === "channel_prefix") {
      if (!need(1, [0, 255])) continue;
      meta(0x20, [nums[0]]);
    } else if (type === "end_track") {
      meta(0x2F, []);
      cur.ended = true;
    } else {
      warn(ln, `record type "${f[2]}" isn't supported here (use the real csvmidi for it)`);
    }
  }

  if (!header) throw new Error("CSV has no Header record");
  const out = [0x4D, 0x54, 0x68, 0x64, ...u32(6), ...u16(header.format), ...u16(header.ntracks), ...u16(header.division)];
  for (const tr of tracks) {
    if (!tr.ended) {
      warn(null, `track ${tr.num} has no End_track; added one`);
      tr.data.push(0x00, 0xFF, 0x2F, 0x00);
    }
    out.push(0x4D, 0x54, 0x72, 0x6B, ...u32(tr.data.length), ...tr.data);
  }
  if (tracks.length !== header.ntracks) warn(null, `Header says ${header.ntracks} tracks, but there are ${tracks.length}`);
  return { bytes: Uint8Array.from(out), warnings };
}
