import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <SearchX className="size-14 text-brand-600" strokeWidth={1.5} aria-hidden />
      <h1 className="font-hand text-[2.4rem] font-bold leading-none">Page introuvable</h1>
      <p className="text-stone-600">Cette page n&apos;existe pas, ou elle appartient à un autre foyer.</p>
      <Link href="/recettes" className="btn-primary px-5 py-3 font-semibold text-white">
        Retour aux recettes
      </Link>
    </main>
  );
}
