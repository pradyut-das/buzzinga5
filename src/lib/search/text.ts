/**
 * Block-level text utilities for docs intelligence.
 *
 * Search operates on the same TipTap JSON that task docs and comments are
 * stored as. Every top-level node becomes one searchable block, so a result
 * can deep-link to the exact element that matched instead of the whole page.
 */

export interface SearchBlockLeaf {
  /** 0-based position of the block inside its document. */
  blockIndex: number;
  /** Stable per-block id stamped by the editor; null for legacy docs. */
  blockId: string | null;
  /** Plain text of the block, mentions flattened to @label. */
  text: string;
}

/** Collects the plain text of a TipTap node tree. */
function nodeText(node: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const typed = value as {
      type?: string;
      text?: string;
      attrs?: { label?: string };
      content?: unknown;
    };
    if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
    if (typed.type === "mention" && typed.attrs?.label) parts.push(`@${typed.attrs.label}`);
    if (typed.content) walk(typed.content);
  };
  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Splits a TipTap document into one searchable block per top-level node. */
export function flattenDocBlocks(content: string): SearchBlockLeaf[] {
  const trimmed = content?.trim();
  if (!trimmed) return [];
  // Raw HTML rows (legacy comments) are handled by the caller as one block.
  if (!trimmed.startsWith("{")) return [];
  try {
    const doc = JSON.parse(trimmed) as { type?: string; content?: unknown[] };
    if (doc?.type !== "doc" || !Array.isArray(doc.content)) return [];
    const blocks: SearchBlockLeaf[] = [];
    doc.content.forEach((block, blockIndex) => {
      const text = nodeText(block);
      if (!text) return;
      const attrs = (block as { attrs?: { blockId?: string | null } } | null)?.attrs;
      // blockIndex is the true position inside doc.content so a result can
      // point at the exact DOM node, even when neighbours have no text.
      blocks.push({ blockIndex, blockId: attrs?.blockId ?? null, text });
    });
    return blocks;
  } catch {
    return [];
  }
}

/** Plain-text fallback for content that is not TipTap JSON (legacy HTML). */
export function htmlToPlainText(content: string): string {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reciprocal-rank fusion. Merges two independently ranked lists into one
 * ordering; a result that ranks well in both arms outranks one found by a
 * single arm. `k` softens the score so no single list dominates.
 */
export function rrfFuse<T>(
  keyword: T[],
  semantic: T[],
  key: (item: T) => string,
  k = 60,
): T[] {
  const scores = new Map<string, { item: T; score: number; order: number }>();
  const push = (list: T[]) => {
    for (const [rank, item] of list.entries()) {
      const id = key(item);
      const entry = scores.get(id) ?? { item, score: 0, order: scores.size };
      entry.score += 1 / (k + rank + 1);
      scores.set(id, entry);
    }
  };
  push(keyword);
  push(semantic);
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.item);
}

/** Escapes a string so it is safe to render as HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a snippet around the first query-term match, wrapping every term
 * occurrence in `<mark>`. Falls back to a plain leading window when no term
 * matches (semantic-only hits), so the snippet is always safe to render.
 */
export function buildSnippet(text: string, terms: string[], radius = 12): string {
  const lowered = terms.map((term) => term.toLowerCase()).filter((term) => term.length > 0);
  const haystack = text.toLowerCase();

  let start = 0;
  if (lowered.length > 0) {
    let best = -1;
    for (const term of lowered) {
      const index = haystack.indexOf(term);
      if (index !== -1 && (best === -1 || index < best)) best = index;
    }
    if (best !== -1) start = Math.max(0, best - radius);
  }

  const window = text.slice(start, start + radius * 2 + 80);
  let html = escapeHtml(window);
  for (const term of lowered) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = start + window.length < text.length ? "…" : "";
  return prefix + html + suffix;
}
