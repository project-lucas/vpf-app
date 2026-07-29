import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata = { title: "Profil — VPF" };
export const dynamic = "force-dynamic";

export default async function ParentProfilePage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  const child = await getParentChild();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title="Mon profil" />

      <Card>
        <CardTitle>Compte parent</CardTitle>
        <p className="font-bold text-navy-900">
          {profile?.first_name} {profile?.last_name}
        </p>
        {child && (
          <p className="mt-1 text-sm text-navy-500">
            Suivi de {child.firstName} {child.lastName}
          </p>
        )}
        <p className="mt-2 text-xs text-navy-300">
          Accès en lecture au suivi du joueur ; vos messages sont visibles du joueur et du coach.
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
