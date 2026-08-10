"use client";

import { useEffect, useRef, useState } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import type { ContributorColor } from "@/db/schema";
import { saveTaskDoc } from "@/actions/task-workspace";

/**
 * The task's writing. Every task is this document plus the people and comments
 * around it.
 *
 * Saving is a debounce, not a button: the editor is the document.
 */
export function TaskDoc({
  taskId,
  doc,
  contributors,
  placeholder = "Write the brief. Headings, lists, checkboxes and @mentions all work.",
  editable = true,
}: {
  taskId: string;
  doc: string | null;
  contributors: { id: string; name: string; color: ContributorColor }[];
  placeholder?: string;
  editable?: boolean;
}) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const handleChange = (content: string) => {
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveTaskDoc(taskId, content).then(() => setSaved("saved"));
    }, 700);
  };

  return (
    <div className="sq-doc">
      <div className="sq-doc-head">
        <div>
          <span className="sq-eyebrow">Brief</span>
          <h3>The write-up</h3>
          <p className="sq-sub">The source of truth for what this piece needs to communicate.</p>
        </div>
        <span className={`sq-save-state is-${saved}`} aria-live="polite">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : "Auto-saves"}
        </span>
      </div>
      <RichTextEditor
        content={doc ?? undefined}
        editable={editable}
        placeholder={placeholder}
        contributors={contributors}
        onChange={editable ? handleChange : undefined}
        className="sq-doc-editor"
      />
    </div>
  );
}
