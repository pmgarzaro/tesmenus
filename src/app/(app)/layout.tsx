import { TabBar } from "@/components/TabBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">{children}</main>
      <TabBar />
    </>
  );
}
