import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contributors } from "@/db/schema";

/**
 * Opting out of notification email.
 *
 * Deliberately unauthenticated: the link is followed from an inbox, where there
 * is no session to check. The token in the URL is the credential — it is a
 * random UUID, unique per person, and grants nothing beyond silencing that
 * person's own mail.
 */

function page(title: string, body: string, status: number): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;color:#111827">
<h1 style="font-size:1.25rem;margin:0 0 .5rem">${title}</h1>
<p style="color:#6b7280;line-height:1.6;margin:0">${body}</p>
</body>
</html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function unsubscribe(token: string | null): Promise<Response> {
  if (!token) {
    return page("Link incomplete", "This unsubscribe link is missing its token.", 400);
  }

  const contributor = await db.query.contributors.findFirst({
    where: eq(contributors.unsubscribeToken, token),
    columns: { id: true, name: true, unsubscribedAt: true },
  });

  if (!contributor) {
    return page(
      "Link not recognised",
      "This unsubscribe link is no longer valid. If you are still receiving email you did not ask for, reply to one of the messages and we will sort it out.",
      404,
    );
  }

  // Following the link twice is not an error — mail clients prefetch, and people
  // click again when they are unsure it worked.
  if (!contributor.unsubscribedAt) {
    await db
      .update(contributors)
      .set({ unsubscribedAt: new Date() })
      .where(eq(contributors.id, contributor.id));
  }

  return page(
    "Unsubscribed",
    "You will not receive any further task notification email. To start again, ask someone on the board to re-enable notifications for you.",
    200,
  );
}

export async function GET(request: Request): Promise<Response> {
  return unsubscribe(new URL(request.url).searchParams.get("token"));
}

/** Gmail and Outlook one-click unsubscribe (RFC 8058) posts rather than gets. */
export async function POST(request: Request): Promise<Response> {
  return unsubscribe(new URL(request.url).searchParams.get("token"));
}
