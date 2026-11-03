# ml/ (owner: Aditya)

Model code for Breadcrumbs: the retriever, the three parsers, the local LLM client, the answer writer, and the training and evaluation for all of them. Read the root `CLAUDE.md` invariants first; they apply here too.

## Scope

**Yours:** the retriever (training, export and the runtime `Embedder`), the parsers (`rules`, `llm`, `tagger`), the local LLM client and answer writer, the training-data generator, and model metrics.

**Not yours, so don't change it from here:** the database, the API routes, the executor, the verifier and the extension (Daniel). For shared files (`backend/app/schemas/intent.py`, `docs/time-rules.md`, `fixtures/`, `eval/`), propose changes and agree on them with Daniel.

## Stack

Python 3.12 with uv; this folder is the workspace member `breadcrumbs-ml`. It uses sentence-transformers, plus transformers, datasets, seqeval and accelerate for training, and PyTorch with MPS on the MacBook.

```bash
uv sync --all-packages                 # runtime deps (backend + ml)
uv sync --all-packages --group train   # add training deps
uv run pytest ml/tests                 # your tests
uv run pytest                          # everything (run before handing work over)
```

Add a runtime dependency with `uv add --package breadcrumbs-ml <pkg>`, or a training-only one with `uv add --package breadcrumbs-ml --group train <pkg>`.

## Contracts you implement

The backend talks to your code only through the Protocols in `backend/app/ports.py`:

```python
class Parser(Protocol):
    name: str
    def parse(self, question: str, now: datetime, tz: str) -> Intent: ...

class Embedder(Protocol):
    name: str
    version: str   # changing it makes the backend re-embed every chunk
    dim: int
    def embed(self, texts: list[str]) -> list[list[float]]: ...   # L2-normalized

class LLMClient(Protocol):
    mode: str      # live | replay | record
    def complete(self, messages: list[dict[str, str]], json_schema: dict) -> str: ...

class AnswerWriter(Protocol):
    mode: Literal["llm", "template"]
    def write(self, question: str, intent: Intent, results: list[Result]) -> Answer: ...
```

`backend/app/registry.py` loads your classes by these exact import paths. The skeletons already exist and raise `NotImplementedError`:

| `backend/.env` setting | Loads |
| --- | --- |
| `PARSER=rules` | `breadcrumbs_ml.runtime.parser_rules:RulesParser` |
| `PARSER=llm` | `breadcrumbs_ml.runtime.parser_llm:LLMParser` |
| `PARSER=tagger` | `breadcrumbs_ml.runtime.parser_tagger:TaggerParser` |
| `EMBEDDER=<path>` | `breadcrumbs_ml.runtime.embedder:load_embedder(path)` |
| `LLM_MODE=live\|replay\|record` | `breadcrumbs_ml.runtime.answer_writer:LLMAnswerWriter(mode=...)` |

The `Intent` (`backend/app/schemas/intent.py`) is a shared draft: `kind` (search, visit or any), `time_range` (tz-aware, `[start, end)`), `topic`, `limit`, `order` (recent or relevance). Time phrases must follow `docs/time-rules.md` exactly.

Until your code lands, the backend runs on stubs: `StubParser`, stock all-MiniLM-L6-v2 (dim 384) and template answers.

## Bringing in your retriever

You are training the retriever in a separate folder. To plug it in:

1. Export it to `ml/models/retriever/<version>/` together with a `retriever.json`:
   ```json
   {"version": "minilm-ft-v1", "base_model": "sentence-transformers/all-MiniLM-L6-v2", "dim": 384, "max_seq_length": 256, "pooling": "mean", "normalize": true}
   ```
2. Implement `load_embedder(path)` in `breadcrumbs_ml/runtime/embedder.py` so it reads that file and returns an `Embedder`.
3. Set `EMBEDDER=ml/models/retriever/<version>` in `backend/.env` and restart the backend. It re-embeds everything because `version` changed.
4. Weights are gitignored for now (`ml/models/*`). Q&A item 7 decides how they're shared.

The backend embeds this text for each page: first `title | url-without-scheme` (for example `Best Budget Laptops 2026 | rtings.com/laptop`), then up to 1000-character chunks of page text with 200 characters of overlap. Search queries are embedded as the bare query text. If your model was trained on something else, settle it in Q&A item 3.

## Rules

- All root `CLAUDE.md` invariants apply. In particular: parsers never read the clock, nothing calls a hosted API, and tests never download models.
- Write the failing test first, in `ml/tests/`.
- **Never read `fixtures/questions/heldback/`.** Generated training data must not overlap the held-back questions; the overlap check fails the build.
- Select models on the dev set only. The held-back set runs once before the final demo, under the swap rule in `eval/pass_bars.toml`.
- Record each finished decision or experiment in `docs/decisions/NN-<topic>.md` using the template in `docs/decisions/README.md`.

## Q&A: decisions to make with Aditya

**Instructions for Claude:** When Aditya starts a session here and any item below still has an open decision, walk him through the first open item before other work, unless he asks to skip it. Ask one question at a time. Offer 2–4 options with trade-offs and a recommendation based on this repo and his MacBook. Then write his answer to `docs/decisions/NN-<topic>.md` and replace `(open)` below with a link to that file. If an answer changes a shared contract (Intent, chunking, `vec_chunks` dimension), say so and tell him to confirm it with Daniel.

1. **LLM runtime.** How does the local Qwen model run next to the backend?
   - **Ollama:** easiest setup and an OpenAI-compatible API, but a separate daemon.
   - **MLX-LM:** in-process, usually fastest on Apple Silicon, but Mac-only.
   - **llama.cpp server:** portable GGUF, with more knobs.
   - WebLLM in the browser was ruled out: the backend owns inference and replay.

   `LocalLLMClient` must support `live`, `record` and `replay` (responses keyed by request hash).
   Decision: (open)

2. **Qwen size and quantization.** Qwen3-1.7B 4-bit (about 1 GB) or a larger size? Thinking mode on or off? Both answers need to fit the budget in item 8. Structured JSON output at temperature 0 is required.
   Decision: (open)

3. **What the retriever embeds.** Options: `title | url` only, page-text chunks, or both. What max sequence length does your model expect? This must match `backend/app/index/chunking.py`. If it differs, agree on the change with Daniel and re-embed.
   Decision: (open)

4. **Embedding dimension.** It sets the `vec_chunks` column (`float[dim]`). 384 for MiniLM-family models. If you change base models, `version` and `dim` both change and the backend rebuilds the index.
   Decision: (open)

5. **Parsers.** Who writes the rule-based parser (the offline default and baseline)? For the trained parser, is it a DistilBERT token tagger (kind, time and topic spans) or a LoRA fine-tune of a small LLM? Choose by dev-set score and size once the rules baseline is recorded.
   Decision: (open)

6. **Answer writer.** What prompt and JSON shape does it use? The suggestion is `{"text": "...", "cited": ["<entry id>", ...]}` with one or two sentences. Only titles of the returned entries go into the prompt. What happens when the model returns invalid JSON? (The backend already falls back to template answers when the writer raises or cites badly.)
   Decision: (open)

7. **Where model weights live.** Options: gitignored plus a download script, Git LFS, or the Hugging Face Hub (private or public). It must work for Daniel's machine, CI (which never needs weights) and the demo.
   Decision: (open)

8. **Performance budget.** Qwen, the retriever and the backend all run at once on the MacBook. What memory ceiling is acceptable? What latency targets for first token and total answer? The trained parser must stay under 200 ms per question on a laptop CPU (swap rule). If it doesn't fit, what do we fall back to (a smaller Qwen, or `LLM_MODE=off`)?
   Decision: (open)

9. **Metrics in the harness.** How do retriever metrics (Recall@5 on dev questions) and the three-parser comparison plug into `eval/run.py`? Agree the output format with Daniel, since the harness is shared.
   Decision: (open)
