#!/usr/bin/env python3
"""장비 CSV 파싱 및 ECD 범위 매칭 보조 스크립트.

Usage:
    python evaluate_routes.py <equipment_csv> <extracted_specs_json>

출력: stdout에 JSON — 각 장비별 range_match 결과.
"""
import csv
import json
import sys


VALID_MATERIALS = {"SCM420H", "20CrMnTi", "20MnCr5"}


def load_equipment(csv_path: str) -> list[dict]:
    rows = []
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row.get("equipment_id"):
                continue
            rows.append({
                "equipment_id": row["equipment_id"].strip(),
                "route_name": row["route_name"].strip(),
                "display_name": row["display_name"].strip(),
                "max_load_kg": float(row["max_load_kg"]),
                "depth_min_mm": float(row["depth_min_mm"]),
                "depth_max_mm": float(row["depth_max_mm"]),
                "distortion_risk": row["distortion_risk"].strip(),
                "hourly_rate_cny": float(row["hourly_rate_cny"]),
                "setup_fee_cny": float(row["setup_fee_cny"]),
                "temper_fee_cny": float(row["temper_fee_cny"]),
                "preferred_when": row.get("preferred_when", "").strip(),
                "avoid_when": row.get("avoid_when", "").strip(),
            })
    return rows


def check_range(specs: dict, equip: dict) -> dict:
    """Check if specs fall within equipment range. Returns match info."""
    cd_low = specs.get("case_depth_low", 0)
    cd_high = specs.get("case_depth_high", 0)
    material = specs.get("material", "")

    result = {
        "equipment_id": equip["equipment_id"],
        "route_name": equip["route_name"],
        "display_name": equip["display_name"],
        "distortion_risk": equip["distortion_risk"],
        "material_valid": material in VALID_MATERIALS,
        "ecd_in_range": (
            cd_low >= equip["depth_min_mm"] and cd_high <= equip["depth_max_mm"]
        ),
        "ecd_range_equipment": f"{equip['depth_min_mm']}-{equip['depth_max_mm']} mm",
        "ecd_range_requested": f"{cd_low}-{cd_high} mm",
        "max_load_kg": equip["max_load_kg"],
    }
    return result


def main():
    if len(sys.argv) != 3:
        print(
            "Usage: python evaluate_routes.py <equipment.csv> <specs.json>",
            file=sys.stderr,
        )
        sys.exit(1)

    equipment = load_equipment(sys.argv[1])
    with open(sys.argv[2], encoding="utf-8") as f:
        specs = json.load(f)

    results = [check_range(specs, eq) for eq in equipment]
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
