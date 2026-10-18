// toFixedOctaves: old "nearest note" scores convert to fixed octaves with every
// pitch kept. test/legacy/ holds the old-format versions of test/cases/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { notate, toFixedOctaves } from "../src/index.js";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
for (const f of readdirSync(new URL("legacy/", import.meta.url))) {
  test(`legacy ${f} converts with identical output`, () => {
    const name = f.replace(".txt", "");
    assert.equal(notate(toFixedOctaves(read("legacy/" + f))).csv, read(`expected/${name}.csv`));
  });
}

test("only octave marks change; o-tokens move to the part line", () => {
  assert.equal(toFixedOctaves("# hi\ncello:   r8 g g g | >eb2\n"), "# hi\ncello o3:   r8 g g g | >eb2\n");
  assert.equal(toFixedOctaves("flute: o5 c d e f g a b c c4 |"), "flute o5: c d e f g a b c' c'4 |");
  assert.equal(toFixedOctaves("piano: a'4 R | e R |"), "piano: a4 R | e R |");
  assert.equal(toFixedOctaves("kick: |x...|"), "kick: |x...|");
});
