/**
 * État vide : icône optionnelle + message + action optionnelle.
 * Rétro-compatible — `<EmptyState>texte</EmptyState>` reste valide.
 */
export function EmptyState({
  children,
  icon,
  action,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-navy-200 bg-white/60 p-6 text-center">
      {icon && <span className="text-navy-300">{icon}</span>}
      <div className="text-sm text-navy-500">{children}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
