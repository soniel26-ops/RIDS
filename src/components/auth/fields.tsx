/**
 * Peças de formulário partilhadas pelas telas de autenticação. Sem estado próprio.
 * Avisos em role="status", erros em role="alert", como em StoreList.
 */
import type { ChangeEvent, ReactNode } from "react";

export const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 " +
  "focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export const BUTTON_CLASS =
  "rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed " +
  "disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900";

export const LINK_CLASS = "text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400";

export function TextField(props: {
  id: string;
  name: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.name}
        type={props.type}
        value={props.value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        minLength={props.minLength}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        className={INPUT_CLASS}
      />
      {props.error ? (
        <p id={errorId} className="text-sm text-red-700">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton(props: { idleLabel: string; busyLabel: string; busy: boolean }) {
  return (
    <button type="submit" disabled={props.busy} aria-busy={props.busy} className={BUTTON_CLASS}>
      {props.busy ? props.busyLabel : props.idleLabel}
    </button>
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">
      {children}
    </p>
  );
}

export function FormStatus({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40"
    >
      {children}
    </p>
  );
}
