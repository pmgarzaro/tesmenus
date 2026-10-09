import { notFound } from "next/navigation";
import { CookMode } from "@/components/batch/CookMode";
import { requireUser } from "@/lib/auth";
import { getSession } from "@/lib/batch/repo";

export const dynamic = "force-dynamic";

/** Full screen, without the tab bar. */
export default async function CookPage({ params }: { params: Promise<{ id: string }> }) {
  const { householdId } = await requireUser();
  const session = getSession(householdId, Number((await params).id));
  if (!session) notFound();
  return <CookMode storeKey={`cook-${session.id}`} exitHref={`/batch/${session.id}`} sheet={session.sheet} />;
}
