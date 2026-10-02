import { BackLink } from "@/components/BackLink";
import { notFound } from "next/navigation";
import { MagnetTitle } from "@/components/MagnetTitle";
import { ShoppingList } from "@/components/shopping/ShoppingList";
import { requireUser } from "@/lib/auth";
import { addDays, longDate } from "@/lib/planning/dates";
import { getShoppingList } from "@/lib/shopping/repo";

export const dynamic = "force-dynamic";

export default async function ShoppingPage({ params }: { params: Promise<{ planId: string }> }) {
  const { householdId } = await requireUser();
  const list = getShoppingList(householdId, Number((await params).planId));
  if (!list) notFound();
  const { plan } = list;
  const period = `du ${longDate(plan.startDate)} au ${longDate(addDays(plan.startDate, plan.days - 1))}`;
  return (
    <>
      <BackLink href={`/planning/${plan.id}`}>Planning {period}</BackLink>
      <div className="mb-4 mt-2">
        <MagnetTitle text="Courses" />
      </div>
      <ShoppingList planId={plan.id} title={`Courses ${period}`} items={list.items} manual={list.manual} />
    </>
  );
}
