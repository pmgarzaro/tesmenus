"use client";

import { useActionState } from "react";

export const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg outline-none focus:border-brand-500";

export type AuthState = { error: string; values: Record<string, string> } | null;
type Action = (prev: AuthState, form: FormData) => Promise<AuthState>;

export type Field = {
  name: string;
  type?: "text" | "email" | "password" | "hidden";
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  value?: string; // for hidden fields
};

/** Login / sign-up form: shows the error and keeps typed values (except passwords). */
export function AuthForm({
  action,
  fields,
  submitLabel,
  pendingLabel,
}: {
  action: Action;
  fields: Field[];
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f) =>
        f.type === "hidden" ? (
          <input key={f.name} type="hidden" name={f.name} value={f.value ?? ""} />
        ) : (
          <input
            key={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required
            placeholder={f.placeholder}
            autoComplete={f.autoComplete}
            minLength={f.minLength}
            defaultValue={f.type === "password" ? undefined : state?.values[f.name]}
            className={inputClass}
          />
        ),
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-3 text-lg font-semibold text-white disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
