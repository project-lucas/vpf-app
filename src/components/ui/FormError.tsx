"use client";

import { useEffect, useRef } from "react";

/**
 * Message d'erreur de formulaire : annoncé aux lecteurs d'écran (`role="alert"`)
 * et reçoit le focus dès qu'il apparaît / change, pour que l'utilisateur au
 * clavier soit amené directement à l'erreur.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [children]);
  return (
    <p
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger focus:outline-none"
    >
      {children}
    </p>
  );
}
