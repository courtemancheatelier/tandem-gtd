import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { WikiLink } from "./WikiLinkExtension";

interface EditorExtensionOptions {
  placeholder?: string;
}

export function getEditorExtensions(options: EditorExtensionOptions = {}) {
  const {
    placeholder = "Start writing, or type / for commands...",
  } = options;

  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Placeholder.configure({
      placeholder,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "text-primary underline hover:text-primary/80",
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: false,
      HTMLAttributes: {
        class: "wiki-table",
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({
      HTMLAttributes: {
        class: "max-w-full rounded-md my-3",
      },
    }),
    Highlight.configure({
      HTMLAttributes: {
        class: "bg-yellow-200/50 dark:bg-yellow-500/30 rounded px-0.5",
      },
    }),
    WikiLink,
    Markdown.configure({
      html: false,
      tightLists: true,
      bulletListMarker: "-",
      transformPastedText: true,
    }),
  ];
}
