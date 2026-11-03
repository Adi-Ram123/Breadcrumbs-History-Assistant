# Mutants

Each wrong build below is kept as a small patch in this folder, and the test suite must fail on every one. **Human-owned:** agents do not edit this folder.

Patches are added once the code they mutate exists. Name them `NN-short-name.patch` and apply with `git apply tests/mutants/NN-short-name.patch` (revert with `git apply -R`).

| # | Wrong build | Check that fails |
| --- | --- | --- |
| 01 | "2 days ago" computed from UTC midnight, so evening searches land on the wrong day | Intent accuracy (time range) |
| 02 | Days counted as fixed 24-hour steps, so ranges are off by an hour across the Nov 1 time change | Intent accuracy and fetch |
| 03 | Range end treated as inclusive, so a midnight entry is counted in two days | Fetch given the expected Intent |
| 04 | Topic matched as a substring, so "java" returns "javascript" pages | Fetch given the expected Intent |
| 05 | "What did I search" also returns visited pages | Intent accuracy (kind) and fetch |
| 06 | Delete removes the SQLite row but leaves its vectors | Deletion |
| 07 | Generated answer names a search that does not exist | No invented entries |
