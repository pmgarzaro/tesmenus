import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToPlanButton } from "@/components/planning/AddToPlanButton";
import { DeleteRecipeButton } from "@/components/recipes/DeleteRecipeButton";
import { ScaledIngredients } from "@/components/recipes/ScaledIngredients";
import { requireUser } from "@/lib/auth";
import { MEAL_TYPE_LABELS, STEP_TYPE_LABELS, formatMinutes } from "@/lib/labels";
import { openPlans } from "@/lib/planning/repo";
import { getRecipe } from "@/lib/recipes/repo";
import { totalMinutes } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { householdId } = await requireUser();
  const r = getRecipe(householdId, Number((await params).id));
  if (!r) notFound();
  const total = totalMinutes(r);

  return (
    <article className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/recettes" className="text-sm text-stone-500">← Recettes</Link>
        <Link href={`/recettes/${r.id}/modifier`} className="rounded-xl border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium">
          Modifier
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold leading-tight">{r.title}</h1>
        {r.description && <p className="text-stone-600">{r.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs">{MEAL_TYPE_LABELS[r.mealType]}</span>
          {r.tags.map((t) => (
            <Link key={t} href={`/recettes?tag=${encodeURIComponent(t)}`} className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs text-brand-700">
              {t}
            </Link>
          ))}
        </div>
      </header>

      {(r.mealType === "plat" || r.mealType === "autre") && <AddToPlanButton recipeId={r.id} plans={openPlans(householdId)} />}

      <dl className="grid grid-cols-3 gap-2 paper p-3 text-center">
        {[
          ["Préparation", formatMinutes(r.prepMinutes) || "—"],
          ["Cuisson", formatMinutes(r.cookMinutes) || "—"],
          ["Total", formatMinutes(total) || "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-stone-600">
        {r.fridgeDays ? `🧊 Se garde ${r.fridgeDays} jour${r.fridgeDays > 1 ? "s" : ""} au frigo` : "🧊 Conservation non précisée"}
        {" · "}
        {r.freezable ? "❄️ Congelable" : "Ne se congèle pas"}
      </p>

      <ScaledIngredients
        servings={r.servings}
        ingredients={r.ingredients.map((i) => ({ quantity: i.quantity, unit: i.unit, label: i.label, optional: i.optional }))}
      />

      <section className="paper p-4">
        <h2 className="mb-3 font-semibold">Étapes</h2>
        {r.steps.length === 0 ? (
          <p className="text-sm text-stone-500">Aucune étape.</p>
        ) : (
          <ol className="space-y-4">
            {r.steps.map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p>{s.text}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[
                      STEP_TYPE_LABELS[s.type],
                      formatMinutes(s.durationMinutes),
                      s.equipment && (s.temperature ? `${s.equipment} ${s.temperature} °C` : s.equipment),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {r.imagePaths.length > 0 && (
        <section className="paper p-4">
          <h2 className="mb-3 font-semibold">Recette originale</h2>
          <div className="flex gap-2 overflow-x-auto">
            {r.imagePaths.map((p, i) => (
              <a key={p} href={`/api/uploads/${p}`} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${p}`} alt={`Page ${i + 1}`} loading="lazy" className="h-40 rounded-lg border border-stone-200 object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}

      {(r.notes || r.sourceUrl) && (
        <section className="space-y-2 paper p-4 text-sm">
          {r.notes && <p className="whitespace-pre-line">{r.notes}</p>}
          {r.sourceUrl && (
            <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-brand-700 underline">
              Source : {r.sourceUrl}
            </a>
          )}
        </section>
      )}

      <div className="pt-2 text-center">
        <DeleteRecipeButton id={r.id} title={r.title} />
      </div>
    </article>
  );
}
