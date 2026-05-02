#!/usr/bin/env python3
"""Count lines for each Python file in a directory (non-recursive)."""

import argparse
from pathlib import Path


def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return sum(1 for _ in f)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Count lines for each Python file in a directory (non-recursive)."
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Target directory (defaults to current directory).",
    )
    args = parser.parse_args()

    here = Path(args.directory)
    if not here.exists():
        print(f"Directory does not exist: {here}")
        return
    if not here.is_dir():
        print(f"Not a directory: {here}")
        return

    py_files = sorted(p for p in here.iterdir() if p.is_file() and p.suffix == ".py")

    if not py_files:
        print(f"No .py files found in directory: {here}")
        return

    counts = [(p, count_lines(p)) for p in py_files]
    counts.sort(key=lambda item: item[1], reverse=True)

    width = max(len(p.name) for p, _ in counts)
    total = 0

    for p, n in counts:
        total += n
        print(f"{p.name.ljust(width)}  {n}")

    print("-" * (width + 8))
    print(f"{'TOTAL'.ljust(width)}  {total}")


if __name__ == "__main__":
    main()
