export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      {/* Chrome handle of the fridge door. */}
      <span
        aria-hidden="true"
        className="absolute right-3 top-1/3 h-40 w-2.5 rounded-full bg-[linear-gradient(90deg,#c3cbce,#ffffff_45%,#9fa9ad)] shadow-[0_2px_5px_rgb(0_0_0/0.2)]"
      />
      <h1 className="font-hand text-6xl font-bold leading-none text-brand-600">Tes menus</h1>
      <p className="mb-6 mt-1 font-hand text-2xl text-stone-500">la porte du frigo de la famille</p>
      <div className="postit note-yellow magnet magnet-red tilt-l p-5 pt-6">{children}</div>
    </main>
  );
}
