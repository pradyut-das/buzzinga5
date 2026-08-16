"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CONTRIBUTOR_COLORS } from "@/db/schema";
import type { AdminBoard, AdminTag } from "@/lib/admin/queries";
import { adminCreateTag, adminDeleteTag, adminUpdateTag, type AdminResult } from "@/actions/admin";

/**
 * Tags, per board. Deleting one keeps the tasks and drops the label, which is
 * why this delete asks for a plain confirm rather than the name back — nothing
 * is lost that cannot be re-applied.
 */

export function AdminTagsPanel({ tags, boards }: { tags: AdminTag[]; boards: AdminBoard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    boardId: boards[0]?.id ?? "",
    name: "",
    color: CONTRIBUTOR_COLORS[0] as string,
  });
  const [editing, setEditing] = useState<string | null>(null);

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

  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>Tags</h2>
        <span className="sq-sub">
          {tags.length} across all boards{pending && " · saving…"}
        </span>
      </div>

      <form
        className="sq-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => adminCreateTag(draft), "Tag created");
          setDraft({ ...draft, name: "" });
        }}
      >
        <select
          value={draft.boardId}
          onChange={(event) => setDraft({ ...draft, boardId: event.target.value })}
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </select>
        <input
          placeholder="Tag name"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <select
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
        >
          {CONTRIBUTOR_COLORS.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>
        <button type="submit" className="sq-pill amber">
          Add tag
        </button>
      </form>

      <table className="sq-table">
        <thead>
          <tr>
            <th>Board</th>
            <th>Name</th>
            <th>Color</th>
            <th>Tasks</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) =>
            editing === tag.id ? (
              <TagEditRow
                key={tag.id}
                tag={tag}
                onCancel={() => setEditing(null)}
                onSave={(values) => {
                  run(() => adminUpdateTag(tag.id, values), "Tag updated");
                  setEditing(null);
                }}
              />
            ) : (
              <tr key={tag.id}>
                <td>{tag.boardTitle}</td>
                <td>{tag.name}</td>
                <td>
                  <span className="sq-tag">{tag.color}</span>
                </td>
                <td>{tag.taskCount}</td>
                <td className="sq-row-actions">
                  <button type="button" onClick={() => setEditing(tag.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove "${tag.name}" from ${tag.taskCount} task(s)? The tasks stay.`,
                        )
                      ) {
                        return;
                      }
                      run(() => adminDeleteTag(tag.id), "Tag deleted");
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {tags.length === 0 && <p className="sq-sub">No tags on any board yet.</p>}
    </section>
  );
}

function TagEditRow({
  tag,
  onSave,
  onCancel,
}: {
  tag: AdminTag;
  onSave: (values: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({ name: tag.name, color: tag.color });

  return (
    <tr>
      <td>{tag.boardTitle}</td>
      <td>
        <input
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </td>
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
      <td>{tag.taskCount}</td>
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
