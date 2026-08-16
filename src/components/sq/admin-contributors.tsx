"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CONTRIBUTOR_COLORS } from "@/db/schema";
import type { AdminContributor } from "@/lib/admin/queries";
import {
  adminDeleteContributor,
  adminSetContributorSubscribed,
  adminUpdateContributor,
  type AdminResult,
} from "@/actions/admin";

/**
 * Board people, listed flat across every board.
 *
 * The column that matters is the address: a contributor with no email, or one
 * who has unsubscribed, silently receives nothing, and "they never got the
 * digest" is the report this table exists to answer.
 */

export function AdminContributorsPanel({ contributors }: { contributors: AdminContributor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  function run(action: () => Promise<AdminResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return contributors;
    return contributors.filter((row) =>
      [row.name, row.email ?? "", row.boardTitle].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [contributors, filter]);

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>People on boards</h2>
        <span className="sq-sub">
          {contributors.length} across all boards
          {pending && " · saving…"}
        </span>
      </div>

      <form className="sq-admin-form" onSubmit={(event) => event.preventDefault()}>
        <input
          placeholder="Filter by name, email or board"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Board</th>
            <th>Tasks</th>
            <th>Mail</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            editing === row.id ? (
              <ContributorEditRow
                key={row.id}
                contributor={row}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateContributor(row.id, values), "Person updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={row.id}>
                <td>
                  {row.name}
                  {!row.userId && <span className="sq-tag">no account</span>}
                </td>
                <td>{row.email ?? <span className="sq-sub">no address</span>}</td>
                <td>{row.boardTitle}</td>
                <td>{row.taskCount}</td>
                <td>
                  <span
                    className={`sq-status-chip ${
                      row.unsubscribedAt ? "tone-red" : row.email ? "tone-green" : "tone-amber"
                    }`}
                  >
                    {row.unsubscribedAt ? "unsubscribed" : row.email ? "on" : "no address"}
                  </span>
                </td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(row.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () => adminSetContributorSubscribed(row.id, Boolean(row.unsubscribedAt)),
                        row.unsubscribedAt ? "Re-subscribed" : "Unsubscribed",
                      )
                    }
                  >
                    {row.unsubscribedAt ? "Re-subscribe" : "Unsubscribe"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const typed = window.prompt(
                        `Type "${row.name}" to remove them from ${row.boardTitle}.`,
                      );
                      if (typed?.trim() !== row.name) return;
                      run(() => adminDeleteContributor(row.id), "Person removed");
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {rows.length === 0 && <p className="sq-sub">Nobody matches that filter.</p>}
    </section>
  );
}

function ContributorEditRow({
  contributor,
  onSave,
  onCancel,
}: {
  contributor: AdminContributor;
  onSave: (values: { name: string; email: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: contributor.name,
    email: contributor.email ?? "",
    color: contributor.color,
  });

  return (
    <tr>
      <td>
        <input
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </td>
      <td>
        <input
          placeholder="Email (optional)"
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
        />
      </td>
      <td>{contributor.boardTitle}</td>
      <td>{contributor.taskCount}</td>
      <td>
        <select
          value={values.color}
          onChange={(event) => setValues({ ...values, color: event.target.value })}
        >
          {CONTRIBUTOR_COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
      </td>
      <td className="sq-row-actions">
        <button type="button" onClick={() => onSave(values)}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
