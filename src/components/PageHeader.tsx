export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-2">
      <h1 className="font-hand text-[2.6rem] font-bold leading-none text-ink">{title}</h1>
      {action}
    </header>
  );
}
