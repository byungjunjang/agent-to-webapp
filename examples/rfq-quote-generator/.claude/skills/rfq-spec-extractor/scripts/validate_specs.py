#!/usr/bin/env python3
"""extracted_specs.json 스키마 검증 스크립트.

Usage:
    python validate_specs.py <path_to_extracted_specs.json>

Exit codes:
    0 — valid
    1 — validation errors found (prints details to stderr)
"""
import json
import sys

REQUIRED_FIELDS = {
    "part_name": str,
    "drawing_no": str,
    "material": str,
    "lot_size": (int, float),
    "part_weight_kg": (int, float),
    "case_depth_low": (int, float),
    "case_depth_high": (int, float),
    "surface_hardness_low": (int, float),
    "surface_hardness_high": (int, float),
    "core_hardness_low": (int, float),
    "core_hardness_high": (int, float),
    "distortion_limit_mm": (int, float),
    "grinding_after_ht": bool,
    "delivery_days": (int, float),
    "customer_name": str,
    "customer_company": str,
    "rfq_number": str,
}

POSITIVE_NUMERIC = [
    "lot_size", "part_weight_kg",
    "case_depth_low", "case_depth_high",
    "surface_hardness_low", "surface_hardness_high",
    "core_hardness_low", "core_hardness_high",
    "delivery_days",
]


def validate(data: dict) -> list[str]:
    errors = []

    for field, expected in REQUIRED_FIELDS.items():
        if field not in data:
            errors.append(f"missing required field: {field}")
            continue
        if not isinstance(data[field], expected):
            errors.append(
                f"field '{field}' expected {expected}, got {type(data[field]).__name__}"
            )

    for field in POSITIVE_NUMERIC:
        val = data.get(field)
        if isinstance(val, (int, float)) and val <= 0:
            errors.append(f"field '{field}' must be positive, got {val}")

    cdl = data.get("case_depth_low", 0)
    cdh = data.get("case_depth_high", 0)
    if isinstance(cdl, (int, float)) and isinstance(cdh, (int, float)):
        if cdl >= cdh:
            errors.append(
                f"case_depth_low ({cdl}) must be less than case_depth_high ({cdh})"
            )

    return errors


def main():
    if len(sys.argv) != 2:
        print("Usage: python validate_specs.py <json_path>", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    errors = validate(data)
    if errors:
        print(f"Validation FAILED - {len(errors)} error(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Validation PASSED - {len(REQUIRED_FIELDS)} required fields OK.")
    sys.exit(0)


if __name__ == "__main__":
    main()
