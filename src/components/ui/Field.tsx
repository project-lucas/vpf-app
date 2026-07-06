import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const baseInput =
  "w-full rounded-xl border border-navy-200 bg-white px-3.5 py-2.5 text-base text-navy-900 placeholder:text-navy-300 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-navy-700">
      {children}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${baseInput} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${baseInput} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${baseInput} min-h-24 ${className}`} {...props} />;
}

/**
 * Associe automatiquement le libellé au champ : génère un id unique, le passe à
 * `<Label htmlFor>` et l'injecte dans l'enfant (Input/Select/Textarea) s'il n'en
 * a pas déjà un. Cliquer le libellé focalise le champ, et les lecteurs d'écran
 * annoncent correctement le couple label/champ.
 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();

  let control = children;
  let htmlFor: string | undefined;

  if (isValidElement(children)) {
    const child = children as ReactElement<{ id?: string }>;
    htmlFor = child.props.id ?? generatedId;
    if (!child.props.id) {
      control = cloneElement(child, { id: htmlFor });
    }
  }

  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
    </div>
  );
}
