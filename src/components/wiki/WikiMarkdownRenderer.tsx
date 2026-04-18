"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import Link from "next/link";
import React from "react";
import { remarkWikiLinks } from "@/lib/remark-wiki-links";
import { slugify } from "@/lib/validations/wiki";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 || []), "id"],
    h2: [...(defaultSchema.attributes?.h2 || []), "id"],
    h3: [...(defaultSchema.attributes?.h3 || []), "id"],
    h4: [...(defaultSchema.attributes?.h4 || []), "id"],
    input: [...(defaultSchema.attributes?.input || []), ["type", "checkbox"], "checked", "disabled"],
    a: ["href"],
    img: ["src", "alt"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
  tagNames: [...(defaultSchema.tagNames || []), "input"],
};

function getHeadingText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getHeadingText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return getHeadingText((children as React.ReactElement).props.children);
  }
  return "";
}

interface WikiMarkdownRendererProps {
  content: string;
  className?: string;
}

export function WikiMarkdownRenderer({ content, className }: WikiMarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: ({ children }) => {
            const id = slugify(getHeadingText(children));
            return (
              <h1 id={id} className="text-2xl font-bold mt-6 mb-3">{children}</h1>
            );
          },
          h2: ({ children }) => {
            const id = slugify(getHeadingText(children));
            return (
              <h2 id={id} className="text-xl font-semibold mt-5 mb-2">{children}</h2>
            );
          },
          h3: ({ children }) => {
            const id = slugify(getHeadingText(children));
            return (
              <h3 id={id} className="text-lg font-semibold mt-4 mb-2">{children}</h3>
            );
          },
          h4: ({ children }) => {
            const id = slugify(getHeadingText(children));
            return (
              <h4 id={id} className="text-base font-semibold mt-3 mb-1">{children}</h4>
            );
          },
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground mb-3">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClassName, children }) => {
            const isBlock = codeClassName?.includes("language-");
            if (isBlock) {
              return (
                <code className={`${codeClassName || ""}`}>
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted p-4 rounded-md overflow-x-auto mb-3 text-sm font-mono">
              {children}
            </pre>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith("/wiki/")) {
              return (
                <Link
                  href={href}
                  className="text-primary underline hover:text-primary/80"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                className="text-primary underline hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="w-full border-collapse border border-border text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2">{children}</td>
          ),
          hr: () => <hr className="my-6 border-border" />,
          img: ({ src, alt }) => {
            if (!src || !/^https?:\/\//i.test(src)) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt || ""}
                className="max-w-full rounded-md my-3"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            );
          },
          input: ({ checked, ...props }) => (
            <input
              {...props}
              checked={checked}
              disabled
              className="mr-2 align-middle"
              type="checkbox"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
