"""Fail the build if anything under fixtures/ changed without HASHES being regenerated.

Fixtures, expected answers and question sets are human-written. Agents must not
edit them; a human who changes them on purpose runs --write in the same commit.

Usage:
  uv run python scripts/check_fixture_hashes.py           # check (exit 1 on mismatch)
  uv run python scripts/check_fixture_hashes.py --write   # regenerate (humans only)
"""

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "fixtures"
IGNORED = {"HASHES", ".DS_Store"}


def compute_hashes(root: Path) -> dict[str, str]:
    return {
        p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(root.rglob("*"))
        if p.is_file() and p.name not in IGNORED
    }


def diff_hashes(expected: dict[str, str], actual: dict[str, str]) -> list[str]:
    out = [f"changed: {k}" for k in expected if k in actual and expected[k] != actual[k]]
    out += [f"added: {k}" for k in actual if k not in expected]
    out += [f"removed: {k}" for k in expected if k not in actual]
    return out


def read_hashes(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    pairs = (line.split("  ", 1) for line in path.read_text().splitlines() if line.strip())
    return {rel: sha for sha, rel in pairs}


def write_hashes(path: Path, hashes: dict[str, str]) -> None:
    path.write_text("".join(f"{sha}  {rel}\n" for rel, sha in sorted(hashes.items())))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="regenerate fixtures/HASHES (humans only)")
    args = ap.parse_args()
    hashes_file = ROOT / "HASHES"
    actual = compute_hashes(ROOT)
    if args.write:
        write_hashes(hashes_file, actual)
        print(f"wrote {len(actual)} hashes to {hashes_file}")
        return 0
    problems = diff_hashes(read_hashes(hashes_file), actual)
    if problems:
        print("fixtures/ changed without a HASHES update:\n  " + "\n  ".join(problems))
        return 1
    print(f"fixtures OK ({len(actual)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
