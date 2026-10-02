import { MagnetTitle } from "@/components/MagnetTitle";

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-2">
      <MagnetTitle text={title} />
      {action}
    </header>
  );
}
