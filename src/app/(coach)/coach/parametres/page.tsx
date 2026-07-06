import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata = { title: "Paramètres — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("first_name, last_name, whatsapp_number")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title="Paramètres" />

      <Card>
        <CardTitle>Mon profil</CardTitle>
        <p className="font-bold text-navy-900">
          {profile?.first_name} {profile?.last_name}
        </p>
        {profile?.whatsapp_number && (
          <p className="mt-1 text-sm text-navy-500">WhatsApp : {profile.whatsapp_number}</p>
        )}
        <p className="mt-2 text-xs text-navy-300">
          Ces informations sont gérées par l&apos;admin VPF.
        </p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Mot de passe</CardTitle>
        <PasswordForm />
      </Card>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </>
  );
}
