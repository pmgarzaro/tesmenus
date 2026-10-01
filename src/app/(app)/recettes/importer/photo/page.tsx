import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PhotoImport } from "@/components/recipes/PhotoImport";
import { requireUser } from "@/lib/auth";
import { listRecipeSummaries } from "@/lib/recipes/repo";
import { tagCounts } from "@/lib/recipes/search";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { householdId } = await requireUser();
  const allTags = tagCounts(listRecipeSummaries(householdId)).map((t) => t.tag);
  return (
    <>
      <Link href="/recettes" className="text-sm text-stone-500">← Recettes</Link>
      <PageHeader title="Importer une photo" />
      <PhotoImport allTags={allTags} />
    </>
  );
}
