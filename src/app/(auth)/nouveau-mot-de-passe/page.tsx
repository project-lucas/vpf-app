import { NewPasswordForm } from "./NewPasswordForm";

export const metadata = { title: "Nouveau mot de passe — VPF" };

/**
 * Fin du parcours « mot de passe oublié » : la session vient d'être ouverte
 * par le lien de l'email (`/auth/callback`), on choisit le nouveau mot de
 * passe puis on entre dans l'app.
 */
export default function NewPasswordPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-navy-800 shadow-lg">
            <span className="font-display text-2xl font-bold tracking-widest text-white">VPF</span>
          </div>
          <h1 className="font-display mt-4 text-2xl font-bold uppercase leading-none tracking-wide text-navy-900">
            Nouveau mot de passe
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-9 -skew-x-12 rounded-sm bg-gold" />
          <p className="mt-2 text-center text-sm text-navy-400">Choisis-le, puis tu entres directement dans l&apos;app.</p>
        </div>
        <NewPasswordForm />
      </div>
    </main>
  );
}
