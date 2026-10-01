import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl">🍽️</p>
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="text-stone-600">Cette page n&apos;existe pas, ou elle appartient à un autre foyer.</p>
      <Link href="/recettes" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
        Retour aux recettes
      </Link>
    </main>
  );
}
