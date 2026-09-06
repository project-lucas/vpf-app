import { createClient, getCachedUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";
import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata = { title: "Réglages — VPF" };
export const dynamic = "force-dynamic";

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("first_name, last_name, whatsapp_number, notifications_enabled")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title="Réglages" />

      {/* le profil se lit, il ne se modifie pas ici : une section plate suffit */}
      <Section title="Mon profil">
        <p className="font-bold text-navy-900">
          {profile?.first_name} {profile?.last_name}
        </p>
        {profile?.whatsapp_number && (
          <p className="mt-0.5 text-sm text-navy-500">WhatsApp : {profile.whatsapp_number}</p>
        )}
        <p className="mt-1 text-xs text-navy-400">Ces informations sont gérées par l&apos;admin VPF.</p>
      </Section>

      <Card className="mt-5">
        <CardTitle>Notifications</CardTitle>
        <NotificationsToggle enabled={profile?.notifications_enabled ?? true} variant="coach" />
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
