"use client";

import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 disabled:bg-navy-300",
  secondary:
    "bg-white text-navy-800 border border-navy-200 hover:bg-navy-50 active:bg-navy-100 disabled:text-navy-300",
  ghost: "bg-transparent text-navy-600 hover:bg-navy-100 active:bg-navy-200",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  success: "bg-success text-white hover:opacity-90 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
};

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}: Props) {
  return (
    <button
      // type "button" par défaut : évite qu'un bouton dans un <form> le soumette
      // par accident ; les call sites passent type="submit" quand nécessaire.
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
