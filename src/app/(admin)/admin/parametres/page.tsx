import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata = { title: "Paramètres — VPF" };

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Paramètres" />
      <Card>
        <CardTitle>Mot de passe</CardTitle>
        <PasswordForm />
      </Card>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </>
  );
}
