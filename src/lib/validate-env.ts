/**
 * Environment Variable Validation
 *
 * This module validates required environment variables at build time.
 * If validation fails in production, the build will fail with clear error messages,
 * preventing Vercel from deploying a broken app.
 *
 * Usage: Import this module in next.config.ts to run validation during build.
 */

import { z } from "zod";

// Check if we're in a Vercel production deployment
// VERCEL_ENV is set by Vercel to "production", "preview", or "development"
// We only require production env vars when actually deployed to Vercel production
const isVercelProduction = process.env.VERCEL_ENV === "production";

/**
 * Server-side environment variables schema
 * These are only available on the server and validated at build time.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database (Turso) - Required in production
  TURSO_DATABASE_URL: z
    .url({ message: "TURSO_DATABASE_URL must be a valid URL" })
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "TURSO_DATABASE_URL is required in production",
    }),

  TURSO_AUTH_TOKEN: z
    .string()
    .min(1, "TURSO_AUTH_TOKEN cannot be empty")
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "TURSO_AUTH_TOKEN is required in production",
    }),

  // Cron job authentication - Required in production
  CRON_SECRET: z
    .string()
    .min(16, "CRON_SECRET must be at least 16 characters for security")
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "CRON_SECRET is required in production for cron job authentication",
    }),

  // Email delivery is optional. Without Resend, notification digests are still
  // rendered and saved to email history; they are simply not sent externally.
  RESEND_API_KEY: z
    .string()
    .refine((val) => !val || val.startsWith("re_"), {
      message: "RESEND_API_KEY must start with 're_'",
    })
    .optional(),

  // How much notification email one person can be sent before the rest is held
  // back for a later digest. Optional: each falls back to a default cap in
  // src/lib/email-rate-limit.ts, so unset means "use the default", never "no cap".
  EMAIL_MAX_PER_HOUR: z.string().optional(),
  EMAIL_MAX_PER_DAY: z.string().optional(),

  // Gemini (creator homepage agent) - optional; without it the dashboard still
  // renders and only the voice agent and chatbot are turned off.
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY cannot be empty").optional(),
  GEMINI_LIVE_MODEL: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().optional(),
  GEMINI_LIVE_VOICE: z.string().optional(),

  // AI spend caps (see ADR global__ai-usage-metering). All optional: each
  // falls back to a safe default in src/lib/ai/limits.ts, so an unset value
  // means "use the default cap", never "no cap". Costs are plain USD.
  AI_USER_CALLS_PER_MINUTE: z.string().optional(),
  AI_USER_CALLS_PER_DAY: z.string().optional(),
  AI_USER_TOKENS_PER_DAY: z.string().optional(),
  AI_USER_USD_PER_DAY: z.string().optional(),
  AI_GLOBAL_CALLS_PER_DAY: z.string().optional(),
  AI_GLOBAL_USD_PER_DAY: z.string().optional(),
  // Estimated Live-session cost per minute of audio, in USD. Live bills in the
  // browser where no token count reaches the server, so voice spend is metered
  // from session duration and flagged as an estimate in the ledger.
  AI_VOICE_USD_PER_MINUTE: z.string().optional(),

  // Optional third-party research providers. A missing endpoint leaves the
  // related sync disabled instead of blocking the rest of the desk.
  WHATSAPP_API_URL: z.url().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  INSTAGRAM_API_URL: z.url().optional(),
  INSTAGRAM_API_KEY: z.string().optional(),

  // Supabase Auth - owns identity and sessions. The URL and anon key are
  // public by design (they ship to the browser); the service key must never
  // leave the server and is what lets /admin create and delete accounts.
  NEXT_PUBLIC_SUPABASE_URL: z
    .url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" })
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "NEXT_PUBLIC_SUPABASE_URL is required in production for authentication",
    }),

  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY cannot be empty")
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required in production for authentication",
    }),

  SUPABASE_SERVICE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_KEY cannot be empty")
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "SUPABASE_SERVICE_KEY is required in production for admin user management",
    }),

  // Remote MCP connector (see docs/features/global__mcp-connector.md). The
  // public URL is what tokens are audience-bound to, so it must match the
  // origin Claude and ChatGPT are pointed at; unset falls back to the Vercel
  // deployment URL. Writes are off unless explicitly turned on, which keeps a
  // newly-added connector read-only until someone decides otherwise.
  MCP_PUBLIC_URL: z.url({ message: "MCP_PUBLIC_URL must be a valid URL" }).optional(),
  MCP_ALLOW_WRITES: z.enum(["true", "false"]).optional(),

  // Admin console allowlist - comma-separated emails. Anyone signed in with a
  // listed email reaches /admin; empty or unset turns the console off entirely.
  ADMIN_EMAILS: z.string().optional(),

  // Vercel-provided variables (automatically set by Vercel)
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
});

/**
 * Format Zod errors into a clear, readable message
 */
function formatEnvErrors(zodError: z.ZodError): string {
  const lines: string[] = ["", "❌ Environment validation failed!", ""];

  const missingInProd: string[] = [];
  const invalidFormat: string[] = [];

  for (const issue of zodError.issues) {
    const path = issue.path.join(".");
    const message = issue.message;

    if (message.includes("required in production")) {
      missingInProd.push(`  ${path}: ${message}`);
    } else {
      invalidFormat.push(`  ${path}: ${message}`);
    }
  }

  if (missingInProd.length > 0) {
    lines.push("Missing required environment variables for production:");
    lines.push(...missingInProd);
    lines.push("");
  }

  if (invalidFormat.length > 0) {
    lines.push("Invalid format:");
    lines.push(...invalidFormat);
    lines.push("");
  }

  lines.push("Please configure these in your Vercel project settings.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Validate environment variables
 * Throws an error with detailed messages if validation fails
 */
function validateEnv() {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessage = formatEnvErrors(result.error);
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return result.data;
}

// Run validation immediately when this module is imported
export const env = validateEnv();

// Export the schema for testing or type inference
export type Env = z.infer<typeof serverEnvSchema>;
