/**
 * @jest-environment jsdom
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
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
import { WikiLink } from "@/components/wiki/editor/WikiLinkExtension";

function createEditor(content: string = ""): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Highlight,
      WikiLink.configure({ suggestion: {} }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
      }),
    ],
    content,
  });
}

function roundTrip(markdown: string): string {
  const editor = createEditor(markdown);
  const result = (editor.storage as Record<string, any>).markdown.getMarkdown(); // eslint-disable-line @typescript-eslint/no-explicit-any
  editor.destroy();
  return result;
}

function normalize(s: string): string {
  return s.trim().replace(/\r\n/g, "\n");
}

describe("Wiki Markdown Round-Trip", () => {
  describe("basic formatting", () => {
    it("preserves bold text", () => {
      expect(normalize(roundTrip("**bold text**"))).toBe("**bold text**");
    });

    it("preserves italic text", () => {
      expect(normalize(roundTrip("*italic text*"))).toBe("*italic text*");
    });

    it("preserves strikethrough", () => {
      expect(normalize(roundTrip("~~struck~~"))).toBe("~~struck~~");
    });

    it("preserves inline code", () => {
      expect(normalize(roundTrip("`inline code`"))).toBe("`inline code`");
    });

    it("preserves mixed inline formatting", () => {
      const input = "Some **bold** and *italic* and `code` text";
      expect(normalize(roundTrip(input))).toBe(input);
    });
  });

  describe("headings", () => {
    it("preserves h1", () => {
      expect(normalize(roundTrip("# Heading 1"))).toBe("# Heading 1");
    });

    it("preserves h2", () => {
      expect(normalize(roundTrip("## Heading 2"))).toBe("## Heading 2");
    });

    it("preserves h3", () => {
      expect(normalize(roundTrip("### Heading 3"))).toBe("### Heading 3");
    });
  });

  describe("lists", () => {
    it("preserves bullet lists", () => {
      const input = "- Item 1\n- Item 2\n- Item 3";
      expect(normalize(roundTrip(input))).toBe(input);
    });

    it("preserves ordered lists", () => {
      const input = "1. First\n2. Second\n3. Third";
      expect(normalize(roundTrip(input))).toBe(input);
    });

    it("preserves task lists with checked and unchecked", () => {
      const input = "- [ ] Todo\n- [x] Done";
      const result = normalize(roundTrip(input));
      expect(result).toContain("- [ ] Todo");
      expect(result).toContain("- [x] Done");
    });
  });

  describe("wiki links", () => {
    it("preserves simple wiki links", () => {
      const input = "See [[My Article]] for details.";
      expect(normalize(roundTrip(input))).toBe(input);
    });

    it("preserves wiki links with section anchors", () => {
      const input = "See [[My Article#Section One]] for details.";
      expect(normalize(roundTrip(input))).toBe(input);
    });

    it("preserves multiple wiki links in a paragraph", () => {
      const input = "Links to [[First]] and [[Second]] articles.";
      expect(normalize(roundTrip(input))).toBe(input);
    });
  });

  describe("tables", () => {
    it("preserves basic tables", () => {
      const input = [
        "| Header 1 | Header 2 |",
        "| --- | --- |",
        "| Cell 1 | Cell 2 |",
        "| Cell 3 | Cell 4 |",
      ].join("\n");
      const result = normalize(roundTrip(input));
      // Table content should survive (column count and content preserved)
      expect(result).toContain("Header 1");
      expect(result).toContain("Header 2");
      expect(result).toContain("Cell 1");
      expect(result).toContain("Cell 4");
    });
  });

  describe("code blocks", () => {
    it("preserves code blocks with language", () => {
      const input = '```javascript\nconst x = 1;\n```';
      const result = normalize(roundTrip(input));
      expect(result).toContain("```");
      expect(result).toContain("const x = 1;");
    });

    it("preserves code blocks without language", () => {
      const input = "```\nplain code\n```";
      const result = normalize(roundTrip(input));
      expect(result).toContain("```");
      expect(result).toContain("plain code");
    });
  });

  describe("blockquotes", () => {
    it("preserves blockquotes", () => {
      expect(normalize(roundTrip("> A quote"))).toBe("> A quote");
    });

    it("preserves nested blockquotes", () => {
      const input = "> Outer\n> \n> > Inner";
      const result = normalize(roundTrip(input));
      expect(result).toContain("> ");
      expect(result).toContain("Outer");
      expect(result).toContain("Inner");
    });
  });

  describe("other elements", () => {
    it("preserves images", () => {
      const input = "![Alt text](https://example.com/img.png)";
      const result = normalize(roundTrip(input));
      expect(result).toContain("![");
      expect(result).toContain("https://example.com/img.png");
    });

    it("preserves horizontal rules", () => {
      const input = "Above\n\n---\n\nBelow";
      const result = normalize(roundTrip(input));
      expect(result).toContain("---");
      expect(result).toContain("Above");
      expect(result).toContain("Below");
    });

    it("preserves links", () => {
      const input = "[Link text](https://example.com)";
      const result = normalize(roundTrip(input));
      expect(result).toContain("[Link text]");
      expect(result).toContain("https://example.com");
    });
  });

  describe("edge cases", () => {
    it("handles empty document", () => {
      const result = normalize(roundTrip(""));
      expect(result).toBe("");
    });

    it("handles single character", () => {
      expect(normalize(roundTrip("a"))).toBe("a");
    });

    it("is idempotent (double round-trip)", () => {
      const input = "# Title\n\nSome **bold** and *italic* text.\n\n- Item 1\n- Item 2";
      const first = roundTrip(input);
      const second = roundTrip(first);
      expect(normalize(first)).toBe(normalize(second));
    });
  });

  describe("mixed content", () => {
    it("preserves a realistic article", () => {
      const input = [
        "# Meeting Notes",
        "",
        "## Attendees",
        "",
        "- Alice",
        "- Bob",
        "",
        "## Action Items",
        "",
        "- [ ] Review the **proposal**",
        "- [x] Send follow-up email",
        "",
        "> Important: deadline is Friday",
        "",
        "See [[Project Plan]] for context.",
        "",
        "```typescript",
        "const result = await fetch('/api');",
        "```",
        "",
        "---",
        "",
        "End of notes.",
      ].join("\n");

      const result = normalize(roundTrip(input));

      // All key content should survive
      expect(result).toContain("# Meeting Notes");
      expect(result).toContain("## Attendees");
      expect(result).toContain("Alice");
      expect(result).toContain("**proposal**");
      expect(result).toContain("- [ ] ");
      expect(result).toContain("- [x] ");
      expect(result).toContain("> ");
      expect(result).toContain("[[Project Plan]]");
      expect(result).toContain("```");
      expect(result).toContain("---");
    });
  });
});
