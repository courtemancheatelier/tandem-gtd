"use client";

import React, { useEffect, useRef } from "react";
import { Extension } from "@tiptap/core";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { createRoot, type Root } from "react-dom/client";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { getEditorExtensions } from "./extensions";
import { EditorBubbleMenu } from "./EditorBubbleMenu";
import { SlashCommand, getSlashCommandItems } from "./SlashCommandExtension";
import { SlashCommandMenu, type SlashCommandMenuRef } from "./SlashCommandMenu";
import {
  WikiLinkSuggestionMenu,
  type WikiLinkSuggestionRef,
} from "./WikiLinkSuggestion";
import type { SlashCommandItem } from "./SlashCommandExtension";
import type { WikiSuggestion } from "@/lib/hooks/use-wiki-autocomplete";
import "./editor-styles.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdownStorage(editor: Editor): any {
  return (editor.storage as unknown as Record<string, any>).markdown; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const wikiLinkPluginKey = new PluginKey("wikiLinkSuggestion");

// Module-level wiki article cache (avoids React ref closure issues)
let _wikiCache: WikiSuggestion[] = [];
let _wikiCacheReady = false;
function prefetchWikiCache(teamId?: string | null) {
  fetchWikiSuggestions("", teamId).then((results) => {
    _wikiCache = results;
    _wikiCacheReady = true;
  });
}

interface TiptapEditorProps {
  content: string;
  teamId?: string | null;
  onSave?: (markdown: string) => void;
  onEditorReady?: (editor: Editor) => void;
  editable?: boolean;
}

function fetchWikiSuggestions(
  query: string,
  teamId?: string | null,
  signal?: AbortSignal
): Promise<WikiSuggestion[]> {
  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (teamId) {
    params.set("teamId", teamId);
    params.set("includePersonal", "true");
  } else {
    params.set("scope", "all");
  }
  return fetch(`/api/wiki?${params}`, { signal })
    .then((res) => (res.ok ? res.json() : { articles: [] }))
    .then((data) => {
      // API returns { articles: [...] } for listings, or flat array for search
      const list = Array.isArray(data) ? data : (data.articles || []);
      return list.slice(0, 8).map(
        (a: WikiSuggestion & { teamId?: string | null }) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          teamId: a.teamId || null,
        })
      );
    })
    .catch(() => []);
}

export function TiptapEditor({
  content,
  teamId,
  onSave,
  onEditorReady,
  editable = true,
}: TiptapEditorProps) {
  const slashMenuRef = useRef<SlashCommandMenuRef>(null);
  const wikiLinkMenuRef = useRef<WikiLinkSuggestionRef>(null);
  const onSaveRef = useRef(onSave);
  const teamIdRef = useRef(teamId);
  onSaveRef.current = onSave;
  teamIdRef.current = teamId;

  // Pre-fetch wiki articles into module-level cache
  const fetchStarted = useRef(false);
  if (!fetchStarted.current) {
    fetchStarted.current = true;
    prefetchWikiCache(teamId);
  }

  const editor = useEditor({
    extensions: [
      ...getEditorExtensions(),
      // Wiki link suggestion: [[
      Extension.create({
        name: "wikiLinkSuggestion",
        addProseMirrorPlugins() {
          return [
            Suggestion({
              editor: this.editor,
              pluginKey: wikiLinkPluginKey,
              char: "[[",
              items: ({ query }: { query: string }) => {
                if (!_wikiCacheReady || _wikiCache.length === 0) {
                  return [{ id: "_loading", slug: "", title: "Loading articles..." }];
                }
                if (!query) return _wikiCache;
                const filtered = _wikiCache.filter((a) =>
                  a.title.toLowerCase().includes(query.toLowerCase())
                );
                return filtered.length > 0 ? filtered : [{ id: "_none", slug: "", title: "No matches" }];
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              command: ({ editor: ed, range, props }: any) => {
                ed.chain()
                  .focus()
                  .deleteRange(range)
                  .insertContent({ type: "wikiLink", attrs: { title: props.title } })
                  .run();
              },
              render: () => {
                let popup: HTMLElement | null = null;
                let reactRoot: Root | null = null;
                function renderMenu(menuItems: WikiSuggestion[], menuCommand: (item: WikiSuggestion) => void) {
                  if (!reactRoot || !popup) return;
                  reactRoot.render(
                    React.createElement(WikiLinkSuggestionMenu, { ref: wikiLinkMenuRef, items: menuItems, command: menuCommand })
                  );
                }
                return {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onStart: (props: any) => {
                    popup = document.createElement("div");
                    popup.style.position = "absolute";
                    popup.style.zIndex = "50";
                    popup.addEventListener("mousedown", (e) => e.preventDefault());
                    document.body.appendChild(popup);
                    reactRoot = createRoot(popup);
                    const rect = props.clientRect?.();
                    if (rect) { popup.style.left = `${rect.left}px`; popup.style.top = `${rect.bottom + 4}px`; }
                    renderMenu(props.items, props.command);
                  },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onUpdate: (props: any) => {
                    renderMenu(props.items, props.command);
                    const rect = props.clientRect?.();
                    if (rect && popup) { popup.style.left = `${rect.left}px`; popup.style.top = `${rect.bottom + 4}px`; }
                  },
                  onKeyDown: (props: { event: KeyboardEvent }) => {
                    if (props.event.key === "Escape") { reactRoot?.unmount(); popup?.remove(); popup = null; reactRoot = null; return true; }
                    return wikiLinkMenuRef.current?.onKeyDown(props) ?? false;
                  },
                  onExit: () => { reactRoot?.unmount(); popup?.remove(); popup = null; reactRoot = null; },
                };
              },
            }),
          ];
        },
      }),
      // Slash commands: /
      SlashCommand.configure({
        suggestion: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          command: ({ editor: ed, range, props: item }: any) => {
            item.command({ editor: ed.chain().focus(), range });
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: ({ query }: any) => {
            const items = getSlashCommandItems();
            if (!query) return items;
            return items.filter((item: SlashCommandItem) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            );
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          render: (): any => {
            let popup: HTMLElement | null = null;
            let reactRoot: Root | null = null;
            function renderMenu(items: SlashCommandItem[], command: (item: SlashCommandItem) => void) {
              if (!reactRoot || !popup) return;
              reactRoot.render(React.createElement(SlashCommandMenu, { ref: slashMenuRef, items, command }));
            }
            return {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onStart: (props: any) => {
                popup = document.createElement("div");
                popup.style.position = "absolute";
                popup.style.zIndex = "50";
                popup.addEventListener("mousedown", (e) => e.preventDefault());
                document.body.appendChild(popup);
                reactRoot = createRoot(popup);
                const rect = props.clientRect?.();
                if (rect) { popup.style.left = `${rect.left}px`; popup.style.top = `${rect.bottom + 4}px`; }
                renderMenu(props.items, props.command);
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onUpdate: (props: any) => {
                renderMenu(props.items, props.command);
                const rect = props.clientRect?.();
                if (rect && popup) { popup.style.left = `${rect.left}px`; popup.style.top = `${rect.bottom + 4}px`; }
              },
              onKeyDown: (props: { event: KeyboardEvent }) => {
                if (props.event.key === "Escape") { reactRoot?.unmount(); popup?.remove(); popup = null; reactRoot = null; return true; }
                return slashMenuRef.current?.onKeyDown(props) ?? false;
              },
              onExit: () => { reactRoot?.unmount(); popup?.remove(); popup = null; reactRoot = null; },
            };
          },
        },
      }),
    ],
    content,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "wiki-content",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "s") {
          event.preventDefault();
          if (onSaveRef.current && editor) {
            onSaveRef.current(getMarkdownStorage(editor).getMarkdown());
          }
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMd = getMarkdownStorage(editor).getMarkdown();
      if (currentMd !== content) {
        editor.commands.setContent(content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor" data-tiptap-editor="">
      <EditorBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function getEditorMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}
