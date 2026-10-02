import { magnetAt } from "@/lib/notes";

// Small fixed tilts so each letter looks placed by hand, the same on every render.
const TILTS = [-5, 4, -2, 6, -3, 3, -6, 2];

/** A title spelled with magnetic letters. Screen readers get the plain text. */
export function MagnetTitle({ text, className = "text-[2.6rem]" }: { text: string; className?: string }) {
  let n = 0;
  return (
    <h1 aria-label={text} className={`flex flex-wrap gap-x-3 gap-y-1 uppercase ${className}`}>
      {text.split(" ").map((word, w) => (
        <span key={w} aria-hidden="true" className="flex whitespace-nowrap">
          {[...word].map((ch, i) => {
            const k = n++;
            return (
              <span key={i} className={`magnet-letter ${magnetAt(k)}`} style={{ rotate: `${TILTS[k % TILTS.length]}deg` }}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
