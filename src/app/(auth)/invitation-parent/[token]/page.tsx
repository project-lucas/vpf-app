import { createAdminClient } from "@/lib/supabase/admin";
import { ParentSignupForm } from "./ParentSignupForm";

export const metadata = { title: "Invitation parent — VPF" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParentInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let valid = false;
  let playerName = "";

  if (UUID_RE.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("parent_invitations")
      .select("used_at, player_id")
      .eq("id", token)
      .maybeSingle();
    if (data && !data.used_at) {
      valid = true;
      // le nom du joueur vit dans profiles (même id que players)
      const { data: playerProfile } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", data.player_id)
        .maybeSingle();
      if (playerProfile) {
        playerName = `${playerProfile.first_name} ${playerProfile.last_name}`.trim();
      }
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-800 shadow-lg">
            <span className="text-xl font-black tracking-widest text-white">VPF</span>
          </div>
          <h1 className="mt-4 text-center text-lg font-bold text-navy-900">
            Espace parent — Centre de Performance
          </h1>
          {valid && playerName && (
            <p className="mt-1 text-sm text-navy-400">
              Suivez le parcours de {playerName} : planning, progrès et échanges avec le coach.
            </p>
          )}
        </div>

        {valid ? (
          <ParentSignupForm token={token} />
        ) : (
          <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center">
            <p className="font-semibold text-navy-800">
              Ce lien d&apos;invitation n&apos;est plus valide.
            </p>
            <p className="mt-2 text-sm text-navy-400">
              Il a peut-être déjà été utilisé. Contactez le coach pour recevoir une nouvelle
              invitation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
