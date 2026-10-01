import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-bold">🍲 Tes menus</h1>
      <p className="mb-8 text-stone-500">Recettes, planning et courses du foyer.</p>
      <LoginForm next={next ?? "/"} />
    </main>
  );
}
