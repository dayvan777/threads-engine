import { CUSTOMS_CONFIG as CU } from "@/config/customs";
import { SHIPPING_METHODS, type ShippingMethodId } from "@/config/shipping";

export interface LandedCost {
  method: ShippingMethodId;
  methodName: string;
  itemEur: number;
  shippingEur: number;
  dutyEur: number;
  vatEur: number;
  totalEur: number;
  totalUah: number;
  overLimit: boolean;
  limitEur: number;
  note?: string;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Ціна «в руках» в Україні для товару з Німеччини. */
export function landedCost(
  itemEur: number,
  weightKg: number,
  method: ShippingMethodId,
  eurUah: number,
): LandedCost {
  const m = SHIPPING_METHODS.find((s) => s.id === method)!;
  const shippingEur = m.price(weightKg);
  const isLuggage = method === "luggage";
  const limit = isLuggage ? CU.luggageDutyFreeEur : CU.parcelDutyFreeEur;
  const overLimit = itemEur > limit || (isLuggage && weightKg > CU.luggageMaxKg);
  const excess = Math.max(0, itemEur - limit);
  const dutyEur = round2(excess * CU.dutyRate);
  const vatEur = round2((excess + dutyEur) * CU.vatRate);
  const totalEur = round2(itemEur + shippingEur + dutyEur + vatEur);
  return {
    method,
    methodName: m.name,
    itemEur,
    shippingEur,
    dutyEur,
    vatEur,
    totalEur,
    totalUah: Math.round(totalEur * eurUah),
    overLimit,
    limitEur: limit,
    note: m.note,
  };
}

export function bestLanded(itemEur: number, weightKg: number, eurUah: number) {
  return SHIPPING_METHODS.map((m) => landedCost(itemEur, weightKg, m.id, eurUah));
}
