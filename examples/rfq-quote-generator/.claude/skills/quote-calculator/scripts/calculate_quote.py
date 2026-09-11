#!/usr/bin/env python3
"""견적 수치 계산 스크립트.

Usage:
    python calculate_quote.py <specs.json> <route_eval.json> <equipment.csv>

출력: stdout에 JSON — 루트별 사이클타임/원가/견적.
결과를 /output/quote_calculation.json 으로 리디렉션하여 저장.
"""
import csv
import json
import math
import sys


CYCLE_FORMULAS = {
    "vacuum_carburizing": lambda mid: round(2.5 + 4.0 * mid + 0.8, 1),
    "gas_carburizing": lambda mid: round(3.0 + 5.0 * mid + 0.8, 1),
    "gas_nitriding": lambda mid: round(10.0 + 18.0 * mid, 1),
}

INSPECTION_FEE = 0.35   # CNY per part
COMMERCIAL_MARGIN = 1.18


def load_equipment(csv_path: str) -> dict:
    equip = {}
    with open(csv_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            eid = row.get("equipment_id", "").strip()
            if not eid:
                continue
            equip[row["route_name"].strip()] = {
                "equipment_id": eid,
                "max_load_kg": float(row["max_load_kg"]),
                "hourly_rate_cny": float(row["hourly_rate_cny"]),
                "setup_fee_cny": float(row["setup_fee_cny"]),
                "temper_fee_cny": float(row["temper_fee_cny"]),
            }
    return equip


def calculate(specs: dict, route_eval: list, equipment: dict) -> list[dict]:
    cd_low = specs["case_depth_low"]
    cd_high = specs["case_depth_high"]
    case_depth_mid = (cd_low + cd_high) / 2
    lot_size = specs["lot_size"]
    part_weight = specs["part_weight_kg"]
    total_weight = lot_size * part_weight

    results = []
    for route in route_eval:
        status = route.get("status", "")
        if status not in ("valid", "recommended", "candidate_not_recommended"):
            continue

        rname = route["route_name"]
        eq = equipment.get(rname)
        if not eq:
            continue

        batches = math.ceil(total_weight / eq["max_load_kg"])
        formula = CYCLE_FORMULAS.get(rname)
        if not formula:
            continue

        cycle_time = formula(case_depth_mid)
        cost_per_batch = (
            eq["setup_fee_cny"]
            + eq["hourly_rate_cny"] * cycle_time
            + eq["temper_fee_cny"]
        )
        unit_cost = round((batches * cost_per_batch) / lot_size, 2)
        quote_per_pc = round((unit_cost + INSPECTION_FEE) * COMMERCIAL_MARGIN, 2)

        results.append({
            "route_name": rname,
            "equipment_id": eq["equipment_id"],
            "display_name": route.get("display_name", ""),
            "status": status,
            "case_depth_mid": round(case_depth_mid, 3),
            "total_weight_kg": round(total_weight, 2),
            "batches": batches,
            "cycle_time_hr": cycle_time,
            "cost_per_batch_cny": round(cost_per_batch, 2),
            "unit_cost_cny": unit_cost,
            "inspection_fee_cny": INSPECTION_FEE,
            "margin": COMMERCIAL_MARGIN,
            "quote_per_pc_cny": quote_per_pc,
            "total_quote_cny": round(quote_per_pc * lot_size, 2),
        })

    return results


def main():
    if len(sys.argv) != 4:
        print(
            "Usage: python calculate_quote.py <specs.json> <route_eval.json> <equip.csv>",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        specs = json.load(f)
    with open(sys.argv[2], encoding="utf-8") as f:
        route_eval = json.load(f)
    equipment = load_equipment(sys.argv[3])

    results = calculate(specs, route_eval, equipment)

    if not results:
        print("ERROR: No valid routes to calculate.", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
