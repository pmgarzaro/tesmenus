import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { listSessions } from "@/lib/batch/repo";
import { formatMinutes } from "@/lib/labels";
import { longDate } from "@/lib/planning/dates";

export const dynamic = "force-dynamic";

export default async function BatchPage() {
  const { householdId } = await requireUser();
  const sessions = listSessions(householdId);
  return (
    <>
      <PageHeader
        title="Batch"
        action={<Link href="/batch/nouveau" className="btn-primary px-4 py-2 text-sm font-semibold text-white">Nouvelle session</Link>}
      />
      {sessions.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-600">
          <p>Cuisine plusieurs repas de la semaine en une seule session.</p>
          <p className="text-sm text-stone-500">
            L&apos;appli regroupe les découpes, lance les cuissons longues en premier et te dit comment conserver chaque plat.
          </p>
          <Link href="/batch/nouveau" className="inline-block btn-primary px-5 py-3 font-semibold text-white">
            Préparer une session
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={`/batch/${s.id}`} className="block paper px-4 py-3">
                <span className="flex justify-between gap-2">
                  <span className="font-medium">Session du {longDate(s.sheet.sessionDate)}</span>
                  <span className="text-sm text-stone-500">{formatMinutes(s.sheet.totalMinutes)}</span>
                </span>
                <span className="block truncate text-sm text-stone-500">{s.sheet.dishes.map((d) => d.title).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
