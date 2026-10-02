"use client";

import { AlarmClock, Check, ChefHat, ChevronLeft, ChevronRight, Hourglass, MoonStar, Sun, Timer, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { clock } from "@/lib/batch/format";
import type { BatchSheet } from "@/lib/batch/sheet";

type Timer = { stepId: string; label: string; endAt: number; done: boolean };

const COLORS = ["bg-orange-500", "bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500", "bg-fuchsia-500"];

// Browser storage may be unavailable (private mode): everything still works without it.
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Keeps "180 °C", "20 min" together on one line. */
const nbsp = (s: string) => s.replace(/(\d) (°C|°|min|h|g|kg|cl|ml|l)\b/g, "$1\u00a0$2");

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CookMode({ id, sheet }: { id: number; sheet: BatchSheet }) {
  const steps = sheet.timeline;
  const storeKey = `cook-${id}`;
  const [index, setIndex] = useState(0);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [wake, setWake] = useState<"on" | "off" | "unsupported">("off");
  const audio = useRef<AudioContext | null>(null);
  const loaded = useRef(false);
  const color = new Map(sheet.dishes.map((d, i) => [d.key, COLORS[i % COLORS.length]]));

  // Restore progress after a reload.
  useEffect(() => {
    const saved = load<{ index: number; timers: Timer[] }>(storeKey, { index: 0, timers: [] });
    setIndex(Math.min(saved.index, steps.length - 1));
    setTimers(saved.timers);
    loaded.current = true;
  }, [storeKey, steps.length]);
  useEffect(() => {
    if (loaded.current) save(storeKey, { index, timers });
  }, [storeKey, index, timers]);

  // Keep the screen on while cooking.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      if (!("wakeLock" in navigator)) return setWake("unsupported");
      try {
        lock = await navigator.wakeLock.request("screen");
        setWake("on");
        lock.addEventListener("release", () => setWake("off"));
      } catch {
        setWake("off");
      }
    };
    request();
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  const beep = useCallback(() => {
    try {
      navigator.vibrate?.([400, 150, 400, 150, 400]);
      const ctx = audio.current;
      if (!ctx) return;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.25;
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.35);
        osc.stop(ctx.currentTime + i * 0.35 + 0.2);
      }
    } catch {}
  }, []);

  // Tick + ring finished timers.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setTimers((list) => {
        if (!list.some((x) => !x.done && x.endAt <= n)) return list;
        beep();
        return list.map((x) => (!x.done && x.endAt <= n ? { ...x, done: true } : x));
      });
    }, 1000);
    return () => clearInterval(t);
  }, [beep]);

  const step = steps[index];
  const duration = step ? step.end - step.start : 0;
  const timer = step && timers.find((t) => t.stepId === step.id);
  const ringing = timers.filter((t) => t.done);
  const running = timers.filter((t) => !t.done);

  const startTimer = () => {
    // Audio can only start after a tap: create the context here.
    audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    setTimers((list) => [
      ...list.filter((t) => t.stepId !== step.id),
      { stepId: step.id, label: `${step.recipeTitle} · ${step.text}`, endAt: Date.now() + duration * 60_000, done: false },
    ]);
    // Passive steps run on their own: move on.
    if (!step.active && index < steps.length - 1) setIndex(index + 1);
  };

  if (!step) return null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
      <header className="mb-3 flex items-center justify-between text-sm text-stone-500">
        <Link href={`/batch/${id}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1">
          <X className="size-4" aria-hidden /> Quitter
        </Link>
        <span>
          Étape {index + 1}/{steps.length}
        </span>
        <span title={wake === "on" ? "Écran maintenu allumé" : "L'écran peut se mettre en veille"}>
          {wake === "on" ? <Sun className="size-5 text-amber-500" aria-label="Écran maintenu allumé" /> : wake === "off" ? <MoonStar className="size-5" aria-label="Veille possible" /> : null}
        </span>
      </header>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>

      {ringing.length > 0 && (
        <div className="mb-3 space-y-2">
          {ringing.map((t) => (
            <button
              key={t.stepId}
              onClick={() => setTimers(timers.filter((x) => x.stepId !== t.stepId))}
              className="flex w-full items-center justify-between gap-2 rounded-2xl bg-red-600 px-4 py-3 text-left text-white animate-pulse"
            >
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                <AlarmClock className="size-5 shrink-0" aria-hidden />
                <span className="truncate">Terminé : {t.label}</span>
              </span>
              <span className="shrink-0 text-sm underline">OK</span>
            </button>
          ))}
        </div>
      )}

      {running.length > 0 && (
        <ul className="mb-3 flex gap-2 overflow-x-auto">
          {running.map((t) => (
            <li key={t.stepId} className="shrink-0 rounded-full bg-stone-800 px-3 py-1.5 text-sm text-white">
              <Hourglass className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
              {mmss(t.endAt - now)} <span className="text-stone-300">· {t.label.slice(0, 28)}</span>
            </li>
          ))}
        </ul>
      )}

      <main className="flex flex-1 flex-col justify-center gap-5 py-4">
        <p className="flex items-center gap-2 font-display text-2xl font-semibold text-stone-600">
          <span className={`size-3.5 rounded-full ${color.get(step.recipeKey)}`} />
          {step.recipeTitle}
        </p>
        <p className="text-3xl font-semibold leading-snug sm:text-4xl">{nbsp(step.text)}</p>
        <p className="text-lg text-stone-600">
          {step.active ? (
            <ChefHat className="mr-1.5 inline size-5 align-[-4px] text-brand-700" aria-hidden />
          ) : (
            <Hourglass className="mr-1.5 inline size-5 align-[-4px] text-sky-700" aria-hidden />
          )}
          {step.active ? "À faire maintenant" : "Cuit tout seul"}
          {step.merged ? " · le four chauffe déjà pour un autre plat" : duration > 0 && ` · ${duration} min${step.estimated ? " (estimé)" : ""}`}
          {step.equipment && ` · ${step.equipment}${step.temperature ? ` ${step.temperature} °C` : ""}`}
          <span className="block text-sm text-stone-400">prévu à {clock(step.start)} du début</span>
        </p>

        {duration > 0 && !step.merged && (
          timer && !timer.done ? (
            <p className="text-center font-mono text-6xl font-bold tabular-nums">{mmss(timer.endAt - now)}</p>
          ) : (
            <button onClick={startTimer} className="rounded-2xl bg-stone-800 py-4 text-xl font-semibold text-white">
              <Timer className="mr-2 inline size-6 align-[-5px]" aria-hidden />
              {step.active ? `Minuteur ${duration} min` : `Lancer (${duration} min) et passer à la suite`}
            </button>
          )
        )}

        {steps[index + 1] && (
          <p className="text-sm text-stone-500">
            Ensuite : <span className="text-stone-700">{steps[index + 1].text}</span> ({steps[index + 1].recipeTitle})
          </p>
        )}
      </main>

      <nav className="grid grid-cols-2 gap-3">
        <button
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          className="rounded-2xl border border-stone-300 bg-white py-4 text-lg disabled:opacity-30"
        >
          <ChevronLeft className="mr-1 inline size-5 align-[-4px]" aria-hidden />
          Précédent
        </button>
        {index < steps.length - 1 ? (
          <button onClick={() => setIndex(index + 1)} className="btn-primary py-4 text-lg font-semibold text-white">
            Suivant
            <ChevronRight className="ml-1 inline size-5 align-[-4px]" aria-hidden />
          </button>
        ) : (
          <Link href={`/batch/${id}`} className="rounded-2xl bg-green-600 py-4 text-center text-lg font-semibold text-white">
            Terminé
            <Check className="ml-1 inline size-5 align-[-4px]" aria-hidden />
          </Link>
        )}
      </nav>
    </div>
  );
}
