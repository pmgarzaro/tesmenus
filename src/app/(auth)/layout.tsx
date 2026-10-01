export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-2 text-3xl font-bold">🍲 Tes menus</h1>
      {children}
    </main>
  );
}
