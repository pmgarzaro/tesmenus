"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  recettes: (
    <>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
      <path d="M5 18a2 2 0 0 1 2-2h12" />
    </>
  ),
  planning: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  courses: (
    <>
      <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  batch: (
    <>
      <path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M2 10h20M9 6c0-1 1-2 3-2s3 1 3 2" />
    </>
  ),
  reglages: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
};

// Each tab has its own magnet colour when active; text colours are the dark shades (readable on white).
const TABS = [
  { href: "/recettes", label: "Recettes", icon: "recettes", magnet: "bg-magnet-green text-white", text: "text-magnet-green-dark" },
  { href: "/planning", label: "Planning", icon: "planning", magnet: "bg-magnet-blue text-white", text: "text-magnet-blue-dark" },
  { href: "/courses", label: "Courses", icon: "courses", magnet: "bg-magnet-red text-white", text: "text-magnet-red-dark" },
  { href: "/batch", label: "Batch", icon: "batch", magnet: "bg-magnet-yellow text-ink", text: "text-[#7a5a00]" },
  { href: "/reglages", label: "Réglages", icon: "reglages", magnet: "bg-ink text-white", text: "text-ink" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto flex max-w-3xl">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-xs ${active ? `font-extrabold ${t.text}` : "text-stone-500"}`}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-full ${
                    active ? `${t.magnet} shadow-[inset_-3px_-3px_0_rgb(0_0_0/0.18),inset_2px_2px_0_rgb(255_255_255/0.3)]` : ""
                  }`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[t.icon]}
                  </svg>
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
