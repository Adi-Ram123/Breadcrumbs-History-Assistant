"""Evaluation harness: label stage (parser -> Intent), fetch stage (Intent -> IDs), end to end.

Usage:
  uv run python eval/run.py [--set dev|heldback] [--replay]

Scoring against eval/pass_bars.toml is not written yet; with no questions the
harness reports that and exits 0.
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = REPO_ROOT / "fixtures" / "questions"


def load_questions(set_name: str) -> list[dict]:
    questions = []
    for path in sorted((QUESTIONS / set_name).glob("*.jsonl")):
        questions += [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    return questions


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", choices=["dev", "heldback"], default="dev")
    ap.add_argument("--replay", action="store_true", help="use recorded LLM responses (graded runs)")
    args = ap.parse_args()

    questions = load_questions(args.set)
    if not questions:
        print(f"0 questions in {args.set}")
        return 0
    print(f"{len(questions)} questions in {args.set}")
    print("not implemented: scoring")
    return 2


if __name__ == "__main__":
    sys.exit(main())
