# ADR 003: Environment Variables

Hardcode non-secret values in the codebase. Only use environment variables for actual secrets, and validate them at build time.

## Rationale

- **Version control**: Hardcoded values are tracked, documented, and diffable
- **Easier debugging**: No need to check Vercel dashboard to understand behavior
- **Simpler deployment**: Fewer variables to configure = fewer mistakes
- **No `.env` files**: Local dev works immediately with `pnpm dev`
- **Build-time validation**: Fail deployments before they go live, not at runtime

## What Should Be Hardcoded

| Value                | Location                              | Example                            |
| -------------------- | ------------------------------------- | ---------------------------------- |
| Production domain    | `src/lib/process-board-notifications` | `https://squirrl.itsdesignare.com` |
| Local database path  | `src/db/index.ts`                     | `file:local.db`                    |
| Local dev port       | `package.json`                        | `5800`                             |
| Email sender address | `src/lib/process-board-notifications` | `noreply@squirrl.itsdesignare.com` |

## Required ENV Variables (Secrets Only)

These are validated at build time using Zod in `src/lib/validate-env.ts`. Builds fail with clear errors if missing in production.

| Variable             | Format       | Purpose                      |
| -------------------- | ------------ | ---------------------------- |
| `TURSO_DATABASE_URL` | URL          | Turso database connection    |
| `TURSO_AUTH_TOKEN`   | Non-empty    | Turso authentication         |
| `CRON_SECRET`        | Min 16 chars | Cron endpoint authentication |

These are injected automatically by Vercel/Turso marketplace integration.

## Optional ENV Variables

| Variable             | Format           | Purpose                                                                                                            |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`     | Non-empty        | Creator-desk voice agent and chatbot. Without it the desk renders and polls, but both agent surfaces are disabled. |
| `GEMINI_LIVE_MODEL`  | Model id         | Overrides the Live audio model                                                                                     |
| `GEMINI_CHAT_MODEL`  | Model id         | Overrides the text chat model                                                                                      |
| `GEMINI_LIVE_VOICE`  | Voice name       | Overrides the spoken voice (default `Zephyr`)                                                                      |
| `ADMIN_EMAILS`       | Comma list       | Emails allowed into `/admin`. Unset or empty means nobody is an admin and the console 404s.                        |
| `RESEND_API_KEY`     | Starts `re_`     | Sends notification email externally. Without it, digests remain available in email history but are not delivered.  |
| `EMAIL_MAX_PER_HOUR` | Positive integer | Caps notification email per recipient per hour. Unset uses the default cap (6), never no cap.                      |
| `EMAIL_MAX_PER_DAY`  | Positive integer | Caps notification email per recipient per day. Unset uses the default cap (30), never no cap.                      |
| `WHATSAPP_API_URL`   | URL              | Enables WhatsApp community synchronization.                                                                        |
| `WHATSAPP_API_KEY`   | Non-empty        | Authenticates the optional WhatsApp provider.                                                                      |
| `INSTAGRAM_API_URL`  | URL              | Enables Instagram topic synchronization.                                                                           |
| `INSTAGRAM_API_KEY`  | Non-empty        | Authenticates the optional Instagram provider.                                                                     |

The key stays server-side. The browser receives only a single-use ephemeral Live token minted by
`/api/agent/session` — see `agent__tool-registry`.

## Examples

### Hardcoding Non-Secrets

```typescript
// ✅ Hardcoded production domain (not a secret)
const PRODUCTION_DOMAIN = "https://squirrl.itsdesignare.com";
function getBaseUrl(): string {
  if (env.VERCEL_ENV === "production") return PRODUCTION_DOMAIN;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:5800";
}

// ✅ Hardcoded fallback for local dev (not a secret)
url: process.env.TURSO_DATABASE_URL ?? "file:local.db";

// ❌ Don't use ENV for non-secrets
const domain = process.env.NEXT_PUBLIC_BASE_URL; // Avoid this
```

### Adding a New Required Variable

```typescript
// In src/lib/validate-env.ts
const serverEnvSchema = z.object({
  // ... existing vars ...

  NEW_API_KEY: z
    .string()
    .min(1, "NEW_API_KEY cannot be empty")
    .optional()
    .refine((val) => !isVercelProduction || (val && val.length > 0), {
      message: "NEW_API_KEY is required in production",
    }),
});
```

### Using Validated Variables

```typescript
import { env } from "@/lib/validate-env";

// Type-safe access to validated variables
const apiKey = env.RESEND_API_KEY;
const dbUrl = env.TURSO_DATABASE_URL ?? "file:local.db";
```

### Testing Validation Locally

```bash
# Should pass (no VERCEL_ENV)
pnpm build

# Should fail with clear errors
VERCEL_ENV=production pnpm build
```

## Linting Enforcement

The `node/no-process-env` rule prevents direct `process.env` usage, enforcing that all code uses the validated `env` object.

**Exceptions** (allowed to use `process.env` directly):

- `src/lib/validate-env.ts` - The validation module itself
- `next.config.ts` - Loaded before validation runs
- `drizzle.config.ts` - Used by CLI, not app runtime
- `playwright/**/*.ts` - Test configuration
- `scripts/**/*.ts` - One-off CLI scripts that validate their own required inputs
