"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminPendingNotification, AdminSentEmail } from "@/lib/admin/queries";
import {
  adminDiscardAllPendingNotifications,
  adminDiscardPendingNotifications,
  type AdminResult,
} from "@/actions/admin";

/**
 * Notification delivery: what is queued, and what actually went out.
 *
 * The queue is the actionable half — a backlog here means the digest cron has
 * stopped draining it, and discarding is the only way to stop a stale import
 * from mailing everyone at once. The sent log below is read-only evidence.
 */

function when(at: Date | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminEmailPanel({
  queued,
  sent,
}: {
  queued: AdminPendingNotification[];
  sent: AdminSentEmail[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function run(action: () => Promise<AdminResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(successMessage);
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Queued notifications</h2>
          <span className="sq-sub">
            {queued.length} waiting{pending && " · saving…"}
          </span>
        </div>

        {queued.length === 0 ? (
          <p className="sq-sub">
            The queue is empty — every notification raised so far has been sent.
          </p>
        ) : (
          <>
            <div className="sq-admin-form">
              <button
                type="button"
                className="sq-pill"
                disabled={selected.size === 0}
                onClick={() =>
                  run(
                    () => adminDiscardPendingNotifications([...selected]),
                    `Discarded ${selected.size} notification(s)`,
                  )
                }
              >
                Discard selected ({selected.size})
              </button>
              <button
                type="button"
                className="sq-pill"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Discard all ${queued.length} queued notifications without sending them?`,
                    )
                  ) {
                    return;
                  }
                  run(adminDiscardAllPendingNotifications, "Queue cleared");
                }}
              >
                Discard all
              </button>
            </div>

            <table className="sq-table">
              <thead>
                <tr>
                  <th />
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Task</th>
                  <th>Board</th>
                  <th>Raised</th>
                </tr>
              </thead>
              <tbody>
                {queued.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`Select notification for ${row.recipientName}`}
                      />
                    </td>
                    <td>
                      {row.recipientName}
                      {!row.recipientEmail && <span className="sq-tag">no address</span>}
                    </td>
                    <td>{row.type}</td>
                    <td>{row.taskTitle}</td>
                    <td>{row.boardTitle}</td>
                    <td>{when(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Sent email</h2>
          <span className="sq-sub">Most recent {sent.length}</span>
        </div>
        {sent.length === 0 ? (
          <p className="sq-sub">No email has been sent yet.</p>
        ) : (
          <table className="sq-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>To</th>
                <th>Subject</th>
                <th>Board</th>
                <th>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {sent.map((row) => (
                <tr key={row.id}>
                  <td>{when(row.createdAt)}</td>
                  <td>
                    {row.recipientName}
                    <br />
                    <span className="sq-sub">{row.recipientEmail}</span>
                  </td>
                  <td>{row.subject}</td>
                  <td>{row.boardTitle}</td>
                  <td>
                    {/* Rows are written in every environment; only production
                        hands them to Resend, so "logged" is normal locally. */}
                    <span
                      className={`sq-status-chip ${row.sentToResend ? "tone-green" : "tone-amber"}`}
                    >
                      {row.sentToResend ? "sent" : "logged only"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
