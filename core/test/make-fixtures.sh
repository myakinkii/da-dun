#!/bin/sh
# Regenerate test/expected/ from the reference tools: perl/notate.pl and
# fourmilab's csvmidi (Debian/Ubuntu: apt install midicsv).
set -e
cd "$(dirname "$0")/.."
for f in ../songs/*.txt test/cases/*.txt; do
  n=$(basename "$f" .txt)
  perl ../perl/notate.pl "$f" > "test/expected/$n.csv" 2>/dev/null
  csvmidi "test/expected/$n.csv" "test/expected/$n.mid"
done
csvmidi test/csv/all-records.csv test/expected/all-records.mid
echo "fixtures updated"
