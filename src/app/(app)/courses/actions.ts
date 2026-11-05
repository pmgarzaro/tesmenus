"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import * as shop from "@/lib/shopping/repo";

export type ShopAction =
  | { type: "check"; ingredientId: number; checked: boolean }
  | { type: "remove"; ingredientId: number; removed: boolean }
  | { type: "pantry"; name: string; inPantry: boolean }
  | { type: "add"; text: string }
  | { type: "checkManual"; id: number; checked: boolean }
  | { type: "deleteManual"; id: number }
  | { type: "uncheckAll" };

/** `period`: "" for the whole plan, else the key of the shopping period. */
export async function shopAction(planId: number, period: string, a: ShopAction): Promise<boolean> {
  const { householdId: h } = await requireUser();
  if (period !== "" && !/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(period)) return false;
  const ok = (() => {
    switch (a.type) {
      case "check": return shop.setItemState(h, planId, period, a.ingredientId, { checked: a.checked });
      case "remove": return shop.setItemState(h, planId, period, a.ingredientId, { removed: a.removed });
      case "pantry": shop.setPantry(h, a.name, a.inPantry); return true;
      case "add": return shop.addManualItem(h, planId, period, a.text);
      case "checkManual": return shop.setManualChecked(h, planId, a.id, a.checked);
      case "deleteManual": return shop.deleteManualItem(h, planId, a.id);
      case "uncheckAll": return shop.uncheckAll(h, planId, period);
    }
  })();
  revalidatePath(`/courses/${planId}`);
  return ok;
}
