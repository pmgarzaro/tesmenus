import { BackLink } from "@/components/BackLink";
import { notFound } from "next/navigation";
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
      <h1 className="mb-3 mt-1 font-hand text-[2.4rem] font-bold leading-none">Liste de courses</h1>
      <ShoppingList planId={plan.id} title={`Courses ${period}`} items={list.items} manual={list.manual} />
    </>
  );
}
