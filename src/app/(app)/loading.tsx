/** Shown instantly while a tab loads (slow mobile networks). */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="animate-pulse space-y-3">
      <div className="h-8 w-2/3 rounded-lg bg-stone-200" />
      <div className="h-10 rounded-xl bg-stone-200" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-white shadow-sm" />
      ))}
    </div>
  );
}
