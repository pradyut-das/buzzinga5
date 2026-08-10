/**
 * Comment bodies are TipTap JSON (older rows may be raw HTML). Every agent
 * surface — dashboard previews, tool results, spoken answers — needs the same
 * plain reading of them, so the flattening lives here once.
 */
export function plainTextFromContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parts: string[] = [];
      const walk = (node: unknown) => {
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (typeof node !== "object" || node === null) return;
        const typed = node as {
          type?: string;
          text?: string;
          attrs?: { label?: string };
          content?: unknown;
        };
        if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
        if (typed.type === "mention" && typed.attrs?.label) parts.push(`@${typed.attrs.label}`);
        if (typed.content) walk(typed.content);
      };
      walk(JSON.parse(trimmed));
      return parts.join(" ").replace(/\s+/g, " ").trim();
    } catch {
      // Fall through to the HTML path for malformed JSON.
    }
  }
  return trimmed
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wraps plain text back into the minimal TipTap document the editor expects. */
export function contentFromPlainText(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim())
      .map((paragraph) => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph.trim() }],
      })),
  });
}
