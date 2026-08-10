"use client";

import React, { useEffect, useRef, useMemo } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { ImageExtension } from "./tiptap-extensions/image-extension";
import { FileAttachment } from "./tiptap-extensions/file-attachment";
import { LoomEmbed } from "./tiptap-extensions/loom-embed";
import { YouTubeEmbed } from "./tiptap-extensions/youtube-embed";
import {
  createMentionExtension,
  type MentionContributor,
} from "./tiptap-extensions/mention-extension";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface RichTextEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  // Contributors for @mention suggestions
  contributors?: MentionContributor[];
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 w-7"
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-1" />;
}

interface ToolbarProps {
  editor: Editor;
}

function Toolbar({ editor }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1 border-b border-border bg-muted/30">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive("taskList")}
        title="Task List"
      >
        <ListTodo className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <div className="flex items-center justify-center h-4 w-4 text-[10px] font-mono font-bold">
          {"</>"}
        </div>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  content,
  onChange,
  editable = true,
  placeholder = "Write something...",
  className,
  contributors = [],
}: RichTextEditorProps) {
  const editorRef = useRef<Editor | null>(null);

  // Store contributors in a ref so the mention extension can access latest values
  const contributorsRef = useRef<MentionContributor[]>(contributors);
  useEffect(() => {
    contributorsRef.current = contributors;
  }, [contributors]);

  // Create mention extension with ref to contributors (memoized to avoid recreation)
  const mentionExtension = useMemo(
    () => createMentionExtension(contributorsRef),
    [], // Only create once - it reads from ref
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false, // Don't open links when clicking in edit mode
        autolink: true, // Auto-detect URLs when typing
        defaultProtocol: "https",
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2",
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true, // Allow nested task lists
      }),
      ImageExtension.configure({
        inline: false,
        allowBase64: false,
      }),
      FileAttachment,
      LoomEmbed,
      YouTubeEmbed,
      mentionExtension,
    ],
    content: content ? JSON.parse(content) : undefined,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] px-3 py-2",
          !editable && "min-h-0 p-0",
        ),
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(JSON.stringify(editor.getJSON()));
      }
    },
    // Prevent SSR hydration issues
    immediatelyRender: false,
  });

  // Keep ref in sync with editor
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync editor content when prop changes (e.g., when form is reset)
  useEffect(() => {
    if (!editor) return;

    const newContent = content ? JSON.parse(content) : null;
    const currentContent = editor.getJSON();

    // Only update if content actually changed (compare serialized versions)
    if (JSON.stringify(newContent) !== JSON.stringify(currentContent)) {
      editor.commands.setContent(newContent);
    }
  }, [editor, content]);

  if (!editor) {
    return null;
  }

  // Read-only mode: just render the content without toolbar or border
  if (!editable) {
    return (
      <div className={cn("rich-text-content", className)}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
        className,
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

// Recursively check if nodes contain any meaningful content
function hasRichTextContent(nodes: unknown[]): boolean {
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const n = node as {
      type?: string;
      content?: unknown[];
      text?: string;
      attrs?: Record<string, unknown>;
    };

    // Images, file attachments, video embeds, and mentions are meaningful content
    if (
      n.type === "image" ||
      n.type === "fileAttachment" ||
      n.type === "loomEmbed" ||
      n.type === "youtubeEmbed" ||
      n.type === "mention"
    ) {
      return true;
    }

    // Text nodes with actual text
    if (n.text && n.text.trim().length > 0) {
      return true;
    }

    // Recursively check children
    if (n.content && hasRichTextContent(n.content)) {
      return true;
    }
  }
  return false;
}

// Helper to check if content is empty
export function isRichTextEmpty(content: string | undefined): boolean {
  if (!content) return true;
  try {
    const json = JSON.parse(content);
    if (!json.content || json.content.length === 0) return true;
    return !hasRichTextContent(json.content);
  } catch {
    return true;
  }
}
