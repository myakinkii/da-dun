import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained HTML file (JS and CSS inlined, nothing loaded from a CDN),
// so the same build works opened from disk and published as a claude.ai artifact.
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 100000000 },
});
