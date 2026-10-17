// Every song in examples/ and songs/ converts. These are music, not fixtures:
// only hard errors fail here (warnings are fine while a piece is in progress).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { notate } from "../src/index.js";

for (const dir of ["examples", "songs"]) {
  const url = new URL(`../../${dir}/`, import.meta.url);
  if (!existsSync(url)) continue;
  for (const f of readdirSync(url).filter(f => f.endsWith(".txt"))) {
    test(`${dir}/${f} converts`, () => {
      assert.doesNotThrow(() => notate(readFileSync(new URL(f, url), "utf8")));
    });
  }
}
