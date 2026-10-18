# Your songs

Put your own `.txt` sketches here. This folder is gitignored (except this
file), and local builds (`npm run dev`, `npm run build`) show the songs in the
editor's menu under "My songs". A file named like an example (say
`01-our-piece.txt`) replaces that example in the menu.

Songs written before fixed octaves (with the old "nearest note" rule, where
`o4` reset a reference) convert with the same pitches:

```sh
node core/src/cli.js migrate songs/my-song.txt --write
```

Run it once per file: it assumes the old rule.
