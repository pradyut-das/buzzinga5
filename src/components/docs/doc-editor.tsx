"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Strikethrough,
  Text as TextIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveDocument } from "@/actions/docs";
import { FileAttachment } from "@/components/ui/tiptap-extensions/file-attachment";
import { ImageExtension } from "@/components/ui/tiptap-extensions/image-extension";
import { LoomEmbed } from "@/components/ui/tiptap-extensions/loom-embed";
import { YouTubeEmbed } from "@/components/ui/tiptap-extensions/youtube-embed";

type SaveState = "idle" | "saving" | "saved";

/** Inline marks apply to the selection, or to whatever you type next. */
const MARKS: Array<{ name: string; Icon: LucideIcon; label: string; run: (e: Editor) => void }> = [
  { name: "bold", Icon: Bold, label: "Bold", run: (e) => e.chain().focus().toggleBold().run() },
  {
    name: "italic",
    Icon: Italic,
    label: "Italic",
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    name: "strike",
    Icon: Strikethrough,
    label: "Strikethrough",
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  { name: "code", Icon: Code, label: "Code", run: (e) => e.chain().focus().toggleCode().run() },
];

/**
 * Block types, in the order a writer reaches for them. `isActive` args mirror
 * what the toggle sets so the menu highlights the block you are standing in.
 */
const BLOCKS: Array<{
  label: string;
  Icon: LucideIcon;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
}> = [
  {
    label: "Text",
    Icon: TextIcon,
    isActive: (e) =>
      e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList"),
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    label: "Heading 1",
    Icon: Heading1,
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: "Heading 2",
    Icon: Heading2,
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Heading 3",
    Icon: Heading3,
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "Bulleted list",
    Icon: List,
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    Icon: ListOrdered,
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "To-do list",
    Icon: ListTodo,
    isActive: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Quote",
    Icon: Quote,
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

function MenuButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
        active ? "bg-[#fff3cc] text-[#8a6100]" : "text-muted hover:bg-slate-100 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The doc *is* the page: no card and no framed input, so the text sits on the
 * canvas the way it will be read. The one piece of chrome is a bar that sticks
 * under the header while you scroll — block types first, then inline marks.
 */
export function DocEditor({ docId, content }: { docId: string; content: string | null }) {
  const [saved, setSaved] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "Write the brief. Headings, lists and checkboxes all work.",
      }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageExtension.configure({ inline: false, allowBase64: false }),
      FileAttachment,
      LoomEmbed,
      YouTubeEmbed,
    ],
    content: content ? JSON.parse(content) : undefined,
    editorProps: {
      attributes: {
        class: "sq-doc-prose focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      setSaved("saving");
      if (timer.current) clearTimeout(timer.current);
      const next = JSON.stringify(editor.getJSON());
      timer.current = setTimeout(() => {
        void saveDocument(docId, next).then(() => setSaved("saved"));
      }, 700);
    },
  });

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!editor) return null;

  return (
    <>
      <div className="sticky top-[82px] z-20 -mx-2 flex items-center justify-between gap-4 border-b border-line bg-canvas/90 px-2 pb-2 pt-1 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-1">
          {BLOCKS.map(({ label, Icon, isActive, run }) => (
            <MenuButton
              key={label}
              label={label}
              active={isActive(editor)}
              onClick={() => run(editor)}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </MenuButton>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {MARKS.map(({ name, Icon, label, run }) => (
            <MenuButton
              key={name}
              label={label}
              active={editor.isActive(name)}
              onClick={() => run(editor)}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </MenuButton>
          ))}
        </div>
        <span
          aria-live="polite"
          className={`shrink-0 text-xs font-medium ${
            saved === "saved" ? "text-emerald-600" : "text-muted"
          }`}
        >
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : "Auto-saves"}
        </span>
      </div>

      <EditorContent editor={editor} className="pt-6" />
    </>
  );
}
