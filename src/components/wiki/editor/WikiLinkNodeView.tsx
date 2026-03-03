"use client";

import React from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/validations/wiki";

export function WikiLinkNodeView({ node }: NodeViewProps) {
  const router = useRouter();
  const title = node.attrs.title || "";
  const section = node.attrs.section || "";
  const display = section ? `${title}#${section}` : title;

  const slug = slugify(title);
  const href = section ? `/wiki/${slug}#${slugify(section)}` : `/wiki/${slug}`;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
    } else {
      router.push(href);
    }
  }

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        data-wiki-link=""
        className="text-primary underline decoration-solid cursor-pointer rounded px-0.5 hover:bg-primary/10"
        onClick={handleClick}
        title={`Wiki: ${display}`}
      >
        {display}
      </span>
    </NodeViewWrapper>
  );
}
