"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WikiTagBadge } from "./WikiTagBadge";
import { TiptapEditor, getEditorMarkdown } from "./editor/TiptapEditor";
import { EditorToolbar } from "./editor/EditorToolbar";
import { WikiLinkDropdown } from "@/components/ui/wiki-link-dropdown";
import { useWikiAutocomplete } from "@/lib/hooks/use-wiki-autocomplete";
import { useMarkdownToolbar } from "@/lib/hooks/use-markdown-toolbar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";

interface WikiRichEditorProps {
  initialTitle: string;
  initialContent: string;
  initialTags: string[];
  onSubmit: (data: {
    title: string;
    content: string;
    tags: string[];
    message?: string;
  }) => void;
  onCancel: () => void;
  loading?: boolean;
  submitLabel?: string;
  teamId?: string | null;
}

export function WikiRichEditor({
  initialTitle,
  initialContent,
  initialTags,
  onSubmit,
  onCancel,
  loading = false,
  submitLabel = "Save Changes",
  teamId,
}: WikiRichEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState("");
  const [sourceView, setSourceView] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [tiptapEditor, setTiptapEditor] = useState<Editor | null>(null);

  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Wiki autocomplete for source view textarea
  const {
    isOpen: acIsOpen,
    suggestions,
    activeIndex,
    dropdownPosition,
    handleChange: acHandleChange,
    handleKeyDown: acHandleKeyDown,
    handleSelect: acHandleSelect,
  } = useWikiAutocomplete(sourceTextareaRef, teamId);

  // Markdown toolbar for source view
  const { handleKeyDown: toolbarHandleKeyDown } =
    useMarkdownToolbar(sourceTextareaRef, setContent);

  const getMarkdownFromEditor = useCallback((): string => {
    if (tiptapEditor) {
      return getEditorMarkdown(tiptapEditor);
    }
    return content;
  }, [tiptapEditor, content]);

  const handleSave = useCallback(() => {
    const markdown = sourceView ? content : getMarkdownFromEditor();
    if (!title.trim() || !markdown.trim()) return;
    onSubmit({
      title: title.trim(),
      content: markdown,
      tags,
      ...(message.trim() ? { message: message.trim() } : {}),
    });
  }, [title, content, tags, message, sourceView, getMarkdownFromEditor, onSubmit]);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm("You have unsaved changes. Discard them?");
      if (!confirmed) return;
    }
    onCancel();
  }, [isDirty, onCancel]);

  const handleSourceToggle = useCallback(() => {
    if (sourceView) {
      // Switching from source back to WYSIWYG
      setSourceView(false);
    } else {
      // Switching from WYSIWYG to source
      const md = getMarkdownFromEditor();
      setContent(md);
      setSourceView(true);
    }
  }, [sourceView, getMarkdownFromEditor]);

  const handleEditorReady = useCallback((editor: Editor) => {
    setTiptapEditor(editor);
  }, []);

  // Track dirty state
  useEffect(() => {
    const tagsChanged = JSON.stringify(tags) !== JSON.stringify(initialTags);
    if (title !== initialTitle || tagsChanged) {
      setIsDirty(true);
    }
  }, [title, tags, initialTitle, initialTags]);

  // Mark dirty when editor content changes
  useEffect(() => {
    if (!tiptapEditor) return;
    const handler = () => setIsDirty(true);
    tiptapEditor.on("update", handler);
    return () => { tiptapEditor.off("update", handler); };
  }, [tiptapEditor]);

  // Global Cmd+S and Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        handleCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleCancel]);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function handleSourceTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    setIsDirty(true);
    acHandleChange(val, e.target.selectionStart);
  }

  function handleSourceTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (acHandleKeyDown(e)) return;
    if (toolbarHandleKeyDown(e)) return;
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="wiki-title">Title</Label>
        <Input
          id="wiki-title"
          placeholder="Article title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>

      {/* Editor */}
      <div className="space-y-2">
        <Label>Content</Label>
        <div className="rounded-md border border-input overflow-hidden">
          <EditorToolbar
            editor={tiptapEditor}
            sourceView={sourceView}
            onSourceToggle={handleSourceToggle}
          />
          {sourceView ? (
            <div className="relative">
              <textarea
                ref={sourceTextareaRef}
                value={content}
                onChange={handleSourceTextareaChange}
                onKeyDown={handleSourceTextareaKeyDown}
                className={cn(
                  "w-full min-h-[300px] px-4 py-3 text-sm bg-background resize-y",
                  "font-mono focus:outline-none"
                )}
                placeholder="Write markdown..."
              />
              {acIsOpen && suggestions.length > 0 && (
                <WikiLinkDropdown
                  suggestions={suggestions}
                  activeIndex={activeIndex}
                  position={dropdownPosition}
                  onSelect={acHandleSelect}
                />
              )}
            </div>
          ) : (
            <TiptapEditor
              content={content}
              teamId={teamId}
              onSave={handleSave}
              onEditorReady={handleEditorReady}
            />
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label htmlFor="wiki-tags">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="wiki-tags"
            placeholder="Add a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
          />
          <Button type="button" variant="outline" size="icon" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <WikiTagBadge key={tag} tag={tag} removable onRemove={removeTag} />
            ))}
          </div>
        )}
      </div>

      {/* Edit message */}
      <div className="space-y-2">
        <Label htmlFor="wiki-message">Edit Summary (optional)</Label>
        <Input
          id="wiki-message"
          placeholder="Describe what you changed..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Save / Cancel */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={loading || !title.trim()}
        >
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
