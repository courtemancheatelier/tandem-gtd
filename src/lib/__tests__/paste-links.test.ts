/**
 * @jest-environment jsdom
 */
import { convertHtmlLinksToMarkdown } from "../paste-links";

describe("convertHtmlLinksToMarkdown", () => {
  it("converts a single anchor to Markdown link", () => {
    const html = '<p>Check the <a href="https://docs.anthropic.com">Anthropic docs</a> for details.</p>';
    expect(convertHtmlLinksToMarkdown(html)).toBe(
      "Check the [Anthropic docs](https://docs.anthropic.com) for details."
    );
  });

  it("converts multiple anchors in one paste", () => {
    const html =
      '<p>See <a href="https://a.com">A</a> and <a href="https://b.com">B</a>.</p>';
    expect(convertHtmlLinksToMarkdown(html)).toBe(
      "See [A](https://a.com) and [B](https://b.com)."
    );
  });

  it("returns null when HTML has no anchors", () => {
    const html = "<p>Just some <strong>bold</strong> text.</p>";
    expect(convertHtmlLinksToMarkdown(html)).toBeNull();
  });

  it("uses bare URL when anchor text matches the URL", () => {
    const html = '<a href="https://example.com">https://example.com</a>';
    expect(convertHtmlLinksToMarkdown(html)).toBe("https://example.com");
  });

  it("replaces mailto: links with plain text only", () => {
    const html = '<p>Email <a href="mailto:hi@example.com">hi@example.com</a> for help.</p>';
    expect(convertHtmlLinksToMarkdown(html)).toBe("Email hi@example.com for help.");
  });

  it("returns null for empty HTML string", () => {
    expect(convertHtmlLinksToMarkdown("")).toBeNull();
  });

  it("strips nested HTML inside anchor and uses textContent", () => {
    const html = '<a href="https://example.com"><strong>Bold</strong> link</a>';
    expect(convertHtmlLinksToMarkdown(html)).toBe("[Bold link](https://example.com)");
  });

  it("preserves line breaks from <br> and block elements", () => {
    const html = '<p>Line one <a href="https://a.com">link</a></p><p>Line two</p>';
    expect(convertHtmlLinksToMarkdown(html)).toBe("Line one [link](https://a.com)\nLine two");
  });

  it("preserves <br> as newline", () => {
    const html = 'First<br><a href="https://a.com">link</a><br>Last';
    expect(convertHtmlLinksToMarkdown(html)).toBe("First\n[link](https://a.com)\nLast");
  });
});
