"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteSessionAction } from "@/app/(app)/batch/actions";

export function SheetActions({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <Link href={`/cuisine/${id}`} className="btn-primary px-5 py-2.5 font-semibold text-white">
        👩‍🍳 Mode cuisine
      </Link>
      <button onClick={() => window.print()} className="rounded-xl border border-stone-300 bg-white px-4 py-2.5">
        🖨️ Imprimer
      </button>
      <button
        disabled={pending}
        onClick={() => confirm("Supprimer cette session ?") && start(() => deleteSessionAction(id))}
        className="text-sm text-red-600 underline"
      >
        Supprimer
      </button>
    </div>
  );
}
