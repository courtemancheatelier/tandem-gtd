import { Extension } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";

const SlashCommandPluginKey = new PluginKey("slashCommandSuggestion");

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: (props: { editor: any; range: { from: number; to: number } }) => void;
}

export interface SlashCommandOptions {
  suggestion: Partial<SuggestionOptions>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: SlashCommandPluginKey,
        ...this.options.suggestion,
      }),
    ];
  },
});

export function getSlashCommandItems(): SlashCommandItem[] {
  return [
    {
      title: "Heading 1",
      description: "Large section heading",
      icon: "h1",
      command: ({ editor, range }) => {
        editor.deleteRange(range).setNode("heading", { level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      icon: "h2",
      command: ({ editor, range }) => {
        editor.deleteRange(range).setNode("heading", { level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      icon: "h3",
      command: ({ editor, range }) => {
        editor.deleteRange(range).setNode("heading", { level: 3 }).run();
      },
    },
    {
      title: "Bullet List",
      description: "Unordered list",
      icon: "list",
      command: ({ editor, range }) => {
        editor.deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: "Numbered List",
      description: "Ordered list",
      icon: "listOrdered",
      command: ({ editor, range }) => {
        editor.deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: "Task List",
      description: "Checklist with checkboxes",
      icon: "listChecks",
      command: ({ editor, range }) => {
        editor.deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: "Table",
      description: "Insert a 3×3 table",
      icon: "table",
      command: ({ editor, range }) => {
        editor.deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      title: "Code Block",
      description: "Fenced code block",
      icon: "code",
      command: ({ editor, range }) => {
        editor.deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: "Blockquote",
      description: "Block quotation",
      icon: "quote",
      command: ({ editor, range }) => {
        editor.deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: "Divider",
      description: "Horizontal rule",
      icon: "minus",
      command: ({ editor, range }) => {
        editor.deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: "Image",
      description: "Insert image from URL",
      icon: "image",
      command: ({ editor, range }) => {
        const url = window.prompt("Image URL:", "https://");
        if (!url) {
          editor.deleteRange(range).run();
          return;
        }
        const alt = window.prompt("Alt text (optional):", "") || "";
        editor.deleteRange(range).setImage({ src: url, alt }).run();
      },
    },
    {
      title: "Wiki Link",
      description: "Link to another wiki article",
      icon: "link",
      command: ({ editor, range }) => {
        editor.deleteRange(range).insertContent("[[").run();
      },
    },
  ];
}
