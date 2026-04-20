"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const WikiRichEditorLazy = dynamic(
  () =>
    import("./WikiRichEditor").then((mod) => ({
      default: mod.WikiRichEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading editor...
        </span>
      </div>
    ),
  }
);
