import { TabBar } from "@/components/TabBar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">{children}</main>
      <TabBar />
    </>
  );
}
