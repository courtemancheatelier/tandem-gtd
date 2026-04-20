import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/api/auth-helpers";
import { z } from "zod";
import dns from "dns/promises";

const metadataRequestSchema = z.object({
  url: z.string().url(),
});

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_REDIRECTS = 3;

function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved ranges
  const ipv4Parts = ip.split(".").map(Number);
  if (ipv4Parts.length === 4 && ipv4Parts.every((p) => p >= 0 && p <= 255)) {
    const [a, b] = ipv4Parts;
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 10) return true;                           // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    if (a === 192 && b === 168) return true;              // 192.168.0.0/16
    if (a === 169 && b === 254) return true;              // 169.254.0.0/16
    if (a === 0) return true;                             // 0.0.0.0/8
  }

  // IPv6 private/reserved
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10

  return false;
}

async function validateUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL";
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return "Only http and https URLs are allowed";
  }

  const hostname = parsed.hostname;
  if (hostname === "localhost" || hostname.endsWith(".local")) {
    return "Private/internal URLs are not allowed";
  }

  // Resolve DNS to check the actual IP
  try {
    const { address } = await dns.lookup(hostname);
    if (isPrivateIP(address)) {
      return "Private/internal URLs are not allowed";
    }
  } catch {
    return "Could not resolve hostname";
  }

  return null;
}

function extractMetaContent(html: string, property: string): string | null {
  // Match both property="..." and name="..."
  const regex = new RegExp(
    `<meta\\s+(?:[^>]*?(?:property|name)=["']${property}["'][^>]*?content=["']([^"']*?)["']|[^>]*?content=["']([^"']*?)["'][^>]*?(?:property|name)=["']${property}["'])`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] || match?.[2] || null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const match = html.match(
    /<link[^>]*?rel=["'](?:icon|shortcut icon)["'][^>]*?href=["']([^"']+)["']/i
  );
  if (!match?.[1]) return null;
  try {
    return new URL(match[1], baseUrl).href;
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  // Strip common suffixes like " | Company Name" or " - Site Name"
  return title.split(/\s+[|\-–—]\s+/)[0].trim();
}

const EMPTY_METADATA = { title: null, description: null, siteName: null, favicon: null };

export async function POST(req: NextRequest) {
  const auth = await requireAuth("POST");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = metadataRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("A valid URL is required");
  }

  let { url } = parsed.data;

  // Validate protocol and resolved IP before fetching
  const validationError = await validateUrl(url);
  if (validationError) {
    return badRequest(validationError);
  }

  try {
    let response: Response;
    let redirectCount = 0;

    // Follow redirects manually with validation at each hop
    while (true) {
      response = await fetch(url, {
        headers: { "User-Agent": "Tandem GTD Share Fetcher/1.0" },
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });

      // Handle redirects manually
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;

        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          return NextResponse.json(EMPTY_METADATA);
        }

        // Resolve relative redirects against current URL
        try {
          url = new URL(location, url).href;
        } catch {
          return NextResponse.json(EMPTY_METADATA);
        }

        // Validate the redirect target
        const redirectError = await validateUrl(url);
        if (redirectError) {
          return badRequest(redirectError);
        }

        continue;
      }

      break;
    }

    if (!response!.ok) {
      return NextResponse.json(EMPTY_METADATA);
    }

    // Read only the first ~50KB
    const reader = response!.body?.getReader();
    if (!reader) {
      return NextResponse.json(EMPTY_METADATA);
    }

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 50_000;
    let totalBytes = 0;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value.length;
    }
    reader.cancel();

    const ogTitle = extractMetaContent(html, "og:title");
    const twitterTitle = extractMetaContent(html, "twitter:title");
    const htmlTitle = extractTitle(html);
    const description =
      extractMetaContent(html, "og:description") ||
      extractMetaContent(html, "description");
    const siteName = extractMetaContent(html, "og:site_name");
    const favicon = extractFavicon(html, url);

    // Resolve best title — OG titles are usually clean, only strip suffixes from <title>
    const title =
      ogTitle?.trim() ||
      twitterTitle?.trim() ||
      (htmlTitle ? cleanTitle(htmlTitle) : null);

    return NextResponse.json({ title, description, siteName, favicon });
  } catch {
    // Timeout, network error, etc.
    return NextResponse.json(EMPTY_METADATA);
  }
}
