// 단계 4: 견적 전제 확인 (사람). 웹 앱은 UI 값을 받고, 재검증 스크립트는 run-3 과 같은 값으로 자동 승인한다.
import type { ExtractedSpecs, Mode, QuoteBasisField } from '../lib/types.ts';

export interface ConfirmInput {
  job_id: string;
  mode: Mode;
  provisional_fields: QuoteBasisField[];
  specs: ExtractedSpecs;
}

export interface Decision {
  status: 'approved' | 'skipped';
  approved_by: string | null;
  approved_at: string | null;
  values: { material: string | null; lot_size: number | null; delivery_days: number | null };
  extra_lot_sizes: number[];
  note: string | null;
}

export interface ConfirmOutput {
  specs: ExtractedSpecs;
  decision: Decision;
}

/** 사람이(또는 재검증에서는 스크립트가) 넣는 값. */
export interface HumanValues {
  approved_by: string;
  approved_at?: string;
  material?: string | null;
  lot_size?: number | null;
  delivery_days?: number | null;
  extra_lot_sizes?: number[];
  note?: string | null;
}

/** 재검증용 자동 승인 값. workflow.md 단계 4: lot_size 1000, delivery_days 12, material 은 specs 값. */
export const AUTO_VALUES = { lot_size: 1000, delivery_days: 12 } as const;

export function autoHumanValues(specs: ExtractedSpecs, provisional_fields: QuoteBasisField[]): HumanValues {
  return {
    approved_by: 'verify script (auto)',
    material: provisional_fields.includes('material') ? specs.material : undefined,
    lot_size: provisional_fields.includes('lot_size') ? AUTO_VALUES.lot_size : undefined,
    delivery_days: provisional_fields.includes('delivery_days') ? AUTO_VALUES.delivery_days : undefined,
    extra_lot_sizes: [],
    note: `재검증 자동 승인. run-3 과 같은 값(lot_size ${AUTO_VALUES.lot_size}, delivery_days ${AUTO_VALUES.delivery_days}, material 은 도면 값)`,
  };
}

export function confirmQuoteBasis(input: ConfirmInput, human: HumanValues): ConfirmOutput {
  const specs: ExtractedSpecs = structuredClone(input.specs);
  const empty: Decision['values'] = { material: null, lot_size: null, delivery_days: null };

  // mode 가 firm 이면 status skipped 로 바로 지나간다
  if (input.mode === 'firm') {
    return {
      specs,
      decision: { status: 'skipped', approved_by: null, approved_at: null, values: empty, extra_lot_sizes: [], note: null },
    };
  }

  const values: Decision['values'] = { ...empty };
  for (const field of input.provisional_fields) {
    const v = human[field];
    if (v === undefined || v === null) continue; // 값이 안 들어온 필드는 그대로 둔다(웹 앱은 여기서 멈춘다)
    (values as Record<string, unknown>)[field] = v;
    (specs as unknown as Record<string, unknown>)[field] = v;
    specs.sources[field] = 'sales'; // unconfirmed_fields 는 그대로 둔다(가정 표시 근거)
  }
  return {
    specs,
    decision: {
      status: 'approved',
      approved_by: human.approved_by,
      approved_at: human.approved_at ?? new Date().toISOString(),
      values,
      extra_lot_sizes: [...new Set((human.extra_lot_sizes ?? []).filter((n) => Number.isInteger(n) && n > 0))],
      note: human.note ?? null,
    },
  };
}
