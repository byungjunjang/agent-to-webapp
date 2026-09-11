"""고객 폴더 초기화 스크립트.

Usage:
    python scripts/init_customer.py <short_name> [pdf_file ...]

Examples:
    python scripts/init_customer.py NovaDrive rfq_email.pdf drawing.pdf
    python scripts/init_customer.py ShinhanTech
"""
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/init_customer.py <short_name> [pdf_file ...]")
        sys.exit(1)

    short_name = sys.argv[1]
    pdf_files = sys.argv[2:]

    input_dir = ROOT / "input" / short_name
    output_dir = ROOT / "output" / short_name

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    for pdf in pdf_files:
        src = Path(pdf)
        if not src.exists():
            print(f"WARNING: {pdf} not found, skipping.")
            continue
        dest = input_dir / src.name
        shutil.copy2(src, dest)
        print(f"  Copied: {src.name} -> input/{short_name}/")

    print(f"\nCustomer '{short_name}' initialized:")
    print(f"  input/{short_name}/")
    print(f"  output/{short_name}/")


if __name__ == "__main__":
    main()
