"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/recettes", label: "Recettes", icon: "📖" },
  { href: "/planning", label: "Planning", icon: "📅" },
  { href: "/courses", label: "Courses", icon: "🛒" },
  { href: "/batch", label: "Batch", icon: "🥘" },
  { href: "/reglages", label: "Réglages", icon: "⚙️" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_16px_-12px_rgb(30_40_45/0.35)] backdrop-blur print:hidden">
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs ${
                  active ? "font-semibold text-brand-700" : "text-stone-500"
                }`}
              >
                {/* Active tab: a little tomato magnet above the icon. */}
                <span
                  className={`absolute top-0.5 size-1.5 rounded-full ${active ? "bg-brand-500" : "bg-transparent"}`}
                  aria-hidden="true"
                />
                <span className={`text-xl leading-none transition-transform ${active ? "-translate-y-0.5 scale-110" : ""}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
