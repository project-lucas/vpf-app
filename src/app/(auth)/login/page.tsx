import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion — VPF" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Emplacement logo VPF (remplacer par le fichier logo si disponible) */}
        <div className="mb-10 flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-navy-800 shadow-lg">
            <span className="font-display text-3xl font-bold tracking-widest text-white">
              VPF
            </span>
          </div>
          <h1 className="font-display mt-4 text-2xl font-bold uppercase leading-none tracking-wide text-navy-900">
            Centre de Performance
          </h1>
          <span aria-hidden className="mt-2 block h-1 w-9 -skew-x-12 rounded-sm bg-gold" />
          <p className="mt-2 text-sm text-navy-400">Dirigé dans la bonne direction.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
