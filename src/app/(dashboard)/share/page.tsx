"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShareCaptureModal } from "@/components/share/ShareCaptureModal";

const URL_REGEX = /https?:\/\/[^\s]+/;

function ShareHandler() {
  const params = useSearchParams();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const paramUrl = params.get("url") || "";
    const paramTitle = params.get("title") || "";
    const paramText = params.get("text") || "";

    // Determine the URL — explicit param, or extract from text
    let resolvedUrl = paramUrl;
    if (!resolvedUrl) {
      const match = paramText.match(URL_REGEX);
      if (match) resolvedUrl = match[0];
    }

    if (!resolvedUrl) {
      // No URL — use title or text as the task name, skip metadata fetch
      setTitle(paramTitle || paramText || "");
      setLoading(false);
      return;
    }

    setUrl(resolvedUrl);

    // Fetch metadata for the URL
    async function fetchMetadata() {
      try {
        const res = await fetch("/api/share/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: resolvedUrl }),
        });

        if (res.ok) {
          const data = await res.json();
          // Resolve best title: fetched > param > URL
          setTitle(
            data.title?.trim() || paramTitle.trim() || resolvedUrl
          );
        } else {
          setTitle(paramTitle.trim() || resolvedUrl);
        }
      } catch {
        setTitle(paramTitle.trim() || resolvedUrl);
      } finally {
        setLoading(false);
      }
    }

    fetchMetadata();
  }, [params]);

  return (
    <ShareCaptureModal
      initialTitle={title}
      initialUrl={url}
      isLoading={loading}
    />
  );
}

export default function SharePage() {
  return (
    <div className="flex items-start justify-center pt-12 px-4">
      <Suspense>
        <ShareHandler />
      </Suspense>
    </div>
  );
}
