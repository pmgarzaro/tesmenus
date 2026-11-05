import { Trash2 } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { MEASURES, type MeasureSummary } from "@/lib/body/measures";
import { type BodyEntry, getBodyEntry, latestWeight, listBody } from "@/lib/body/repo";
import { getTargets } from "@/lib/journal/repo";
import { addDays, shortDate, today } from "@/lib/planning/dates";
import { removeMeasures } from "./actions";
import { GoalWeightForm, MeasureForm } from "./MeasureForm";
import { TrendChart } from "./TrendChart";

export const dynamic = "force-dynamic";

const RANGES = { "30": "30 j", "90": "3 mois", "365": "1 an" } as const;
type Range = keyof typeof RANGES;

const fmt = (v: number, d = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
const signed = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmt(Math.abs(v))} ${unit}`;

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="paper p-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-stone-600">{sub}</p>}
    </div>
  );
}

const changeText = (s: MeasureSummary | undefined, unit: string) =>
  s && s.first.date !== s.last.date ? `${signed(s.change, unit)} depuis le ${shortDate(s.first.date)}` : undefined;

function HistoryList({ entries }: { entries: BodyEntry[] }) {
  return (
    <ul className="divide-y divide-dashed divide-black/10">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-2 py-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium">{shortDate(e.date)}</p>
            <p className="text-stone-600">
              {MEASURES.filter((m) => e[m.key] !== null)
                .map((m) => `${m.short} ${fmt(e[m.key]!)} ${m.unit}`)
                .join(" · ")}
            </p>
            {e.notes && <p className="text-stone-500">{e.notes}</p>}
          </div>
          <form action={removeMeasures}>
            <input type="hidden" name="date" value={e.date} />
            <button className="p-1.5 text-stone-400 hover:text-red-600" aria-label={`Supprimer le relevé du ${shortDate(e.date)}`}>
              <Trash2 className="size-4" />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const owner = { userId: user.id, householdId: user.householdId };
  const sp = await searchParams;
  const range: Range = sp.range && sp.range in RANGES ? (sp.range as Range) : "90";
  const t = today();
  const { entries, weight, summary } = listBody(owner, addDays(t, -(Number(range) - 1)), t);
  const targets = getTargets(owner);
  const latest = latestWeight(owner);
  const todayEntry = getBodyEntry(owner, t);

  const history = [...entries].reverse();
  const avg = weight.at(-1)?.avg7;
  const rate = summary.weightKg?.ratePerWeek;
  const waist = summary.waistCm;
  const toGoal = avg !== undefined && targets.goalWeightKg !== null ? avg - targets.goalWeightKg : null;

  return (
    <>
      <BackLink href="/journal">Journal</BackLink>
      <PageHeader title="Suivi" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Tile
          label="Poids (moyenne 7 jours)"
          value={avg !== undefined ? `${fmt(avg)} kg` : latest ? `${fmt(latest.weightKg)} kg` : "—"}
          sub={
            rate !== null && rate !== undefined
              ? `${signed(rate, "kg")} / semaine`
              : avg === undefined && latest
                ? `dernier relevé le ${shortDate(latest.date)}`
                : undefined
          }
        />
        <Tile
          label="Tour de taille"
          value={waist ? `${fmt(waist.last.value)} cm` : "—"}
          sub={changeText(waist, "cm")}
        />
        {targets.goalWeightKg !== null && (
          <Tile
            label="Poids cible"
            value={`${fmt(targets.goalWeightKg)} kg`}
            sub={toGoal !== null ? (toGoal > 0 ? `encore ${fmt(toGoal)} kg` : "atteint") : undefined}
          />
        )}
        {summary.weightKg && summary.weightKg.first.date !== summary.weightKg.last.date && (
          <Tile label={`Sur ${RANGES[range]}`} value={signed(summary.weightKg.change, "kg")} sub="premier → dernier relevé" />
        )}
      </div>

      <section className="paper mb-4 p-4">
        <h2 className="mb-3 font-semibold">Nouveau relevé</h2>
        <MeasureForm date={t} current={todayEntry ?? {}} />
      </section>

      <nav className="mb-3 flex gap-1.5" aria-label="Période">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link
            key={r}
            href={`/suivi?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm ${r === range ? "bg-ink font-semibold text-white" : "bg-white"}`}
          >
            {RANGES[r]}
          </Link>
        ))}
      </nav>

      <section className="paper p-4">
        <h2 className="mb-2 font-semibold">Poids</h2>
        <TrendChart
          label="Pesée"
          trendLabel="Moyenne 7 jours"
          unit="kg"
          points={weight.map((w) => ({ date: w.date, value: w.weightKg, trend: w.avg7 }))}
        />
      </section>

      <section className="paper mt-4 p-4">
        <h2 className="mb-2 font-semibold">Tour de taille</h2>
        <TrendChart
          label="Tour de taille"
          unit="cm"
          points={entries.filter((e) => e.waistCm !== null).map((e) => ({ date: e.date, value: e.waistCm! }))}
        />
        <p className="mt-2 text-xs text-stone-500">
          Le meilleur signe de perte de gras : un tour de taille qui baisse, même quand la balance stagne.
        </p>
      </section>

      <section className="paper mt-4 p-4">
        <h2 className="mb-2 font-semibold">Historique</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-stone-500">Aucun relevé sur la période.</p>
        ) : (
          <>
            <HistoryList entries={history.slice(0, 10)} />
            {history.length > 10 && (
              <details>
                <summary className="cursor-pointer py-2 text-sm text-stone-600 underline">
                  Voir les {history.length - 10} relevés plus anciens
                </summary>
                <HistoryList entries={history.slice(10)} />
              </details>
            )}
          </>
        )}
      </section>

      <details className="paper mt-4 p-4">
        <summary className="cursor-pointer font-semibold">
          Poids cible : {targets.goalWeightKg !== null ? `${fmt(targets.goalWeightKg)} kg` : "non défini"}
        </summary>
        <GoalWeightForm goal={targets.goalWeightKg} />
      </details>
    </>
  );
}
