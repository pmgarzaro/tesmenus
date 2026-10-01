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

export async function shopAction(planId: number, a: ShopAction): Promise<boolean> {
  const { householdId: h } = await requireUser();
  const ok = (() => {
    switch (a.type) {
      case "check": return shop.setItemState(h, planId, a.ingredientId, { checked: a.checked });
      case "remove": return shop.setItemState(h, planId, a.ingredientId, { removed: a.removed });
      case "pantry": shop.setPantry(h, a.name, a.inPantry); return true;
      case "add": return shop.addManualItem(h, planId, a.text);
      case "checkManual": return shop.setManualChecked(h, planId, a.id, a.checked);
      case "deleteManual": return shop.deleteManualItem(h, planId, a.id);
      case "uncheckAll": return shop.uncheckAll(h, planId);
    }
  })();
  revalidatePath(`/courses/${planId}`);
  return ok;
}
