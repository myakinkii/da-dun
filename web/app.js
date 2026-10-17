// ---- app (inlined into dist/sketchbook.html by build.js) ----
// Storage: every sketch and every edited example is one "doc":
//   sk-<id>          {type: "sketch", text, title, updated, by}
//   draft-<example>  {type: "draft", example, text, title, updated, by}
// Docs always live in this browser's localStorage. Inside a claude.ai
// artifact they are also synced to the artifact's database, in the viewer's
// private collection data/users/<id>, where Claude can read and write them
// from the chat ("by": "claude" marks Claude's edits).

const EXAMPLES = /*SONGS*/;
const GUIDE = /*GUIDE*/;
const NEW_SKETCH = "title New sketch\ntempo 100\ntime 4/4\n\npiano: c4 d e f | g1 |\n";
const $ = id => document.getElementById(id);
const editor = $("editor"), player = $("player"), viz = $("viz"), sel = $("song");
const titleOf = text => (String(text).match(/^\s*title\s+(.+)$/im) || [, "Untitled"])[1].trim();

// ---- claude.ai capabilities (absent when the page runs from a file) ----
const hasClaude = typeof window.claude === "object" && window.claude !== null && typeof window.claude.use === "function";
const cap = name => (hasClaude ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
const downloadsP = cap("downloads");

// ---- local storage ----
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem("sketchbook:" + k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("sketchbook:" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("sketchbook:" + k); } catch (e) {} },
};
const validDoc = d => d && typeof d === "object" && typeof d.text === "string" && d.text.length < 200000 &&
  (d.type === "sketch" || (d.type === "draft" && EXAMPLES.some(e => e.id === d.example)));

function loadLocalDocs() {
  let d = local.get("docs");
  if (!d || typeof d !== "object") {          // migrate the first version's storage format
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
let docs = loadLocalDocs();
const persistLocal = () => local.set("docs", Object.fromEntries(docs));

// ---- remote (artifact database) ----
let remote = null;                  // {col, writing: Map<docId, true|"again">}
const syncNote = text => { $("sync").textContent = text; };

async function connect() {
  const [db, user] = await Promise.all([cap("db"), cap("user")]);
  if (!db || !user) return;
  let uid = null;
  try { uid = await user.id(); } catch (e) {}
  if (!uid) return;
  remote = { col: db.collection("data/users/" + uid), writing: new Map() };
  let first = true;
  remote.col.onSnapshot(snap => {
    const isFirst = first; first = false;
    onRemote(snap, isFirst);
    syncNote("Saved to your artifact, so Claude can see your sketches.");
  }, () => {
    remote = null;
    syncNote("Syncing with the artifact stopped; edits are saved in this browser.");
  });
}

async function pushRemote(docId) {
  if (!remote) return;
  const w = remote.writing;
  if (w.has(docId)) { w.set(docId, "again"); return; }
  try {
    do {
      w.set(docId, true);
      const d = docs.get(docId);
      if (d) await remote.col.doc(docId).set(d); else await remote.col.doc(docId).delete();
    } while (w.get(docId) === "again");
  } catch (e) {
    syncNote(e && e.code === "quota_exceeded"
      ? "The artifact’s storage is full; delete some sketches. Edits are saved in this browser."
      : "Couldn’t save to the artifact just now; edits are saved in this browser.");
  } finally { w.delete(docId); }
}

function onRemote(snap, isFirst) {
  const next = new Map();
  let curRemote, curSeen = false;
  for (const d of snap.docs) {
    const v = d.data();
    if (!validDoc(v)) continue;
    next.set(d.id, v);
    if (current && d.id === current.docId) { curRemote = { v, pending: d.metadata.hasPendingWrites }; curSeen = true; }
  }
  // keep this page's unsaved or in-flight edit of the open doc
  const cid = current && current.docId;
  const busy = cid && (saveTimer || (remote && remote.writing.has(cid)));
  if (busy && docs.has(cid)) next.set(cid, docs.get(cid));
  const upload = [];
  if (isFirst) {                     // first sync: keep (and upload) anything only this browser has
    for (const [id, v] of docs) if (!next.has(id)) { next.set(id, v); upload.push(id); }
  }
  docs = next;
  persistLocal();
  upload.forEach(pushRemote);

  if (current && !busy && !(curRemote && curRemote.pending)) {
    const incoming = curSeen ? curRemote.v.text : (current.example ? current.original : null);
    if (incoming === null) {
      showBanner("This sketch was deleted elsewhere.");
      open(entries()[0].key);
      return;
    }
    if (incoming !== editor.value) {
      const who = curSeen && curRemote.v.by === "claude" ? "Claude" : "Another window";
      if (editor.value === synced) {
        setEditor(incoming);
        showBanner(`${who} updated this sketch.`);
      } else {
        showBanner(`${who} changed this sketch while you were editing.`, {
          load: () => setEditor(incoming),
          keep: () => saveNow(),
        });
      }
    }
  }
  fillMenu(current ? current.key : undefined);
}

// ---- entries in the menu ----
let current = null, synced = "", latest = null, pending = false, view = "csv", saveTimer = 0;

function entries() {
  const sketches = [...docs.entries()].filter(([, d]) => d.type === "sketch").sort((a, b) => a[0].localeCompare(b[0]));
  return [
    ...EXAMPLES.map(e => {
      const d = docs.get("draft-" + e.id);
      return { key: "ex:" + e.id, docId: "draft-" + e.id, example: e.id, original: e.text, text: d ? d.text : e.text };
    }),
    ...sketches.map(([id, d]) => ({ key: id, docId: id, sketch: true, text: d.text })),
  ];
}
function fillMenu(selectKey) {
  const all = entries();
  sel.innerHTML = "";
  for (const [label, test] of [["Examples", e => e.example], ["My sketches", e => e.sketch]]) {
    const items = all.filter(test);
    if (!items.length) continue;
    const og = document.createElement("optgroup"); og.label = label;
    for (const e of items) og.appendChild(new Option(titleOf(e.key === (current && current.key) ? editor.value : e.text), e.key));
    sel.appendChild(og);
  }
  if (selectKey && all.some(e => e.key === selectKey)) sel.value = selectKey;
}
function open(key) {
  if (saveTimer) saveNow();
  const all = entries();
  current = all.find(e => e.key === key) || all[0];
  local.set("last", current.key);
  $("revert").hidden = !current.example;
  $("delete").hidden = !current.sketch;
  setEditor(current.text);
  fillMenu(current.key);
}
function setEditor(text) {
  editor.value = text;
  synced = text;
  compile();
}

// ---- saving ----
function saveNow() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!current) return;
  const text = editor.value, id = current.docId;
  if (current.example && text === current.original) docs.delete(id);
  else docs.set(id, { type: current.example ? "draft" : "sketch", ...(current.example ? { example: current.example } : {}),
                     text, title: titleOf(text), updated: new Date().toISOString(), by: "page" });
  synced = text;
  persistLocal();
  pushRemote(id);
}

// ---- compile: notation -> CSV -> MIDI -> player ----
function lineButton(w) {
  const li = document.createElement("li"), b = document.createElement("button");
  b.textContent = (w.line ? `Line ${w.line}: ` : "") + w.message;
  if (w.line) b.onclick = () => gotoLine(w.line);
  li.appendChild(b); return li;
}
function compile() {
  const st = $("status"); st.innerHTML = "";
  try {
    const r = notate(editor.value);
    const m = csvToMidi(r.csv);
    latest = { csv: r.csv, bytes: m.bytes, ns: null };
    if (window.core) latest.ns = core.midiToSequenceProto(m.bytes);
    const ws = [...r.warnings, ...m.warnings];
    const bars = Math.ceil(r.ticks / r.barTicks);
    const ok = document.createElement("span"); ok.className = "ok";
    ok.textContent = `${bars} bar${bars === 1 ? "" : "s"}, ${r.notes} note${r.notes === 1 ? "" : "s"}` +
      (ws.length ? `, ${ws.length} warning${ws.length === 1 ? "" : "s"}:` : ". All good.");
    st.appendChild(ok);
    if (ws.length) { const ul = document.createElement("ul"); ws.forEach(w => ul.appendChild(lineButton(w))); st.appendChild(ul); }
    if (!window.core) {
      const e = document.createElement("div"); e.className = "err";
      e.textContent = "The player scripts didn’t load, so playback is off. Check your internet connection and reload.";
      st.appendChild(e);
    }
    showText();
    if (player.playing) pending = true; else load();
  } catch (e) {
    latest = null;
    const err = document.createElement("div"); err.className = "err";
    err.textContent = e.message; st.appendChild(err);
    if (e.line) { const ul = document.createElement("ul"); ul.appendChild(lineButton({ line: e.line, message: "go to the problem" })); st.appendChild(ul); }
  }
}
function load() {
  pending = false;
  if (latest && latest.ns) { player.noteSequence = latest.ns; viz.noteSequence = latest.ns; }
}
function playFromStart() {
  compile();
  if (!latest || !latest.ns) return;
  try { if (window.Tone) Tone.start(); } catch (e) {}
  if (player.playing) player.stop();
  load();
  setTimeout(() => player.start(), 0);
}
player.addEventListener("stop", () => { if (pending) load(); });

function gotoLine(n) {
  const lines = editor.value.split("\n");
  const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
  editor.focus();
  editor.setSelectionRange(start, start + (lines[n - 1] || "").length);
  const lh = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  editor.scrollTop = Math.max(0, (n - 3) * lh);
}
function showText() { $("text").textContent = view === "guide" ? GUIDE : (latest ? latest.csv : ""); }

// ---- banner ----
let bannerActions = {};
function showBanner(text, actions = {}) {
  bannerActions = actions;
  $("banner-text").textContent = text;
  $("banner-load").hidden = !actions.load;
  $("banner-keep").hidden = !actions.keep;
  $("banner-close").hidden = !!(actions.load || actions.keep);
  $("banner").hidden = false;
}
const hideBanner = () => { $("banner").hidden = true; bannerActions = {}; };
$("banner-load").onclick = () => { const f = bannerActions.load; hideBanner(); if (f) f(); };
$("banner-keep").onclick = () => { const f = bannerActions.keep; hideBanner(); if (f) f(); };
$("banner-close").onclick = hideBanner;

// ---- saving files ----
async function saveFile(kind) {
  if (kind !== "txt" && !latest) { showBanner("Fix the error above first; there’s nothing to save yet."); return; }
  const name = (titleOf(editor.value).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "sketch").toLowerCase();
  let filename = `${name}.${kind}`;
  let data = kind === "mid" ? latest.bytes : kind === "csv" ? latest.csv : editor.value;
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
downloadsP.then(d => { if (d) document.querySelector('[data-save="mid"]').textContent = "MIDI (zip)"; });

// ---- events ----
editor.addEventListener("input", () => {
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700);
  clearTimeout(compileTimer); compileTimer = setTimeout(compile, 300);
  const opt = [...sel.options].find(o => o.value === current.key);
  if (opt) opt.textContent = titleOf(editor.value);
});
let compileTimer = 0;
editor.addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); playFromStart(); }
  else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end"); editor.dispatchEvent(new Event("input")); }
});
window.addEventListener("beforeunload", () => { if (saveTimer) saveNow(); });
document.addEventListener("pointerdown", () => { try { if (window.Tone) Tone.start(); } catch (e) {} }, { capture: true });
$("play").onclick = playFromStart;
sel.onchange = () => { if (player.playing) player.stop(); hideBanner(); open(sel.value); };
$("new").onclick = () => {
  const id = "sk-" + Date.now().toString(36);
  docs.set(id, { type: "sketch", text: NEW_SKETCH, title: titleOf(NEW_SKETCH), updated: new Date().toISOString(), by: "page" });
  persistLocal(); pushRemote(id); open(id); editor.focus();
};
$("revert").onclick = () => {
  if (!current.example || editor.value === current.original) return;
  if (!confirm("Throw away your edits to this example?")) return;
  setEditor(current.original); saveNow();
};
$("delete").onclick = () => {
  if (!current.sketch || !confirm(`Delete “${titleOf(editor.value)}”?`)) return;
  clearTimeout(saveTimer); saveTimer = 0;
  const id = current.docId; docs.delete(id); persistLocal(); pushRemote(id);
  current = null; open(entries()[0].key);
};
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  view = b.dataset.show;
  document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
  showText();
});
document.querySelectorAll("[data-save]").forEach(b => b.onclick = () => saveFile(b.dataset.save));

open(local.get("last") || "ex:" + EXAMPLES[0].id);
connect();
