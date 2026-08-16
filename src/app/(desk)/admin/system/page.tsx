import { notFound } from "next/navigation";
import { AdminNav } from "@/components/sq/admin-nav";
import { AdminSystemPanel, type SystemSetting } from "@/components/sq/admin-system";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getAiLimits } from "@/lib/ai/limits";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { getEmailLimits } from "@/lib/email-rate-limit";
import { env } from "@/lib/validate-env";

export const dynamic = "force-dynamic";

/** Present/missing for a credential, so a value never reaches the browser. */
function secret(label: string, variable: string, value: string | undefined): SystemSetting {
  const present = Boolean(value && value.length > 0);
  return {
    label,
    variable,
    value: present ? "configured" : "not set",
    missing: !present,
  };
}

/**
 * Effective configuration, read from the environment the process is running
 * with. Read-only: everything here is set at deploy time on purpose, so a
 * compromised admin session cannot raise a spend cap or add an admin.
 */
export default async function AdminSystemPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const emailLimits = getEmailLimits();
  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const settings: SystemSetting[] = [
    {
      label: "Email per person per hour",
      variable: "EMAIL_MAX_PER_HOUR",
      value: String(emailLimits.perHour),
    },
    {
      label: "Email per person per day",
      variable: "EMAIL_MAX_PER_DAY",
      value: String(emailLimits.perDay),
    },
    {
      label: "Chat model",
      variable: "GEMINI_CHAT_MODEL",
      value: env.GEMINI_CHAT_MODEL ?? "default",
    },
    {
      label: "Live model",
      variable: "GEMINI_LIVE_MODEL",
      value: env.GEMINI_LIVE_MODEL ?? "default",
    },
    {
      label: "Live voice",
      variable: "GEMINI_LIVE_VOICE",
      value: env.GEMINI_LIVE_VOICE ?? "default",
    },
    {
      label: "Estimated voice cost per minute",
      variable: "AI_VOICE_USD_PER_MINUTE",
      value: env.AI_VOICE_USD_PER_MINUTE ?? "default",
    },
    {
      label: "WhatsApp sync endpoint",
      variable: "WHATSAPP_API_URL",
      value: env.WHATSAPP_API_URL ?? "sync disabled",
      missing: !env.WHATSAPP_API_URL,
    },
    {
      label: "Instagram sync endpoint",
      variable: "INSTAGRAM_API_URL",
      value: env.INSTAGRAM_API_URL ?? "sync disabled",
      missing: !env.INSTAGRAM_API_URL,
    },
  ];

  const secrets: SystemSetting[] = [
    secret("Database", "TURSO_DATABASE_URL", env.TURSO_DATABASE_URL),
    secret("Database token", "TURSO_AUTH_TOKEN", env.TURSO_AUTH_TOKEN),
    secret("Cron authentication", "CRON_SECRET", env.CRON_SECRET),
    secret("Email delivery (Resend)", "RESEND_API_KEY", env.RESEND_API_KEY),
    secret("Gemini", "GEMINI_API_KEY", env.GEMINI_API_KEY),
    secret("Supabase service key", "SUPABASE_SERVICE_KEY", env.SUPABASE_SERVICE_KEY),
    secret("WhatsApp key", "WHATSAPP_API_KEY", env.WHATSAPP_API_KEY),
    secret("Instagram key", "INSTAGRAM_API_KEY", env.INSTAGRAM_API_KEY),
  ];

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="System" />
      <div className="sq-admin">
        <AdminNav current="/admin/system" />
        <AdminSystemPanel
          limits={getAiLimits()}
          settings={settings}
          secrets={secrets}
          adminEmails={adminEmails}
          environment={env.VERCEL_ENV ?? env.NODE_ENV}
        />
      </div>
    </main>
  );
}
