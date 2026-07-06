import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Ton profil — VPF" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
      <h1 className="text-xl font-extrabold text-navy-900">Créons ton profil joueur</h1>
      <p className="mt-1 mb-6 text-sm text-navy-400">
        Ces informations seront visibles par ton coach référent. Elles ne pourront ensuite être
        modifiées que par lui.
      </p>
      <OnboardingForm />
    </main>
  );
}
