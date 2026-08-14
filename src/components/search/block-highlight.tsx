"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Flashes the exact block a search result pointed at.
 *
 * Deep links carry `blockId` (stable id, not stamped yet) and/or `blockIndex`
 * (position of the block inside the task doc). Once the task doc editor has
 * rendered, the target block gets a temporary highlight and is scrolled into
 * view. Polling covers the brief window while the task sidebar loads.
 */
export function BlockHighlight({ taskId }: { taskId: string | null }) {
  const searchParams = useSearchParams();
  const blockId = searchParams.get("blockId");
  const rawIndex = searchParams.get("blockIndex");

  useEffect(() => {
    if (!taskId || (!blockId && rawIndex === null)) return;
    const index = rawIndex !== null ? Number.parseInt(rawIndex, 10) : null;
    if (rawIndex !== null && Number.isNaN(index as number)) return;

    const FLASH_MS = 2600;
    const find = (): HTMLElement | null => {
      const editor = document.querySelector<HTMLElement>(
        ".sq-doc-editor .ProseMirror",
      );
      if (!editor) return null;
      const children = [...editor.children] as HTMLElement[];
      if (blockId) {
        const stamped = children.find((child) => child.dataset.blockId === blockId);
        if (stamped) return stamped;
      }
      if (index !== null && index < children.length) return children[index]!;
      return null;
    };

    let cancelled = false;
    let tries = 0;
    let lastElement: HTMLElement | null = null;
    const startedAt = Date.now();

    const tick = () => {
      if (cancelled) return;
      const element = find();
      if (element) {
        lastElement = element;
        if (tries === 0) element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("search-block-flash");
      }
      if (Date.now() - startedAt >= FLASH_MS) {
        if (lastElement) lastElement.classList.remove("search-block-flash");
        return;
      }
      tries += 1;
      if (tries < 60) window.setTimeout(tick, 120);
    };
    tick();

    return () => {
      cancelled = true;
      if (lastElement) lastElement.classList.remove("search-block-flash");
    };
  }, [taskId, blockId, rawIndex]);

  return null;
}
