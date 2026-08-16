"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailX, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { setClientTeam } from "@/actions/agency";

export type TeamMember = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  unsubscribed: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The client's team, which is who gets emailed about its work. A task inherits
 * this list unless it names its own people — so this panel is the one place
 * most clients ever need to set up notifications.
 */
export function ClientTeamPanel({
  clientId,
  team,
  accounts,
  editable,
}: {
  clientId: string;
  team: TeamMember[];
  accounts: { id: string; name: string; email: string }[];
  /** Only an admin can restaff a client; everyone else reads the roster. */
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // A contributor predating the account link has no userId, so it cannot be
  // toggled from a picker that offers accounts. It still shows in the roster.
  const chosen = new Set(team.map((member) => member.userId).filter(Boolean) as string[]);

  const toggle = (userId: string) => {
    const next = chosen.has(userId)
      ? [...chosen].filter((id) => id !== userId)
      : [...chosen, userId];
    startTransition(async () => {
      try {
        await setClientTeam(clientId, next);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not save the team");
      }
    });
  };

  return (
    <section className="mt-12 border-t border-line pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.025em]">Team</h2>
          <p className="mt-1.5 text-[15px] text-muted">
            Everyone here is emailed about this client&rsquo;s tasks, unless a task names its own
            people.
          </p>
        </div>
        {editable && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              disabled={pending}
              aria-expanded={open}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50 disabled:opacity-60"
            >
              <UsersRound className="h-4 w-4" aria-hidden /> Edit team
            </button>
            {open && (
              <div
                role="listbox"
                className="absolute right-0 z-20 mt-2 max-h-[320px] w-[280px] overflow-y-auto rounded-[14px] border border-line bg-white p-1.5 shadow-soft"
              >
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    role="option"
                    aria-selected={chosen.has(account.id)}
                    disabled={pending}
                    onClick={() => toggle(account.id)}
                    title={account.email}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-slate-50 ${
                      chosen.has(account.id) ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-ink">
                      {initials(account.name)}
                    </span>
                    <span className="truncate">{account.name}</span>
                    {chosen.has(account.id) && <span className="ml-auto text-xs">On team</span>}
                  </button>
                ))}
                {!accounts.length && (
                  <p className="px-2.5 py-2 text-sm text-muted">
                    No accounts yet. Invite someone first.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {team.length ? (
        <ul className="flex flex-wrap gap-3">
          {team.map((member) => (
            <li
              key={member.id}
              className="flex min-w-[220px] items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-ink">
                {initials(member.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{member.name}</div>
                <div className="truncate text-xs text-muted">
                  {member.email ?? "No email — cannot be notified"}
                </div>
              </div>
              {member.unsubscribed && (
                <span
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted"
                  title="Unsubscribed from notification email"
                >
                  <MailX className="h-3.5 w-3.5" aria-hidden /> Off
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[16px] border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
          Nobody on this team yet, so nobody is emailed about this client&rsquo;s tasks.
        </p>
      )}
    </section>
  );
}
