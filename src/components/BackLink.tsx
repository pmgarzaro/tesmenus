import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-0.5 text-sm text-stone-500 hover:text-stone-700 ${className}`}>
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
