"use client";

import { Bell, Building2, LogOut, Users, Waves } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function SettingsView({
  user,
  voiceEnabled,
}: {
  user: { name: string; email: string };
  voiceEnabled: boolean;
}) {
  const [section, setSection] = useState("Voice");
  const items = [
    ["Workspace", Building2],
    ["Notifications", Bell],
    ["Voice", Waves],
    ["Team", Users],
  ] as const;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="h-fit rounded-[18px] border border-line bg-white p-3 shadow-soft">
        {items.map(([label, Icon]) => (
          <button
            type="button"
            key={label}
            onClick={() => setSection(label)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-sm font-medium ${
              section === label ? "bg-[#fff3cc] text-[#8a6100]" : "text-[#475467] hover:bg-slate-50"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden /> {label}
          </button>
        ))}
      </aside>
      <div className="space-y-5">
        <section className="rounded-[18px] border border-line bg-white p-6 shadow-soft sm:p-7">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">{section}</h2>
          {section === "Voice" && (
            <div className="mt-6 space-y-5">
              <Detail label="Provider" value={voiceEnabled ? "Gemini Live" : "Not configured"} />
              <Detail label="Write safety" value="On-screen confirmation required" />
              <Detail
                label="Capabilities"
                value="Create, update, review, and query real board data"
              />
              <div className="rounded-[14px] bg-[#f5f9ff] px-4 py-4">
                <div className="text-sm font-semibold">Voice planner</div>
                <div className="mt-1.5 text-sm text-muted">
                  Voice changes use the same authenticated tool registry as Squirrl’s text agent.
                </div>
              </div>
            </div>
          )}
          {section === "Workspace" && (
            <div className="mt-6 space-y-4">
              <Detail label="Workspace" value="Squirrl Agency" />
              <Detail label="Signed in as" value={`${user.name} · ${user.email}`} />
            </div>
          )}
          {section === "Notifications" && (
            <div className="mt-6 rounded-[14px] bg-slate-50 p-5 text-sm leading-6 text-muted">
              Task, comment, mention, assignment, move, and priority updates continue through
              Squirrl’s real notification digest queue.
            </div>
          )}
          {section === "Team" && (
            <div className="mt-6">
              <p className="text-sm leading-6 text-muted">
                Contributors remain scoped to each board and are managed from task details.
              </p>
              <Link
                href="/clients"
                className="mt-4 inline-flex text-sm font-semibold text-accent-foreground"
              >
                Open client boards →
              </Link>
            </div>
          )}
        </section>
        <section className="rounded-[18px] border border-line bg-white p-6 shadow-soft sm:p-7">
          <h2 className="text-xl font-semibold">Account</h2>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{user.name}</div>
              <div className="mt-1 text-sm text-muted">{user.email}</div>
            </div>
            <SignOutButton className="h-11 rounded-xl border border-line bg-white px-4 text-[#475467] hover:bg-slate-50" />
          </div>
        </section>
        <div className="flex items-center gap-2 text-sm text-muted">
          <LogOut className="h-4 w-4" aria-hidden /> Session controls use Squirrl authentication.
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[210px_1fr] sm:items-center">
      <div className="text-sm font-medium">{label}</div>
      <div className="rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-[#475467]">
        {value}
      </div>
    </div>
  );
}
