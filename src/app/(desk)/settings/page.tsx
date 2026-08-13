import { PageHeader } from "@/components/reference/page-header";
import { SettingsView } from "@/components/reference/settings-view";
import { geminiConfigured } from "@/lib/agent/gemini";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Settings"
        description="Manage workspace, notifications, and voice preferences."
      />
      <SettingsView
        user={{ name: user.name, email: user.email }}
        voiceEnabled={geminiConfigured()}
      />
    </div>
  );
}
