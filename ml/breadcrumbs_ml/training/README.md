# Training

Training code for the retriever (fine-tuned sentence encoder) and the trained parser (token tagger or LoRA), plus the training-data generator. Every generated example must validate against the Intent schema in `backend/app/schemas/intent.py`, and none may overlap the held-back questions. Open decisions are in `ml/CLAUDE.md`. Install the training deps with `uv sync --all-packages --group train`.
