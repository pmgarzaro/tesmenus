import Link from "next/link";
import { notFound } from "next/navigation";
import { SheetActions } from "@/components/batch/SheetActions";
import { requireUser } from "@/lib/auth";
import { clock } from "@/lib/batch/format";
import { getSession } from "@/lib/batch/repo";
import { AISLE_LABELS, formatMinutes } from "@/lib/labels";
import { longDate, shortDate } from "@/lib/planning/dates";
import { AISLE_ORDER, capitalize } from "@/lib/shopping/aggregate";

export const dynamic = "force-dynamic";

const STORAGE = {
  frigo: { label: "Frigo", tone: "bg-sky-100 text-sky-800" },
  mixte: { label: "Frigo + congélateur", tone: "bg-indigo-100 text-indigo-800" },
  congelateur: { label: "Congélateur", tone: "bg-indigo-100 text-indigo-800" },
  attention: { label: "Attention", tone: "bg-red-100 text-red-800" },
};

const box = "rounded-2xl bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none print:border print:border-stone-300";

export default async function BatchSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { householdId } = await requireUser();
  const session = getSession(householdId, Number((await params).id));
  if (!session) notFound();
  const s = session.sheet;
  const saved = s.separateMinutes - s.totalMinutes;
  const colors = ["bg-orange-500", "bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500", "bg-fuchsia-500"];
  const color = new Map(s.dishes.map((d, i) => [d.key, colors[i % colors.length]]));

  return (
    <article className="space-y-4">
      <Link href="/batch" className="text-sm text-stone-500 print:hidden">← Batch cooking</Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Session du {longDate(s.sessionDate)}</h1>
        <ul className="flex flex-wrap gap-1.5">
          {s.dishes.map((d) => (
            <li key={d.key} className="flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 text-sm">
              <span className={`size-2.5 rounded-full ${color.get(d.key)}`} />
              {d.title} · {d.servings} p.
            </li>
          ))}
        </ul>
        <SheetActions id={session.id} />
      </header>

      <section className={`${box} grid grid-cols-3 gap-2 text-center`}>
        <div>
          <p className="text-xs text-stone-500">En batch</p>
          <p className="text-xl font-bold">{formatMinutes(s.totalMinutes)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Séparément</p>
          <p className="text-xl font-bold text-stone-400">{formatMinutes(s.separateMinutes)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Gagné</p>
          <p className="text-xl font-bold text-green-700">{saved > 0 ? formatMinutes(saved) : "—"}</p>
        </div>
      </section>

      {s.warnings.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          {s.warnings.map((w) => <p key={w}>⚠️ {w}</p>)}
        </div>
      )}

      <section className={box}>
        <h2 className="mb-2 text-lg font-semibold">1. Mise en place</h2>
        {s.miseEnPlace.length === 0 ? (
          <p className="text-sm text-stone-500">Aucune découpe repérée dans les étapes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {s.miseEnPlace.map((m) => (
              <li key={`${m.verb}-${m.ingredient}`} className="py-2">
                <p>
                  <strong>{m.verb}</strong> {m.ingredient}
                  {m.total && <span className="text-stone-500"> — {m.total} en tout</span>}
                </p>
                {m.parts.length > 1 && (
                  <p className="text-sm text-stone-500">{m.parts.map((p) => `${p.amount} pour ${p.recipe}`).join(" · ")}</p>
                )}
                {m.parts.length === 1 && <p className="text-sm text-stone-500">pour {m.parts[0].recipe}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-stone-500">Astuce : découpe les légumes avant la viande et le poisson crus pour réutiliser la planche.</p>
      </section>

      <section className={box}>
        <h2 className="mb-2 text-lg font-semibold">2. Ingrédients de la session</h2>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {AISLE_ORDER.map((aisle) => {
            const items = s.ingredients.filter((i) => i.aisle === aisle);
            if (!items.length) return null;
            return (
              <div key={aisle} className="mb-2 print:break-inside-avoid">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{AISLE_LABELS[aisle]}</h3>
                <ul className="text-sm">
                  {items.map((i) => (
                    <li key={i.name} className="flex justify-between gap-2 py-0.5">
                      <span>{capitalize(i.name)}</span>
                      <span className="text-stone-600">{i.amount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className={box}>
        <h2 className="mb-1 text-lg font-semibold">3. Déroulé</h2>
        <p className="mb-3 text-xs text-stone-500">👩‍🍳 tu t&apos;en occupes · ⏳ ça cuit tout seul pendant que tu fais la suite</p>
        <ol className="space-y-2">
          {s.timeline.map((t) => (
            <li key={t.id} className="flex gap-3 print:break-inside-avoid">
              <span className="w-12 shrink-0 pt-0.5 font-mono text-sm text-stone-500">{clock(t.start)}</span>
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${color.get(t.recipeKey)}`} />
              <span className="min-w-0 flex-1">
                <span className="block">
                  {t.active ? "👩‍🍳" : "⏳"} {t.text}
                </span>
                <span className="block text-xs text-stone-500">
                  {[
                    t.recipeTitle,
                    t.merged ? "même four que l'autre plat" : `${t.end - t.start} min${t.estimated ? " (estimé)" : ""}`,
                    t.equipment && (t.temperature ? `${t.equipment} ${t.temperature} °C` : t.equipment),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm font-medium">Fin prévue à {clock(s.totalMinutes)} du début.</p>
      </section>

      <section className={box}>
        <h2 className="mb-2 text-lg font-semibold">4. Conservation et ordre de consommation</h2>
        <ol className="space-y-3">
          {s.conservation.map((c, i) => (
            <li key={c.key} className="space-y-1 print:break-inside-avoid">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {i + 1}. {c.title}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STORAGE[c.storage].tone}`}>{STORAGE[c.storage].label}</span>
                {c.firstEat && <span className="text-xs text-stone-500">dès {shortDate(c.firstEat)}</span>}
              </p>
              <ul className="list-disc pl-5 text-sm text-stone-700">
                {c.advice.map((a) => <li key={a}>{a}</li>)}
                <li>Réchauffage : {c.reheating}</li>
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-stone-500">
          Durées volontairement prudentes (poisson 2 jours, viande 3 jours, autres plats 4 jours au frigo à 4 °C au plus). Ne réchauffer
          qu&apos;une fois, jusqu&apos;à ce que ce soit bien chaud à cœur.
        </p>
      </section>
    </article>
  );
}
