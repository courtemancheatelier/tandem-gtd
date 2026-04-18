"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WikiTagBadge } from "./WikiTagBadge";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { WikiMarkdownRenderer } from "./WikiMarkdownRenderer";
import { WikiLinkDropdown } from "@/components/ui/wiki-link-dropdown";
import { useWikiAutocomplete } from "@/lib/hooks/use-wiki-autocomplete";
import { useMarkdownToolbar } from "@/lib/hooks/use-markdown-toolbar";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface WikiArticleFormProps {
  initialTitle?: string;
  initialContent?: string;
  initialTags?: string[];
  onSubmit: (data: { title: string; content: string; tags: string[]; message?: string }) => void;
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
  showMessage?: boolean;
  teamId?: string | null;
}

export function WikiArticleForm({
  initialTitle = "",
  initialContent = "",
  initialTags = [],
  onSubmit,
  onCancel,
  submitLabel = "Save",
  loading = false,
  showMessage = false,
  teamId,
}: WikiArticleFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [message, setMessage] = useState("");
  const [editorTab, setEditorTab] = useState<string>("write");
  const [debouncedContent, setDebouncedContent] = useState(content);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounce content for preview
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedContent(content), 200);
    return () => clearTimeout(timer);
  }, [content]);

  // Wiki autocomplete
  const {
    isOpen: acIsOpen,
    suggestions,
    activeIndex,
    dropdownPosition,
    handleChange: acHandleChange,
    handleKeyDown: acHandleKeyDown,
    handleSelect: acHandleSelect,
  } = useWikiAutocomplete(textareaRef, teamId);

  // Markdown toolbar
  const { executeAction, handleKeyDown: toolbarHandleKeyDown } = useMarkdownToolbar(
    textareaRef,
    setContent
  );

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

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    acHandleChange(val, e.target.selectionStart);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Autocomplete takes priority
    if (acHandleKeyDown(e)) return;
    // Then toolbar shortcuts
    if (toolbarHandleKeyDown(e)) return;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSubmit({
      title: title.trim(),
      content,
      tags,
      ...(showMessage && message.trim() ? { message: message.trim() } : {}),
    });
  }

  const textareaElement = (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id="wiki-content"
        placeholder="Write your article content in Markdown..."
        value={content}
        onChange={handleTextareaChange}
        onKeyDown={handleTextareaKeyDown}
        required
        rows={16}
        className={cn(
          "flex min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "font-mono text-sm resize-y"
        )}
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
  );

  const previewElement = (
    <div className="min-h-[300px] rounded-md border border-input bg-background px-4 py-3 overflow-y-auto">
      {debouncedContent ? (
        <WikiMarkdownRenderer content={debouncedContent} className="wiki-content" />
      ) : (
        <p className="text-muted-foreground text-sm italic">Nothing to preview</p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="space-y-2">
        <Label htmlFor="wiki-content">Content (Markdown)</Label>
        <MarkdownToolbar onAction={executeAction} />

        <Tabs value={editorTab} onValueChange={setEditorTab}>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="split">Split</TabsTrigger>
          </TabsList>

          <TabsContent value="write">
            {textareaElement}
          </TabsContent>

          <TabsContent value="preview">
            {previewElement}
          </TabsContent>

          <TabsContent value="split">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {textareaElement}
              {previewElement}
            </div>
          </TabsContent>
        </Tabs>
      </div>

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
              <WikiTagBadge
                key={tag}
                tag={tag}
                removable
                onRemove={removeTag}
              />
            ))}
          </div>
        )}
      </div>

      {showMessage && (
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
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !title.trim() || !content.trim()}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
