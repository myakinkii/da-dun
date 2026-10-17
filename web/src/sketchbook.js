// sketchbook.js: the app's state and logic as one Vue composable.
//
// Storage: every sketch, every edited example and every hum history is a "doc":
//   sk-<id>          {type: "sketch", text, title, updated, by}
//   draft-<example>  {type: "draft", example, text, title, updated, by}
//   hum-<sketchDoc>  {type: "hum", sketch, items: [{id, request, explanation, notation, status, ...}]}
// Docs always live in localStorage. Inside a claude.ai artifact they're also
// synced to the artifact database, in the viewer's private collection
// data/users/<id>, where Claude can read and write them ("by": "claude").

import { ref, shallowRef, computed, reactive } from "vue";
import { notate, csvToMidi, csvToSong, hum, makeZip } from "@da-dun/core";
import GUIDE from "../../docs/notation.txt?raw";
import { capability } from "./claude.js";
import { createPlayer } from "./player.js";

export { GUIDE };
// Menu songs come from two folders: examples/ (in the repo) and songs/ (your
// own, gitignored; picked up by local builds). A song in songs/ with the same
// name as an example replaces it.
const fromFolder = (files, group) => Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, text]) => ({ id: path.split("/").pop().replace(/\.txt$/, "").replace(/^\d+-/, ""), text, group }));
const mine = fromFolder(import.meta.glob("../../songs/*.txt", { query: "?raw", import: "default", eager: true }), "My songs");
export const EXAMPLES = [
  ...fromFolder(import.meta.glob("../../examples/*.txt", { query: "?raw", import: "default", eager: true }), "Examples")
    .filter(e => !mine.some(m => m.id === e.id)),
  ...mine,
];
const NEW_SKETCH = "title New sketch\ntempo 100\ntime 4/4\n\npiano: c4 d e f | g1 |\n";
export const titleOf = text => (String(text).match(/^\s*title\s+(.+)$/im) || [, "Untitled"])[1].trim();
const now = () => new Date().toISOString();

// ---- validation of anything read from storage (it may come from elsewhere) ----
const validItem = i => i && typeof i === "object" && typeof i.id === "string" && typeof i.request === "string" &&
  typeof i.notation === "string" && (i.explanation === undefined || typeof i.explanation === "string");
const validDoc = d => d && typeof d === "object" && (
  (typeof d.text === "string" && d.text.length < 200000 &&
   (d.type === "sketch" || (d.type === "draft" && EXAMPLES.some(e => e.id === d.example)))) ||
  (d.type === "hum" && typeof d.sketch === "string" && Array.isArray(d.items) && d.items.length <= 50 && d.items.every(validItem)));

// ---- localStorage ----
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem("sketchbook:" + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("sketchbook:" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("sketchbook:" + k); } catch (e) {} },
};
function loadLocalDocs() {
  let d = local.get("docs");
  if (!d || typeof d !== "object") {            // migrate the very first version's format
    d = {};
    for (const s of local.get("sketches") || []) d["sk-" + s.id] = { type: "sketch", text: s.text, title: titleOf(s.text), by: "page" };
    for (const e of EXAMPLES) {
      const t = local.get("draft:" + e.id);
      if (typeof t === "string") d["draft-" + e.id] = { type: "draft", example: e.id, text: t, title: titleOf(t), by: "page" };
    }
    local.set("docs", d);
  }
  return new Map(Object.entries(d).filter(([, v]) => validDoc(v)));
}

function compileText(text) {
  try {
    const r = notate(text);
    const m = csvToMidi(r.csv);
    const song = csvToSong(r.csv);
    return { ok: true, csv: r.csv, bytes: m.bytes, song, warnings: [...r.warnings, ...m.warnings],
             bars: Math.ceil(r.ticks / r.barTicks), notes: r.notes };
  } catch (e) {
    return { ok: false, error: e.message, line: e.line || null, warnings: [] };
  }
}

export function useSketchbook() {
  const player = createPlayer();
  const docs = shallowRef(loadLocalDocs());
  const setDocs = m => { docs.value = m; local.set("docs", Object.fromEntries(m)); };
  const currentKey = ref(null);
  const text = ref("");
  const compiled = shallowRef(compileText(""));
  const syncNote = ref("Edits are saved in this browser as you type.");
  const banner = shallowRef(null);                // {text, actions: [{label, fn}]}
  const humState = reactive({ available: false, busy: false, note: "", proposal: null });
  let synced = "", saveTimer = 0, compileTimer = 0, previewing = false, remote = null, humCtl = null;

  // ---- menu entries ----
  const entries = computed(() => {
    const sketches = [...docs.value.entries()].filter(([, d]) => d.type === "sketch").sort((a, b) => a[0].localeCompare(b[0]));
    return [
      ...EXAMPLES.map(e => {
        const d = docs.value.get("draft-" + e.id);
        return { key: "ex:" + e.id, docId: "draft-" + e.id, example: e.id, group: e.group, original: e.text, text: d ? d.text : e.text };
      }),
      ...sketches.map(([id, d]) => ({ key: id, docId: id, sketch: true, text: d.text })),
    ];
  });
  const current = computed(() => entries.value.find(e => e.key === currentKey.value) || entries.value[0]);
  const menu = computed(() => entries.value.map(e => ({ key: e.key, group: e.example ? e.group : "My sketches",
                                                        title: titleOf(e.key === currentKey.value ? text.value : e.text) })));

  // ---- editor ----
  function setEditor(t) {
    text.value = t; synced = t;
    compileNow();
  }
  function compileNow() {
    clearTimeout(compileTimer); compileTimer = 0;
    const c = compileText(text.value);
    compiled.value = c;
    if (c.ok && !previewing) player.load(c.song);
  }
  function onInput(t) {
    text.value = t;
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700);
    clearTimeout(compileTimer); compileTimer = setTimeout(compileNow, 300);
  }
  function open(key) {
    if (saveTimer) saveNow();
    currentKey.value = key;
    if (!entries.value.some(e => e.key === key)) currentKey.value = entries.value[0].key;
    local.set("last", currentKey.value);
    closeProposal(false);
    setEditor(current.value.text);
    const last = humItems().slice(-1)[0];
    if (last && last.status === "open") showProposal(last);
  }
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = 0;
    const c = current.value; if (!c) return;
    const m = new Map(docs.value);
    if (c.example && text.value === c.original) m.delete(c.docId);
    else m.set(c.docId, { type: c.example ? "draft" : "sketch", ...(c.example ? { example: c.example } : {}),
                          text: text.value, title: titleOf(text.value), updated: now(), by: "page" });
    synced = text.value;
    setDocs(m); pushRemote(c.docId);
  }
  function newSketch() {
    const id = "sk-" + Date.now().toString(36);
    const m = new Map(docs.value);
    m.set(id, { type: "sketch", text: NEW_SKETCH, title: titleOf(NEW_SKETCH), updated: now(), by: "page" });
    setDocs(m); pushRemote(id); open(id);
  }
  function revert() {
    const c = current.value;
    if (!c.example || text.value === c.original) return;
    if (!confirm("Throw away your edits to this example?")) return;
    setEditor(c.original); saveNow();
  }
  function remove() {
    const c = current.value;
    if (!c.sketch || !confirm(`Delete “${titleOf(text.value)}”?`)) return;
    clearTimeout(saveTimer); saveTimer = 0;
    const m = new Map(docs.value); m.delete(c.docId); m.delete("hum-" + c.docId);
    setDocs(m); pushRemote(c.docId); pushRemote("hum-" + c.docId);
    open(entries.value[0].key);
  }

  // ---- banner ----
  const showBanner = (t, actions = [{ label: "OK" }]) => { banner.value = { text: t, actions }; };
  const bannerAction = a => { banner.value = null; if (a.fn) a.fn(); };

  // ---- sync with the artifact database ----
  async function connect() {
    const [db, user] = await Promise.all([capability("db"), capability("user")]);
    if (!db || !user) return;
    let uid = null;
    try { uid = await user.id(); } catch (e) {}
    if (!uid) return;
    remote = { col: db.collection("data/users/" + uid), writing: new Map() };
    let first = true;
    remote.col.onSnapshot(snap => {
      const isFirst = first; first = false;
      onRemote(snap, isFirst);
      syncNote.value = "Saved to your artifact, so Claude can see your sketches.";
    }, () => {
      remote = null;
      syncNote.value = "Syncing with the artifact stopped; edits are saved in this browser.";
    });
  }
  async function pushRemote(docId) {
    if (!remote) return;
    const w = remote.writing;
    if (w.has(docId)) { w.set(docId, "again"); return; }
    try {
      do {
        w.set(docId, true);
        const d = docs.value.get(docId);
        if (d) await remote.col.doc(docId).set(d); else await remote.col.doc(docId).delete();
      } while (w.get(docId) === "again");
    } catch (e) {
      syncNote.value = e && e.code === "quota_exceeded"
        ? "The artifact’s storage is full; delete some sketches. Edits are saved in this browser."
        : "Couldn’t save to the artifact just now; edits are saved in this browser.";
    } finally { w.delete(docId); }
  }
  function onRemote(snap, isFirst) {
    const next = new Map();
    const cid = current.value && current.value.docId;
    let cur = null;
    for (const d of snap.docs) {
      const v = d.data();
      if (!validDoc(v)) continue;
      next.set(d.id, v);
      if (d.id === cid) cur = { v, pending: d.metadata.hasPendingWrites };
    }
    const busy = cid && (saveTimer || (remote && remote.writing.has(cid)));
    if (busy && docs.value.has(cid)) next.set(cid, docs.value.get(cid));
    const upload = [];
    if (isFirst) for (const [id, v] of docs.value) if (!next.has(id)) { next.set(id, v); upload.push(id); }
    const c = current.value;
    setDocs(next);
    upload.forEach(pushRemote);

    if (!c || busy || (cur && cur.pending)) return;
    const incoming = cur ? cur.v.text : (c.example ? c.original : null);
    if (incoming === null) {
      showBanner("This sketch was deleted elsewhere.");
      open(entries.value[0].key);
      return;
    }
    if (incoming !== text.value) {
      const who = cur && cur.v.by === "claude" ? "Claude" : "Another window";
      if (text.value === synced) {
        setEditor(incoming);
        showBanner(`${who} updated this sketch.`);
      } else {
        showBanner(`${who} changed this sketch while you were editing.`, [
          { label: "Load it", fn: () => setEditor(incoming) },
          { label: "Keep mine", fn: () => saveNow() },
        ]);
      }
    }
  }

  // ---- hum box ----
  const humItems = (sketch = current.value.docId) => (docs.value.get("hum-" + sketch) || { items: [] }).items;
  const humHistory = computed(() => (current.value ? humItems().slice().reverse() : []));
  function saveHumItems(items, sketch = current.value.docId) {
    const id = "hum-" + sketch, m = new Map(docs.value);
    if (items.length) m.set(id, { type: "hum", sketch, items: items.slice(-20), updated: now() });
    else m.delete(id);
    setDocs(m); pushRemote(id);
  }
  const setHumStatus = (itemId, status) => saveHumItems(humItems().map(i => (i.id === itemId ? { ...i, status } : i)));
  function showProposal(item) {
    humState.proposal = { ...item, answerOnly: item.notation.trim() === text.value.trim() };
    const n = (item.problems || []).length;
    humState.note = n
      ? `Heads-up: the converter still found ${n} problem${n === 1 ? "" : "s"}; you’ll see ${n === 1 ? "it" : "them"} under the editor if you use this.`
      : item.repaired ? "Claude fixed a mistake in its first try." : "";
  }
  function closeProposal(restorePlayer = true) {
    humState.proposal = null; humState.note = "";
    if (previewing) {
      previewing = false;
      if (restorePlayer && compiled.value.ok) player.load(compiled.value.song);
    }
  }
  const HUM_ERRORS = {
    cancelled: "Stopped.",
    not_granted: "The hum box needs your permission to ask Claude. Reload the page to be asked again.",
    rate_limited: "Claude is busy, or you’ve reached a usage limit. Try again in a little while.",
    refused: "Claude declined that request. Try describing it differently.",
    invalid_json: "Claude’s answer couldn’t be read. Try again.",
    empty_completion: "Claude’s answer came back empty. Try again.",
    prompt_too_large: "This sketch is too long to send in one go.",
    session_expired: "Your session expired. Reload the page and try again.",
  };
  const humError = e => HUM_ERRORS[e && e.code] ||
    (e && e.code ? `Asking Claude isn’t working right now (${e.code}).` : (e && e.message) || "Something went wrong.");
  async function humAsk(request) {
    request = request.trim();
    const sample = await capability("sample");
    if (!request || !sample || humCtl) return false;
    const ctl = humCtl = new AbortController();
    humState.busy = true; humState.proposal = null; humState.note = "Thinking…";
    const base = text.value, sketch = current.value.docId;
    try {
      const r = await hum({ notation: base, request, guide: GUIDE, repairs: 1,
                            ask: p => sample.json(p, { signal: ctl.signal, cache: false }) });
      const item = { id: Date.now().toString(36), request, explanation: r.explanation, notation: r.notation,
                     problems: r.problems, repaired: r.attempts > 1, at: now(),
                     status: r.notation.trim() === base.trim() ? "answer" : "open" };
      saveHumItems([...humItems(sketch), item], sketch);   // kept even if you switched sketches meanwhile
      if (current.value.docId === sketch) showProposal(item); else humState.note = "";
      return true;
    } catch (e) {
      humState.note = humError(e);
      return false;
    } finally {
      humCtl = null; humState.busy = false;
    }
  }
  const humStop = () => { if (humCtl) humCtl.abort(); };
  function humPreview() {
    const p = humState.proposal; if (!p) return;
    const c = compileText(p.notation);
    if (!c.ok) { humState.note = c.error; return; }
    previewing = true;
    player.load(c.song);
    player.play(0);
  }
  function humUse() {
    const p = humState.proposal; if (!p) return;
    const before = text.value;
    setHumStatus(p.id, "used");
    closeProposal(false);
    setEditor(p.notation); saveNow();
    showBanner("Using Claude’s version now.", [
      { label: "Undo", fn: () => { setEditor(before); saveNow(); } },
      { label: "OK" },
    ]);
  }
  function humDiscard() {
    const p = humState.proposal;
    if (p && p.status === "open") setHumStatus(p.id, "dropped");
    closeProposal();
  }
  function humForget() {
    if (!confirm("Forget all of Claude’s earlier answers for this sketch?")) return;
    closeProposal(); saveHumItems([]);
  }

  // ---- saving files ----
  const downloadsP = capability("downloads");
  const zipMidi = ref(false);
  downloadsP.then(d => { zipMidi.value = !!d; });
  async function saveFile(kind) {
    const c = compiled.value;
    if (kind !== "txt" && !c.ok) { showBanner("Fix the error first; there’s nothing to save yet."); return; }
    const name = (titleOf(text.value).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "sketch").toLowerCase();
    let filename = `${name}.${kind}`;
    let data = kind === "mid" ? c.bytes : kind === "csv" ? c.csv : text.value;
    const downloads = await downloadsP;
    if (downloads) {
      if (kind === "mid") { data = makeZip([{ name: filename, data }]); filename = `${name}-midi.zip`; }
      try { await downloads.save({ filename, data: data instanceof Uint8Array ? data.slice() : data }); }
      catch (e) { if (!e || e.code !== "declined") showBanner(`Couldn’t save the file (${(e && e.code) || "error"}).`); }
      return;
    }
    const blob = new Blob([data], { type: kind === "mid" ? "audio/midi" : "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- start ----
  function start() {
    open(local.get("last") || "ex:" + EXAMPLES[0].id);
    connect();
    capability("sample").then(s => { humState.available = !!s; });
    window.addEventListener("beforeunload", () => { if (saveTimer) saveNow(); });
  }

  return {
    player, text, compiled, current, currentKey, menu, syncNote, banner, humState, humHistory, zipMidi,
    start, open, onInput, compileNow, newSketch, revert, remove, saveFile, bannerAction,
    humAsk, humStop, humPreview, humUse, humDiscard, humForget, showProposal,
    get previewing() { return previewing; },
  };
}
