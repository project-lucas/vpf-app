"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDownIcon } from "@/components/icons";

/** Bouton rétro : navy plein, rouge plein (CTA), ou ghost (crème bordé navy). */
export function EdButton({
  variant = "navy",
  full = false,
  className = "",
  children,
  ...props
}: {
  variant?: "navy" | "red" | "ghost";
  full?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "red"
      ? "bg-orange text-paper hover:brightness-95 disabled:opacity-40"
      : variant === "ghost"
        ? "bg-card text-ink border-2 border-ink hover:bg-ink/5 disabled:opacity-40"
        : "bg-ink text-paper hover:brightness-110 disabled:opacity-40";
  return (
    <button
      type="button"
      className={`ed-value inline-flex items-center justify-center gap-2 rounded-md px-5 py-3.5 text-base tracking-wide transition-all disabled:cursor-not-allowed ${styles} ${
        full ? "w-full" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Champ rétro : label mono rouge au-dessus, contrôle bordé navy en dessous. */
export function EdField({ label, children }: { label: string; children: ReactNode }) {
  const generatedId = useId();
  let control = children;
  let htmlFor: string | undefined;
  if (isValidElement(children)) {
    const child = children as ReactElement<{ id?: string }>;
    htmlFor = child.props.id ?? generatedId;
    if (!child.props.id) control = cloneElement(child, { id: htmlFor });
  }
  return (
    <div>
      <label htmlFor={htmlFor} className="ed-overline mb-1.5 block">
        {label}
      </label>
      {control}
    </div>
  );
}

/** Saisie texte rétro : fond crème, bordure navy 2px, coins 6px. */
export function EdInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ed-field ${className}`} {...props} />;
}

/** Textarea rétro : texte long en casse normale (Jakarta). */
export function EdTextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ed-field min-h-20 resize-none ${className}`} {...props} />;
}

/** Select rétro : valeur Archivo bold navy + chevron. */
export function EdSelect({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative flex items-center">
      <select className={`ed-select ${className}`} {...props} />
      <ChevronDownIcon
        size={18}
        className="pointer-events-none absolute right-3 text-ink"
      />
    </div>
  );
}
