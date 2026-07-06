import { createAdminClient } from "@/lib/supabase/admin";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Invitation — VPF" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let valid = false;
  let coachName = "";

  if (UUID_RE.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("invitations")
      .select("used_at, coach:profiles!invitations_coach_id_fkey(first_name, last_name)")
      .eq("id", token)
      .maybeSingle();
    if (data && !data.used_at) {
      valid = true;
      const coach = Array.isArray(data.coach) ? data.coach[0] : data.coach;
      if (coach) coachName = `${coach.first_name} ${coach.last_name}`.trim();
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
            Bienvenue au Centre de Performance
          </h1>
          {valid && coachName && (
            <p className="mt-1 text-sm text-navy-400">Ton coach référent : {coachName}</p>
          )}
        </div>

        {valid ? (
          <SignupForm token={token} />
        ) : (
          <div className="rounded-2xl border border-navy-100 bg-white p-6 text-center">
            <p className="font-semibold text-navy-800">Ce lien d&apos;invitation n&apos;est plus valide.</p>
            <p className="mt-2 text-sm text-navy-400">
              Il a peut-être déjà été utilisé. Contacte VPF pour recevoir une nouvelle invitation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
