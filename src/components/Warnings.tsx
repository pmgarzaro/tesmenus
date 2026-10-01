import { TriangleAlert } from "lucide-react";

/** List of warnings, each with an alert icon. */
export function Warnings({ items }: { items: string[] }) {
  return (
    <>
      {items.map((w) => (
        <p key={w} className="flex gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{w}</span>
        </p>
      ))}
    </>
  );
}
