import { MagnetTitle } from "@/components/MagnetTitle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <MagnetTitle text="Tes menus" className="text-[3.2rem]" />
      <p className="mb-6 mt-3 font-display text-xl text-stone-600">la porte du frigo de la famille</p>
      <div className="paper p-5">{children}</div>
    </main>
  );
}
