# Model evaluation

Label-stage scoring for the parsers (exact Intent accuracy on kind, time range and topic), retriever metrics such as Recall@5, and the three-parser comparison that applies the swap rule in `eval/pass_bars.toml`. Model selection uses the dev set only. The shared harness lives in `eval/` at the repo root; how these metrics plug into it is Q&A item 9 in `ml/CLAUDE.md`.
