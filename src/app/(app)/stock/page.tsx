import { Check, ChefHat, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { STOCK_LOCATIONS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { shortDate, today as todayFn } from "@/lib/planning/dates";
import { type StockItem, listStock } from "@/lib/stock/repo";
import { LOCATION_LABELS, SOON_DAYS, type StockLocation, type StockStatus, expiryText } from "@/lib/stock/stock";
import { removeItems } from "./actions";
import { AddPanel, AddStockForm, EditStockForm } from "./StockForms";

export const dynamic = "force-dynamic";

const GROUPS: { status: StockStatus; title: string; magnet: string; tone: string; hint?: string }[] = [
  {
    status: "perime",
    title: "Date dépassée",
    magnet: "magnet-red",
    tone: "text-red-700",
    hint: "Au frigo (« à consommer jusqu'au ») : à jeter. Au placard ou au congélateur, c'est souvent une date de durabilité minimale (« de préférence avant ») : en général encore bon, vérifie l'aspect et l'odeur.",
  },
  { status: "bientot", title: "À manger vite", magnet: "magnet-yellow", tone: "text-amber-800" },
  { status: "ok", title: "Plus tard", magnet: "magnet-green", tone: "text-stone-600" },
  { status: "sans-date", title: "Sans date", magnet: "magnet-blue", tone: "text-stone-500" },
];

function ItemRow({ item, today, showLocation }: { item: StockItem; today: string; showLocation: boolean }) {
  const expired = item.status === "perime";
  return (
    <li className="flex items-start gap-2 py-2">
      <details className="min-w-0 flex-1">
        <summary className="cursor-pointer list-none">
          <span className="font-medium">{item.name}</span>
          {item.quantity && <span className="text-stone-500"> · {item.quantity}</span>}
          <span className="block text-xs text-stone-500">
            {showLocation && `${LOCATION_LABELS[item.location]} · `}
            {item.expiresOn ? `${expiryText(item.daysLeft)} (${shortDate(item.expiresOn)})` : "sans date"}
            {item.note && ` · ${item.note}`}
          </span>
        </summary>
        <EditStockForm today={today} item={item} />
      </details>
      <form action={removeItems}>
        <input type="hidden" name="id" value={item.id} />
        <button
          className={`flex size-9 items-center justify-center rounded-full ${expired ? "text-red-600 hover:bg-red-50" : "text-stone-400 hover:bg-stone-100 hover:text-green-700"}`}
          aria-label={expired ? `Jeter : ${item.name}` : `Fini : ${item.name}`}
          title={expired ? "Jeté" : "Fini (mangé ou jeté)"}
        >
          {expired ? <Trash2 className="size-5" /> : <Check className="size-5" />}
        </button>
      </form>
    </li>
  );
}

export default async function StockPage({ searchParams }: { searchParams: Promise<{ lieu?: string }> }) {
  const { householdId } = await requireUser();
  const sp = await searchParams;
  const place = STOCK_LOCATIONS.includes(sp.lieu as StockLocation) ? (sp.lieu as StockLocation) : null;
  const t = todayFn();
  const all = listStock(householdId, t);
  const items = place ? all.filter((i) => i.location === place) : all;
  const count = (s: StockStatus) => all.filter((i) => i.status === s).length;
  const expired = count("perime");
  const soon = count("bientot");

  return (
    <>
      <PageHeader
        title="Stock"
        action={
          all.length > 0 && (
            <Link
              href="/recettes/vide-frigo?stock=1"
              className="flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 font-display font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
            >
              <ChefHat className="size-4" aria-hidden />
              Que cuisiner ?
            </Link>
          )
        }
      />

      {all.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="paper p-3">
            <p className="text-xs text-stone-500">Date dépassée</p>
            <p className={`text-xl font-bold ${expired ? "text-red-700" : ""}`}>{expired}</p>
          </div>
          <div className="paper p-3">
            <p className="text-xs text-stone-500">À manger d&apos;ici {SOON_DAYS} jours</p>
            <p className={`text-xl font-bold ${soon ? "text-amber-800" : ""}`}>{soon}</p>
          </div>
        </div>
      )}

      <AddPanel initialOpen={all.length === 0}>
        <AddStockForm today={t} location={place ?? "frigo"} />
      </AddPanel>

      {all.length > 0 && (
        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Emplacement">
          {[null, ...STOCK_LOCATIONS].map((l) => {
            const n = l ? all.filter((i) => i.location === l).length : all.length;
            return (
              <Link
                key={l ?? "tout"}
                href={l ? `/stock?lieu=${l}` : "/stock"}
                aria-current={l === place ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm ${l === place ? "bg-ink font-semibold text-white" : "bg-white"}`}
              >
                {l ? LOCATION_LABELS[l] : "Tout"} ({n})
              </Link>
            );
          })}
        </nav>
      )}

      {all.length === 0 ? (
        <p className="p-4 text-center text-sm text-stone-500">
          Rien dans le stock pour l&apos;instant. Note ce qu&apos;il y a dans le frigo, le congélateur et les placards, avec la date
          inscrite sur l&apos;emballage : l&apos;appli te dira quoi manger en premier.
        </p>
      ) : items.length === 0 ? (
        <p className="p-4 text-center text-sm text-stone-500">Rien ici.</p>
      ) : (
        GROUPS.map((g) => {
          const list = items.filter((i) => i.status === g.status);
          if (list.length === 0) return null;
          return (
            <section key={g.status} className="paper mb-4 p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className={`flex items-center gap-2 ${g.tone}`}>
                  <span className={`magnet ${g.magnet}`} aria-hidden />
                  {g.title} ({list.length})
                </h2>
                {g.status === "perime" && list.length > 1 && (
                  <form action={removeItems}>
                    {list.map((i) => (
                      <input key={i.id} type="hidden" name="id" value={i.id} />
                    ))}
                    <button className="rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700">Tout jeter</button>
                  </form>
                )}
              </div>
              {g.hint && <p className="mb-1 text-xs text-stone-500">{g.hint}</p>}
              <ul className="divide-y divide-dashed divide-black/10">
                {list.map((i) => (
                  <ItemRow key={i.id} item={i} today={t} showLocation={!place} />
                ))}
              </ul>
            </section>
          );
        })
      )}
      {all.length > 0 && (
        <p className="text-center text-xs text-stone-500">Touche un article pour le modifier ; ✓ quand il est fini, la poubelle pour le jeter.</p>
      )}
    </>
  );
}
