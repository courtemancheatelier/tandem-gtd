"use client";

import React, { useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Table as TableIcon,
  Undo,
  Redo,
  Code2,
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor | null;
  sourceView: boolean;
  onSourceToggle: () => void;
}

export function EditorToolbar({
  editor,
  sourceView,
  onSourceToggle,
}: EditorToolbarProps) {
  const getBlockType = useCallback((): string => {
    if (!editor) return "paragraph";
    if (editor.isActive("heading", { level: 1 })) return "h1";
    if (editor.isActive("heading", { level: 2 })) return "h2";
    if (editor.isActive("heading", { level: 3 })) return "h3";
    if (editor.isActive("blockquote")) return "blockquote";
    if (editor.isActive("codeBlock")) return "codeBlock";
    return "paragraph";
  }, [editor]);

  const setBlockType = useCallback(
    (value: string) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      switch (value) {
        case "paragraph":
          chain.setParagraph().run();
          break;
        case "h1":
          chain.toggleHeading({ level: 1 }).run();
          break;
        case "h2":
          chain.toggleHeading({ level: 2 }).run();
          break;
        case "h3":
          chain.toggleHeading({ level: 3 }).run();
          break;
        case "blockquote":
          chain.toggleBlockquote().run();
          break;
        case "codeBlock":
          chain.toggleCodeBlock().run();
          break;
      }
    },
    [editor]
  );

  const insertLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL:", "https://");
    if (!url) return;
    const alt = window.prompt("Alt text (optional):", "") || "";
    editor.chain().focus().setImage({ src: url, alt }).run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }, [editor]);

  if (!editor) return null;

  const disabled = sourceView;

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-border px-2 py-1.5 bg-muted/30">
      {/* Block type */}
      <Select
        value={getBlockType()}
        onValueChange={setBlockType}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Paragraph</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
          <SelectItem value="h3">Heading 3</SelectItem>
          <SelectItem value="blockquote">Blockquote</SelectItem>
          <SelectItem value="codeBlock">Code Block</SelectItem>
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text formatting */}
      <ToolbarButton
        icon={Bold}
        label="Bold (Cmd+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={Italic}
        label="Italic (Cmd+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={Code}
        label="Inline Code (Cmd+E)"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={disabled}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <ToolbarButton
        icon={List}
        label="Bullet List"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Ordered List"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={ListChecks}
        label="Task List"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        disabled={disabled}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Insert */}
      <ToolbarButton
        icon={LinkIcon}
        label="Insert Link (Cmd+K)"
        onClick={insertLink}
        disabled={disabled}
      />
      <ToolbarButton
        icon={ImageIcon}
        label="Insert Image"
        onClick={insertImage}
        disabled={disabled}
      />
      <ToolbarButton
        icon={Minus}
        label="Horizontal Rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        disabled={disabled}
      />
      <ToolbarButton
        icon={TableIcon}
        label="Insert Table"
        onClick={insertTable}
        disabled={disabled}
      />

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Undo/Redo */}
      <ToolbarButton
        icon={Undo}
        label="Undo (Cmd+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
      />
      <ToolbarButton
        icon={Redo}
        label="Redo (Cmd+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
      />

      <div className="flex-1" />

      {/* Source toggle */}
      <ToolbarButton
        icon={Code2}
        label="Source View"
        active={sourceView}
        onClick={onSourceToggle}
      />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-8 w-8 p-0 ${active ? "bg-muted text-foreground" : "text-muted-foreground"}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
