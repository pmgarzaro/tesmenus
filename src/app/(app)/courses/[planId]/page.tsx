import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MagnetTitle } from "@/components/MagnetTitle";
import { ShoppingList } from "@/components/shopping/ShoppingList";
import { requireUser } from "@/lib/auth";
import { addDays, dateRange, longDate, shortDate, today } from "@/lib/planning/dates";
import { getShoppingList } from "@/lib/shopping/repo";

export const dynamic = "force-dynamic";

export default async function ShoppingPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { householdId } = await requireUser();
  const { from, to } = await searchParams;
  const list = getShoppingList(householdId, Number((await params).planId), from, to);
  if (!list) notFound();
  const { plan, period } = list;
  const end = addDays(plan.startDate, plan.days - 1);
  const days = dateRange(plan.startDate, plan.days);
  const whole = period.key === "";
  const t = today();
  const planPeriod = `du ${longDate(plan.startDate)} au ${longDate(end)}`;
  const label = period.from === period.to ? `du ${longDate(period.from)}` : `du ${longDate(period.from)} au ${longDate(period.to)}`;
  const href = (f: string, e: string) => `/courses/${plan.id}?from=${f}&to=${e}`;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? "bg-ink font-semibold text-white" : "bg-white shadow-sm"}`;
  const select = "w-full rounded-lg border border-stone-300 bg-white px-2 py-2";

  return (
    <>
      <BackLink href={`/planning/${plan.id}`}>Planning {planPeriod}</BackLink>
      <div className="mb-3 mt-2">
        <MagnetTitle text="Courses" />
      </div>

      <section className="paper mb-4 space-y-3 p-4" aria-label="Période des courses">
        <p className="text-sm text-stone-600">
          Repas cuisinés <strong>{label}</strong>
          {!whole && " seulement"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/courses/${plan.id}`} className={chip(whole)}>
            Tout le planning
          </Link>
          {t > plan.startDate && t <= end && (
            <Link href={href(t, end)} className={chip(period.from === t && period.to === end && !whole)}>
              À partir d&apos;aujourd&apos;hui
            </Link>
          )}
        </div>
        <form key={period.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="text-xs text-stone-500">
            Du
            <select name="from" defaultValue={period.from} className={select}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-500">
            Au
            <select name="to" defaultValue={period.to} className={select}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-xl border border-stone-300 bg-white px-4 py-2 font-semibold">OK</button>
        </form>
        {!whole && (
          <p className="text-xs text-stone-500">
            Les restes comptent le jour où le plat est cuisiné. Cette liste a ses propres cases cochées.
          </p>
        )}
      </section>

      <ShoppingList
        key={period.key}
        planId={plan.id}
        period={period.key}
        title={`Courses ${label}`}
        items={list.items}
        manual={list.manual}
      />
    </>
  );
}
