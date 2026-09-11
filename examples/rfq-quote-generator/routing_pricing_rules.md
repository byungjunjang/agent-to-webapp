# Routing and pricing rules for the workshop (fictional)

This file is the only rulebook for the exercise.  
Use these rules even if you personally know a different real-world practice.

## 1) Goal
Generate a fast first-pass answer for an RFQ:
- missing specification checklist
- candidate process routes
- rough cycle time
- rough unit quote
- short reply email draft in Korean / Chinese / English

## 2) Valid route logic

### A. Vacuum carburizing
Use as a **valid route** when all of the following are true:
- material is one of: `SCM420H`, `20CrMnTi`, `20MnCr5`
- effective case depth upper limit is between **0.35 mm and 0.80 mm**
- requested surface hardness is around **HRC 58-62**

Use as the **recommended route** when one or more of the following are true:
- total runout / distortion limit is **<= 0.03 mm**
- customer says **no grinding correction after heat treatment**
- automotive quality risk is more important than lowest unit cost

### B. Gas carburizing
Use as a **valid route** when all of the following are true:
- material is one of: `SCM420H`, `20CrMnTi`, `20MnCr5`
- effective case depth upper limit is between **0.40 mm and 1.20 mm**
- customer accepts **medium distortion risk**

Use as a **candidate but not recommended** route when:
- the drawing asks for **tight runout <= 0.03 mm**
- and the RFQ says **no grinding correction after heat treatment**

### C. Gas nitriding
Use as a **valid route** only when all of the following are true:
- effective case depth upper limit is **<= 0.40 mm**
- distortion priority is high
- the requested property is compatible with nitriding
- there is no clear reason to prefer carburizing steel behavior

If the RFQ asks for case depth upper limit **> 0.40 mm**, mark nitriding as **not suitable**.

## 3) Missing specification checklist
If the RFQ does not clearly define the item, add it to `missing_specs`.

Typical missing items:
1. masking / no-heat-treat area
2. acceptance sampling plan
3. hardness test location and method
4. whether straightening is allowed after heat treatment
5. packing / rust-prevention requirement
6. PPAP, FAI, or trial approval requirement

## 4) Calculation rules

### Required variables
- `case_depth_mid = (case_depth_low + case_depth_high) / 2`
- `total_weight_kg = lot_size * part_weight_kg`
- `batches = ceil(total_weight_kg / max_load_kg)`

### Cycle time formulas
- vacuum carburizing cycle time (hr): `2.5 + 4.0 * case_depth_mid + 0.8`
- gas carburizing cycle time (hr): `3.0 + 5.0 * case_depth_mid + 0.8`
- gas nitriding cycle time (hr): `10.0 + 18.0 * case_depth_mid`

### Cost formulas
- `process_cost_per_batch = setup_fee + hourly_rate * cycle_time + temper_fee`
- `unit_process_cost = (batches * process_cost_per_batch) / lot_size`
- inspection fee per part = **0.35 CNY**
- commercial margin = **1.18**
- `rough_quote_cny_per_pc = (unit_process_cost + 0.35) * 1.18`

Round:
- cycle time to **1 decimal**
- unit cost to **2 decimals**
- quote to **2 decimals**

## 5) Lead-time guidance
Use these simple qualitative lead-time judgments:
- Vacuum carburizing: `10-12 days feasible`
- Gas carburizing: `8-10 days feasible`
- Gas nitriding: `lead-time risk for <= 12 day request`

## 6) Output style
For each candidate route, show:
- route name
- why valid / invalid
- distortion risk
- cycle time
- batch count
- rough quote
- one-line recommendation comment

Recommended route should include:
- technical reason
- commercial trade-off
- assumptions still needing customer confirmation

## 7) Important note
All numbers are fictional and simplified for training only.
