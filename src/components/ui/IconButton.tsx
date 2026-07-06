"use client";

import { type ButtonHTMLAttributes } from "react";

type Tone = "default" | "danger";

const tones: Record<Tone, string> = {
  default: "text-navy-300 hover:bg-navy-100 hover:text-navy-600",
  danger: "text-navy-300 hover:bg-danger-soft hover:text-danger",
};

/**
 * Bouton-icône compact et cohérent (suppression, action inline…). Rayon,
 * transitions et anneau de focus clavier unifiés.
 */
export function IconButton({
  tone = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40 disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
