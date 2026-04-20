import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { WikiLinkRenderer } from "@/components/shared/WikiLinkRenderer";

// Mock next/link
jest.mock("next/link", () => {
  return function MockLink({ href, children, ...props }: { href: string; children: React.ReactNode }) {
    return <a href={href} {...props}>{children}</a>;
  };
});

describe("WikiLinkRenderer", () => {
  it("renders plain text without links", () => {
    render(<WikiLinkRenderer text="Just some text" />);
    expect(screen.getByText("Just some text")).toBeInTheDocument();
  });

  it("renders [[wiki links]] as internal links", () => {
    render(<WikiLinkRenderer text="See [[My Page]] for details" />);
    const link = screen.getByText("My Page");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/wiki/my-page");
  });

  it("renders [text](url) as external link with target=_blank", () => {
    render(<WikiLinkRenderer text="Check [Anthropic docs](https://docs.anthropic.com) here" />);
    const link = screen.getByText("Anthropic docs");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "https://docs.anthropic.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders mixed wiki links and Markdown links in one string", () => {
    render(
      <WikiLinkRenderer
        text="See [[My Page]] and [Google](https://google.com) for info"
      />
    );
    expect(screen.getByText("My Page")).toHaveAttribute("href", "/wiki/my-page");
    const externalLink = screen.getByText("Google");
    expect(externalLink).toHaveAttribute("href", "https://google.com");
    expect(externalLink).toHaveAttribute("target", "_blank");
  });

  it("handles multiple Markdown links", () => {
    render(
      <WikiLinkRenderer
        text="Visit [A](https://a.com) and [B](https://b.com)"
      />
    );
    expect(screen.getByText("A")).toHaveAttribute("href", "https://a.com");
    expect(screen.getByText("B")).toHaveAttribute("href", "https://b.com");
  });
});
