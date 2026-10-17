// Bundles the web editor into one self-contained HTML file: dist/sketchbook.html
//   node build.js            build once
//   node build.js --watch    rebuild when src/, web/, docs/ or songs/ change
// The page loads only the player scripts from a CDN; everything else is inlined,
// so the file can be opened straight from disk.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, watch } from "node:fs";

const root = new URL("./", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
const safe = s => s.replace(/<\/(script)/gi, "<\\/$1");

function build() {
  const modules = ["src/gm.js", "src/notate.js", "src/csvmidi.js", "src/zip.js", "src/hum.js"]
    .map(f => `// ---- ${f} ----\n` + read(f).replace(/^import .*$/gm, "").replace(/^export /gm, ""))
    .join("\n");
  const songs = readdirSync(new URL("songs/", root)).filter(f => f.endsWith(".txt")).sort()
    .map(f => ({ id: f.replace(/\.txt$/, "").replace(/^\d+-/, ""), text: read("songs/" + f) }));
  const html = read("web/index.html")
    .replace("/*MODULES*/", () => safe(modules))
    .replace("/*APP*/", () => safe(read("web/app.js")))
    .replace("/*SONGS*/", () => safe(JSON.stringify(songs)))
    .replace("/*GUIDE*/", () => safe(JSON.stringify(read("docs/notation.txt"))));
  mkdirSync(new URL("dist/", root), { recursive: true });
  writeFileSync(new URL("dist/sketchbook.html", root), html);
  console.log(`built dist/sketchbook.html (${songs.length} songs, ${Math.round(html.length / 1024)} KB)`);
}

build();
if (process.argv.includes("--watch")) {
  let t = 0;
  const again = () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 100); };
  for (const d of ["src/", "web/", "docs/", "songs/"]) watch(new URL(d, root), { recursive: true }, again);
  console.log("watching for changes...");
}
