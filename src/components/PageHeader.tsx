export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}
