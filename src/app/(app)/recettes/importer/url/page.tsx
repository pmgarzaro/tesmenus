import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ImportFlow } from "@/components/recipes/ImportFlow";
import { requireUser } from "@/lib/auth";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { tagCounts } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ url?: string; text?: string }> }) {
  const { householdId } = await requireUser();
  const allTags = tagCounts(listRecipeSummaries(householdId)).map((t) => t.tag);
  const params = await searchParams;
  // Shared from another app: the link comes in `url`, or inside `text` on Android.
  const sharedUrl = params.url || params.text?.match(/https?:\/\/\S+/)?.[0];
  return (
    <>
      <Link href="/recettes" className="text-sm text-stone-500">← Recettes</Link>
      <PageHeader title="Importer depuis un lien" />
      <ImportFlow mode="url" allTags={allTags} initialUrl={sharedUrl} />
    </>
  );
}
