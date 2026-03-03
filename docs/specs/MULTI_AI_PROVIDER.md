# Multi-AI Provider Support — OpenAI, Google Gemini, and Beyond

> **Status:** Draft
> **Last updated:** 2026-02-24

---

## 1. Problem Statement

### What Exists

Tandem's AI features are hardcoded to Anthropic's Claude:

- **API endpoint:** `https://api.anthropic.com/v1/messages` (hardcoded in `src/app/api/ai/chat/route.ts`)
- **Auth header:** `x-api-key` with `anthropic-version: 2023-06-01` (Anthropic-specific)
- **Default model:** `claude-sonnet-4-20250514` (in `ServerSettings.defaultAiModel`)
- **API key fields:** `User.anthropicApiKey`, `ServerSettings.serverAnthropicApiKey` (column names baked into Prisma schema)
- **Streaming format:** Anthropic SSE event types (`content_block_delta`, `message_stop`)
- **Config resolution:** `src/lib/ai/resolve-key.ts` returns an `AIConfig` that assumes Anthropic
- **Admin UI:** Model selector only lists Claude models

This works well. Claude is the right default. But users should be able to bring their own OpenAI or Google key if that's what they have, and the admin should be able to configure the server with whichever provider they prefer.

### The Gap

1. **Vendor lock-in** — if a user has an OpenAI key but no Anthropic key, they can't use AI features at all
2. **No provider choice** — the admin sets one model for everyone, and it must be a Claude model
3. **Cost flexibility** — different providers have different pricing; users may want to pick based on their budget
4. **MCP AI features** — the scaffold endpoint, natural language parsing, and review coach all hardcode Anthropic calls

### What Done Looks Like

1. **Provider abstraction** — a unified interface that handles Anthropic, OpenAI, and Google Gemini behind a single API
2. **Per-user provider choice** — users can set their preferred provider and API key in settings
3. **Server-level defaults** — admin configures the default provider and model; users can override
4. **Transparent to features** — the chat endpoint, scaffold endpoint, review coach, and any future AI feature call the abstraction layer, not a specific provider

---

## 2. Provider Abstraction Layer

### 2.1 Provider Interface

```typescript
// src/lib/ai/providers/types.ts

export type AIProviderType = "anthropic" | "openai" | "google";

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  model: string;
  source: "user" | "server";
  dailyLimit: number;
  messagesUsedToday: number;
}

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AICompletionRequest {
  system: string;
  messages: AIMessage[];
  maxTokens?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  /** Send a non-streaming completion request */
  complete(config: AIProviderConfig, request: AICompletionRequest): Promise<AICompletionResponse>;

  /** Send a streaming completion request, returns a ReadableStream of text chunks */
  stream(config: AIProviderConfig, request: AICompletionRequest): Promise<ReadableStream<string>>;
}
```

### 2.2 Provider Registry

```typescript
// src/lib/ai/providers/registry.ts

import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { GoogleProvider } from "./google";
import type { AIProvider, AIProviderType } from "./types";

const providers: Record<AIProviderType, AIProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
  google: new GoogleProvider(),
};

export function getProvider(type: AIProviderType): AIProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown AI provider: ${type}`);
  return provider;
}
```

### 2.3 Anthropic Provider (Extract from Existing)

```typescript
// src/lib/ai/providers/anthropic.ts

import type { AIProvider, AIProviderConfig, AICompletionRequest, AICompletionResponse } from "./types";

export class AnthropicProvider implements AIProvider {
  private baseUrl = "https://api.anthropic.com/v1/messages";

  async complete(config: AIProviderConfig, request: AICompletionRequest): Promise<AICompletionResponse> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: request.maxTokens || 1024,
        system: request.system,
        messages: request.messages.filter((m) => m.role !== "system"),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const result = await response.json();
    return {
      content: result.content?.[0]?.text || "",
      model: result.model,
      usage: {
        inputTokens: result.usage?.input_tokens || 0,
        outputTokens: result.usage?.output_tokens || 0,
      },
    };
  }

  async stream(config: AIProviderConfig, request: AICompletionRequest): Promise<ReadableStream<string>> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: request.maxTokens || 1024,
        system: request.system,
        messages: request.messages.filter((m) => m.role !== "system"),
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    // Transform Anthropic SSE format to plain text chunks
    return response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              controller.enqueue(parsed.delta.text);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    }));
  }
}
```

### 2.4 OpenAI Provider

```typescript
// src/lib/ai/providers/openai.ts

import type { AIProvider, AIProviderConfig, AICompletionRequest, AICompletionResponse } from "./types";

export class OpenAIProvider implements AIProvider {
  private baseUrl = "https://api.openai.com/v1/chat/completions";

  async complete(config: AIProviderConfig, request: AICompletionRequest): Promise<AICompletionResponse> {
    const messages = [
      { role: "system" as const, content: request.system },
      ...request.messages,
    ];

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_completion_tokens: request.maxTokens || 1024,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    return {
      content: result.choices?.[0]?.message?.content || "",
      model: result.model,
      usage: {
        inputTokens: result.usage?.prompt_tokens || 0,
        outputTokens: result.usage?.completion_tokens || 0,
      },
    };
  }

  async stream(config: AIProviderConfig, request: AICompletionRequest): Promise<ReadableStream<string>> {
    const messages = [
      { role: "system" as const, content: request.system },
      ...request.messages,
    ];

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_completion_tokens: request.maxTokens || 1024,
        messages,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    // Transform OpenAI SSE format to plain text chunks
    return response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(delta);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    }));
  }
}
```

### 2.5 Google Gemini Provider

```typescript
// src/lib/ai/providers/google.ts

import type { AIProvider, AIProviderConfig, AICompletionRequest, AICompletionResponse } from "./types";

export class GoogleProvider implements AIProvider {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  async complete(config: AIProviderConfig, request: AICompletionRequest): Promise<AICompletionResponse> {
    const url = `${this.baseUrl}/${config.model}:generateContent?key=${config.apiKey}`;

    const contents = request.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google AI error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return {
      content: text,
      model: config.model,
      usage: {
        inputTokens: result.usageMetadata?.promptTokenCount || 0,
        outputTokens: result.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  async stream(config: AIProviderConfig, request: AICompletionRequest): Promise<ReadableStream<string>> {
    const url = `${this.baseUrl}/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

    const contents = request.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents,
        generationConfig: {
          maxOutputTokens: request.maxTokens || 1024,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Google AI error: ${response.status}`);
    }

    // Transform Google SSE format to plain text chunks
    return response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (delta) {
              controller.enqueue(delta);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
    }));
  }
}
```

---

## 3. Data Model Changes

### 3.1 New Enum

```prisma
enum AIProvider {
  ANTHROPIC
  OPENAI
  GOOGLE
}
```

### 3.2 User Model Updates

Replace the single `anthropicApiKey` field with provider-aware fields:

```prisma
model User {
  // Existing field (keep for backward compatibility during migration)
  anthropicApiKey       String?

  // New provider-aware fields
  aiProvider            AIProvider?          // User's preferred provider (null = use server default)
  aiProviderApiKey      String?              // Encrypted key for their chosen provider
  aiProviderModel       String?              // User's preferred model (null = use provider default)

  // ... all other existing AI fields remain unchanged
}
```

### 3.3 ServerSettings Updates

```prisma
model ServerSettings {
  // Existing field (keep for backward compatibility)
  serverAnthropicApiKey  String?

  // New provider-aware fields
  defaultAiProvider      AIProvider  @default(ANTHROPIC)
  serverAiProviderKeys   Json?      // Encrypted JSON: { "anthropic": "sk-...", "openai": "sk-...", "google": "..." }

  // Existing field — now interpreted per-provider
  defaultAiModel         String     @default("claude-sonnet-4-20250514")

  // ... all other existing fields remain unchanged
}
```

### 3.4 Migration Strategy

The migration adds new fields without removing old ones. A backfill step copies existing data:

```sql
-- Migration: add_multi_ai_provider

ALTER TABLE "User" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "aiProviderApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "aiProviderModel" TEXT;

ALTER TABLE "ServerSettings" ADD COLUMN "defaultAiProvider" TEXT NOT NULL DEFAULT 'ANTHROPIC';
ALTER TABLE "ServerSettings" ADD COLUMN "serverAiProviderKeys" JSONB;

-- Backfill: copy existing Anthropic keys to new fields
UPDATE "User"
SET "aiProvider" = 'ANTHROPIC',
    "aiProviderApiKey" = "anthropicApiKey"
WHERE "anthropicApiKey" IS NOT NULL;

UPDATE "ServerSettings"
SET "serverAiProviderKeys" = jsonb_build_object('anthropic', "serverAnthropicApiKey")
WHERE "serverAnthropicApiKey" IS NOT NULL;
```

After the migration is stable, a follow-up migration removes the deprecated `anthropicApiKey` and `serverAnthropicApiKey` columns.

---

## 4. Updated Config Resolution

### 4.1 Revised resolveAIConfig

```typescript
// src/lib/ai/resolve-key.ts (updated)

import type { AIProviderConfig, AIProviderType } from "./providers/types";
import { decrypt } from "./crypto";

export async function resolveAIConfig(userId: string): Promise<AIProviderConfig | null> {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiEnabled: true,
        aiProvider: true,
        aiProviderApiKey: true,
        aiProviderModel: true,
        anthropicApiKey: true,       // Legacy fallback
        aiDailyLimit: true,
        aiMessagesUsedToday: true,
        aiLimitResetAt: true,
        role: true,
      },
    }),
    prisma.serverSettings.findFirst(),
  ]);

  if (!user?.aiEnabled) return null;
  if (!settings?.serverAiEnabled) return null;

  // Determine provider (user preference > server default)
  const provider: AIProviderType = (
    user.aiProvider?.toLowerCase() as AIProviderType
  ) || (
    settings.defaultAiProvider?.toLowerCase() as AIProviderType
  ) || "anthropic";

  // Resolve API key (user key > server key > env var)
  let apiKey: string | null = null;
  let source: "user" | "server" = "server";

  // 1. User's own key for chosen provider
  if (settings.allowUserOwnKeys && user.aiProviderApiKey && user.aiProvider) {
    apiKey = decrypt(user.aiProviderApiKey);
    source = "user";
  }

  // 1b. Legacy: user's Anthropic key (if provider is anthropic and new field is empty)
  if (!apiKey && provider === "anthropic" && user.anthropicApiKey) {
    apiKey = decrypt(user.anthropicApiKey);
    source = "user";
  }

  // 2. Server shared key for this provider
  if (!apiKey && (settings.shareServerKey || user.role === "ADMIN")) {
    const serverKeys = settings.serverAiProviderKeys as Record<string, string> | null;
    const serverKey = serverKeys?.[provider];
    if (serverKey) {
      apiKey = decrypt(serverKey);
      source = "server";
    }

    // 2b. Legacy: server Anthropic key
    if (!apiKey && provider === "anthropic" && settings.serverAnthropicApiKey) {
      apiKey = decrypt(settings.serverAnthropicApiKey);
      source = "server";
    }
  }

  // 3. Environment variable fallback
  if (!apiKey) {
    const envKeyMap: Record<AIProviderType, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_AI_API_KEY",
    };
    apiKey = process.env[envKeyMap[provider]] || null;
    source = "server";
  }

  if (!apiKey) return null;

  // Resolve model (user preference > server default > provider default)
  const providerDefaults: Record<AIProviderType, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    google: "gemini-2.0-flash",
  };

  const model = user.aiProviderModel
    || (provider === (settings.defaultAiProvider?.toLowerCase() || "anthropic")
      ? settings.defaultAiModel
      : null)
    || providerDefaults[provider];

  // Reset daily limit if needed
  const now = new Date();
  let messagesUsedToday = user.aiMessagesUsedToday;
  if (user.aiLimitResetAt && user.aiLimitResetAt < now) {
    messagesUsedToday = 0;
    await prisma.user.update({
      where: { id: userId },
      data: { aiMessagesUsedToday: 0, aiLimitResetAt: getNextMidnight() },
    });
  }

  return {
    provider,
    apiKey,
    model,
    source,
    dailyLimit: user.aiDailyLimit || settings.defaultAiDailyLimit || 100,
    messagesUsedToday,
  };
}
```

---

## 5. Updated Chat Endpoint

### 5.1 Refactored Route

The chat endpoint replaces its hardcoded Anthropic `fetch()` with the provider abstraction:

```typescript
// src/app/api/ai/chat/route.ts (key changes)

import { resolveAIConfig } from "@/lib/ai/resolve-key";
import { getProvider } from "@/lib/ai/providers/registry";

// ... existing validation, rate limiting, context building ...

const config = await resolveAIConfig(userId);
if (!config) {
  return NextResponse.json({ error: "AI not available" }, { status: 403 });
}

const provider = getProvider(config.provider);

// Build the request in provider-agnostic format
const request = {
  system: systemPrompt,
  messages: messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  })),
  maxTokens: 1024,
};

// Stream the response
const textStream = await provider.stream(config, request);

// Convert the text stream to SSE for the client
// (client always receives a normalized SSE format regardless of upstream provider)
const encoder = new TextEncoder();
const sseStream = textStream.pipeThrough(new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk })}\n\n`)
    );
  },
  flush(controller) {
    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
  },
}));

return new Response(sseStream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});
```

### 5.2 Client SSE Format

The client always receives the same normalized SSE format regardless of upstream provider:

```
data: {"type":"text","text":"Here's"}

data: {"type":"text","text":" my response"}

data: [DONE]
```

This means the client-side SSE parser (`AIChatPanel.tsx`) needs a one-time update to match this simplified format, then never needs to change again when new providers are added.

---

## 6. Updated Non-Streaming AI Calls

All non-streaming AI calls (scaffold, parse-task, review summary) use `provider.complete()`:

```typescript
// Example: scaffold endpoint refactored

const config = await resolveAIConfig(userId);
if (!config) return NextResponse.json({ error: "AI not available" }, { status: 403 });

const provider = getProvider(config.provider);

const result = await provider.complete(config, {
  system: systemPrompt,
  messages: [{ role: "user", content: userMessage }],
  maxTokens: 2048,
});

const suggestion = JSON.parse(result.content);
```

This replaces every raw `fetch("https://api.anthropic.com/...")` call in the codebase.

---

## 7. Model Catalog

### 7.1 Available Models Per Provider

```typescript
// src/lib/ai/providers/models.ts

export interface AIModelInfo {
  id: string;
  label: string;
  provider: AIProviderType;
  contextWindow: number;
  tier: "fast" | "standard" | "premium";
}

export const AI_MODELS: AIModelInfo[] = [
  // Anthropic
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic", contextWindow: 200000, tier: "fast" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic", contextWindow: 200000, tier: "standard" },
  { id: "claude-opus-4-20250514", label: "Claude Opus 4", provider: "anthropic", contextWindow: 200000, tier: "premium" },

  // OpenAI
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", contextWindow: 128000, tier: "fast" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", contextWindow: 128000, tier: "standard" },
  { id: "o3", label: "o3", provider: "openai", contextWindow: 200000, tier: "premium" },

  // Google
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google", contextWindow: 1048576, tier: "fast" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", contextWindow: 1048576, tier: "standard" },
];

export function getModelsForProvider(provider: AIProviderType): AIModelInfo[] {
  return AI_MODELS.filter((m) => m.provider === provider);
}

export function getDefaultModel(provider: AIProviderType): string {
  const defaults: Record<AIProviderType, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    google: "gemini-2.0-flash",
  };
  return defaults[provider];
}
```

### 7.2 Model Catalog Updates

The model list is a static array in code. When new models are released, update the array and deploy. No database migration needed. The `defaultAiModel` field in `ServerSettings` stores a model ID string, so any model ID is valid even if not in the catalog (forward-compatible).

---

## 8. UI Changes

### 8.1 User AI Settings

The AI settings page (`src/components/settings/AISettingsSection.tsx`) adds a provider selector:

```
+--------------------------------------------------------------+
|  AI Settings                                                  |
+--------------------------------------------------------------+
|                                                               |
|  AI Features: [Enabled v]                                     |
|                                                               |
|  ─── Provider ────────────────────────────────────────────   |
|                                                               |
|  Provider:  ( ) Use server default (Anthropic)                |
|             (•) OpenAI                                        |
|             ( ) Google Gemini                                  |
|             ( ) Anthropic                                      |
|                                                               |
|  Model:     [GPT-4o                               v]          |
|             GPT-4o Mini (fast)                                |
|             GPT-4o (standard)                                 |
|             o3 (premium)                                      |
|                                                               |
|  API Key:   [sk-••••••••••••••••••••]  [Test]                |
|             Your key is encrypted at rest.                    |
|                                                               |
|  ─── Privacy ─────────────────────────────────────────────   |
|  [existing privacy toggles unchanged]                         |
|                                                               |
+--------------------------------------------------------------+
```

When the provider changes, the model dropdown updates to show only models for that provider. The API key field shows a "Test" button that makes a minimal API call to verify the key works.

### 8.2 Admin Settings

The admin settings page (`src/components/admin/ServerSettingsForm.tsx`) adds per-provider key configuration:

```
+--------------------------------------------------------------+
|  AI Configuration (Admin)                                     |
+--------------------------------------------------------------+
|                                                               |
|  Default Provider:  [Anthropic v]                             |
|  Default Model:     [Claude Sonnet 4 v]                       |
|                                                               |
|  ─── Server API Keys ────────────────────────────────────    |
|                                                               |
|  Anthropic:  [sk-ant-••••••••••••]  [Test]  [Clear]          |
|  OpenAI:     [sk-••••••••••••••••]  [Test]  [Clear]          |
|  Google:     [AI••••••••••••••••••]  [Test]  [Clear]          |
|                                                               |
|  Share server keys with users: [Yes v]                        |
|  Allow users to bring own keys: [Yes v]                       |
|                                                               |
|  ─── Per-Provider Defaults ──────────────────────────────    |
|  (When a user selects this provider, they get this model)     |
|  Anthropic default: [Claude Sonnet 4 v]                       |
|  OpenAI default:    [GPT-4o v]                                |
|  Google default:    [Gemini 2.0 Flash v]                      |
|                                                               |
+--------------------------------------------------------------+
```

The admin can configure keys for multiple providers. Users who don't bring their own key will use whichever server key matches their chosen provider.

### 8.3 Chat Panel Provider Indicator

The in-app AI chat panel shows which provider/model is active:

```
+-------------------------------+
|  AI Assistant  [GPT-4o · OpenAI]
+-------------------------------+
|                               |
|  ...chat messages...          |
|                               |
+-------------------------------+
```

This helps users confirm which provider is handling their request.

---

## 9. API Key Testing Endpoint

### 9.1 Endpoint

`POST /api/ai/test-key`

Validates that an API key works for a given provider by making a minimal completion request.

```typescript
// src/app/api/ai/test-key/route.ts

const testKeySchema = z.object({
  provider: z.enum(["anthropic", "openai", "google"]),
  apiKey: z.string().min(1),
  model: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const rateLimited = checkRateLimit(`test-key:${userId}`, 3, 60_000);
  if (rateLimited) return rateLimited;

  const body = await req.json();
  const parsed = testKeySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);

  const { provider: providerType, apiKey, model } = parsed.data;
  const providerImpl = getProvider(providerType);

  const defaultModel = getDefaultModel(providerType);

  try {
    const result = await providerImpl.complete(
      {
        provider: providerType,
        apiKey,
        model: model || defaultModel,
        source: "user",
        dailyLimit: 1,
        messagesUsedToday: 0,
      },
      {
        system: "Respond with exactly: ok",
        messages: [{ role: "user", content: "test" }],
        maxTokens: 10,
      }
    );

    return NextResponse.json({
      valid: true,
      model: result.model,
    });
  } catch (error) {
    return NextResponse.json({
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
```

---

## 10. API Route Changes

### 10.1 User Settings API

`PATCH /api/settings/ai` — add new fields:

```typescript
const updateAISettingsSchema = z.object({
  // Existing fields
  aiEnabled: z.boolean().optional(),
  inAppAiEnabled: z.boolean().optional(),
  // ... existing fields ...

  // New fields
  aiProvider: z.enum(["ANTHROPIC", "OPENAI", "GOOGLE"]).nullable().optional(),
  aiProviderApiKey: z.string().max(500).nullable().optional(),
  aiProviderModel: z.string().max(100).nullable().optional(),
});
```

When `aiProviderApiKey` is provided, encrypt it before storing. When `null`, clear the key.

### 10.2 Admin Settings API

`PATCH /api/admin/settings` — add new fields:

```typescript
const updateServerSettingsSchema = z.object({
  // Existing fields ...

  // New fields
  defaultAiProvider: z.enum(["ANTHROPIC", "OPENAI", "GOOGLE"]).optional(),
  serverAiProviderKeys: z.record(
    z.enum(["anthropic", "openai", "google"]),
    z.string().max(500).nullable()
  ).optional(),
});
```

When `serverAiProviderKeys` is provided, encrypt each key value before storing as JSON.

---

## 11. In-App AI vs. MCP AI — Two Surfaces, One Provider Layer

Tandem has two distinct AI surfaces. Both need multi-provider support, but they work differently.

### 11.1 In-App AI (Server-Side)

These are features where **Tandem's server calls an AI provider** on behalf of the user. The user interacts through the Tandem web UI.

| Feature | Endpoint | Streaming? | Current Status |
|---|---|---|---|
| AI Chat Panel | `POST /api/ai/chat` | Yes (SSE) | Implemented |
| AI Review Coach | `POST /api/ai/chat` (with `REVIEW_MODE` context) | Yes (SSE) | Spec: AI_WEEKLY_REVIEW_COACH |
| Project Scaffolding | `POST /api/ai/scaffold-project` | No | Spec: AI_PROJECT_SCAFFOLDING |
| Natural Language Parse | `POST /api/ai/parse-task` | No | Spec: NATURAL_LANGUAGE_TASKS |
| Review Summary | `POST /api/ai/chat` (with `summary` phase) | Yes (SSE) | Spec: AI_WEEKLY_REVIEW_COACH |

**How multi-provider applies:** Each of these endpoints calls `resolveAIConfig(userId)` to get the user's preferred provider and key, then uses `getProvider(config.provider)` to get the right implementation. The provider abstraction handles all API format differences (request shape, auth headers, SSE parsing). The feature code never touches provider-specific details.

**Key point:** The system prompt and messages are identical across providers. All three providers support system messages, user/assistant message roles, and streaming. The abstraction normalizes the response format so feature code doesn't branch on provider.

### 11.2 MCP Server (External AI Clients)

This is the other direction — **external AI clients call into Tandem's MCP server** to use tools and read resources. The AI reasoning happens in the client (Claude Desktop, ChatGPT, Gemini, etc.), not in Tandem.

| Component | Transport | File |
|---|---|---|
| Stdio MCP Server | stdin/stdout (for Claude Desktop, Claude Code) | `src/mcp/server.ts` |
| HTTP MCP Server | Streamable HTTP (for claude.ai, ChatGPT, any web client) | `src/app/api/mcp/route.ts` |
| Tool definitions | 19 tools (inbox, tasks, projects, goals, etc.) | `src/mcp/tools.ts` |
| Resources | GTD summary, contexts, horizons, project details | `src/mcp/resources.ts` |

**MCP is already provider-agnostic at the protocol level.** Any MCP-compatible client can connect. The tools return structured text responses that any AI can interpret. No changes needed to the MCP transport or tool definitions for multi-provider support.

### 11.3 Where They Overlap: MCP Tool Handlers That Call AI

Some MCP tool handlers invoke AI internally — the MCP client calls a Tandem tool, and that tool's handler calls an AI provider server-side to do its work. These are the intersection points:

| MCP Tool | Internal AI Call | What It Does |
|---|---|---|
| `tandem_project_create` (with `aiSequence: true`) | `getScaffoldSuggestion()` | AI orders tasks and suggests dependencies |
| `tandem_task_create_from_text` | `POST /api/ai/parse-task` | AI infers context, energy, duration from text |

**The irony:** A user on ChatGPT calls `tandem_project_create` with `aiSequence: true`. ChatGPT is the *MCP client*, but the scaffold logic runs server-side using whatever *AI provider the user configured in Tandem settings*. So ChatGPT could trigger a call to Anthropic's API (or Google's, or OpenAI's own API through a different key).

**This is by design.** The MCP client handles conversation and tool selection. Tandem's server-side AI handles domain-specific tasks (sequencing, parsing) using the user's preferred provider. They're independent.

### 11.4 MCP Client Compatibility Matrix

Different MCP clients have varying levels of tool support:

| Client | Transport | Tool Calling | Resources | Status |
|---|---|---|---|---|
| Claude Desktop | stdio | Full | Full | Works today |
| Claude Code | stdio | Full | Full | Works today |
| claude.ai | HTTP | Full | Full | Works today |
| ChatGPT | HTTP | Full | Limited | MCP support varies by plan |
| Google Gemini | HTTP | Full | Limited | MCP support emerging |
| Custom clients | HTTP | Depends | Depends | Any MCP 2025-11-25 compatible client |

No Tandem changes needed for client compatibility — MCP is a standard protocol. As clients improve their MCP support, Tandem's tools automatically become available.

### 11.5 Provider Choice Does Not Affect MCP Access

A user who sets their AI provider to "Google Gemini" in Tandem settings can still use Claude Desktop as their MCP client. These are independent choices:

- **MCP client** = which AI assistant connects to Tandem's tools (user's choice of desktop app)
- **In-app AI provider** = which API Tandem calls for server-side AI features (user's choice in settings)
- **MCP tool AI provider** = same as in-app AI provider (uses `resolveAIConfig()`)

```
┌──────────────────┐     MCP protocol      ┌──────────────────┐
│  Claude Desktop  │ ◄──── tools/resources ──► │  Tandem MCP     │
│  (MCP client)    │                         │  Server          │
└──────────────────┘                         └────────┬─────────┘
                                                      │
                                              resolveAIConfig()
                                                      │
                                                      ▼
                                             ┌────────────────┐
                                             │  User's chosen  │
                                             │  AI provider    │
                                             │  (e.g. OpenAI)  │
                                             └────────────────┘
```

### 11.6 Future: MCP Client-Aware Behavior

Not in scope for this spec, but worth noting: in the future, Tandem could detect *which* MCP client is connected and adjust behavior:

- **Richer tool descriptions** for more capable clients
- **Streaming tool responses** when the client supports it
- **Provider-specific prompt optimization** — if the MCP client is ChatGPT, and the server-side AI is also OpenAI, the scaffold prompt could use OpenAI-specific features like `response_format: { type: "json_object" }` for more reliable JSON output

This would require the MCP handshake to include client identification, which the protocol supports via `client_info` in the `initialize` message.

---

## 12. Implementation Phases

### Phase 1: Provider Abstraction Layer

**Goal:** Extract the Anthropic-specific code into a provider interface. Ship with Anthropic only — no behavior change, just refactoring.

**New files:**
- `src/lib/ai/providers/types.ts` — Provider interface and types
- `src/lib/ai/providers/registry.ts` — Provider registry
- `src/lib/ai/providers/anthropic.ts` — Anthropic provider (extracted from existing code)
- `src/lib/ai/providers/models.ts` — Model catalog

**Modified files:**
- `src/app/api/ai/chat/route.ts` — Replace hardcoded Anthropic fetch with `provider.stream()`
- `src/lib/ai/resolve-key.ts` — Return `AIProviderConfig` (with `provider` field, defaulting to `"anthropic"`)
- `src/components/ai/AIChatPanel.tsx` — Update SSE parser for normalized format

**Files touched:** 7

### Phase 2: OpenAI Provider

**Goal:** Add OpenAI as a second provider option. Wire up all the way through.

**New files:**
- `src/lib/ai/providers/openai.ts` — OpenAI provider implementation

**Modified files:**
- `prisma/schema.prisma` — Add `AIProvider` enum, new fields on User and ServerSettings
- `src/lib/ai/resolve-key.ts` — Multi-provider key resolution logic
- `src/lib/ai/providers/models.ts` — Add OpenAI models

**Migration:** `npx prisma migrate dev --name add_multi_ai_provider`

**Files touched:** 4

### Phase 3: Google Gemini Provider

**Goal:** Add Google Gemini as a third provider.

**New files:**
- `src/lib/ai/providers/google.ts` — Google Gemini provider implementation

**Modified files:**
- `src/lib/ai/providers/models.ts` — Add Google models

**Files touched:** 2

### Phase 4: Database Migration & Backward Compat

**Goal:** Migrate existing Anthropic keys to the new schema. Backfill data.

**Modified files:**
- New Prisma migration (backfill SQL)
- `src/lib/ai/resolve-key.ts` — Legacy fallback paths for old field names

**Files touched:** 2

### Phase 5: UI — User & Admin Settings

**Goal:** Provider selector in user settings, per-provider keys in admin settings.

**New files:**
- `src/app/api/ai/test-key/route.ts` — Key validation endpoint

**Modified files:**
- `src/components/settings/AISettingsSection.tsx` — Provider dropdown, model dropdown, key input
- `src/components/admin/ServerSettingsForm.tsx` — Per-provider key configuration
- `src/components/ai/AIChatPanel.tsx` — Provider/model indicator in header
- `src/app/api/settings/ai/route.ts` — Accept new fields
- `src/app/api/admin/settings/route.ts` — Accept new fields

**Files touched:** 6

### Phase 6: Update All AI Callers

**Goal:** Replace every remaining hardcoded Anthropic call with the provider abstraction.

**Modified files (one-line changes each):**
- `src/app/api/ai/scaffold-project/route.ts` (from AI_PROJECT_SCAFFOLDING spec)
- `src/app/api/ai/parse-task/route.ts` (from NATURAL_LANGUAGE_TASKS spec)
- `src/lib/ai/scaffold-ai.ts` (shared scaffold function)
- Any other AI endpoints added by future specs

**Files touched:** ~3-4

---

## 13. Edge Cases

- **Key for wrong provider:** User sets provider to OpenAI but enters an Anthropic key. The test-key endpoint catches this. The provider implementation will return an auth error, surfaced as "AI unavailable" with a suggestion to check settings.
- **Provider down:** If OpenAI is down but Anthropic works, users on OpenAI see errors. No automatic fallback — the user chose their provider. Show a clear error: "OpenAI returned an error. You can switch providers in Settings > AI."
- **Model removed by provider:** If a model ID becomes invalid (provider deprecates it), the API call fails. The model catalog should be updated when this happens. The error message should suggest updating the model in settings.
- **Mixed provider in server keys:** Admin configures an Anthropic server key but a user chooses OpenAI with no user key and no OpenAI server key. The user gets "AI not available — no API key for OpenAI. Add your own key in Settings or ask your admin."
- **Prompt differences:** The system prompt works identically across providers (all support system messages). JSON-mode responses may vary in reliability — OpenAI has `response_format: { type: "json_object" }`, Anthropic and Google rely on prompt instructions. For structured output endpoints (scaffold, parse-task), add provider-specific hints if needed.
- **Token counting:** Different providers count tokens differently. The daily message limit counts *messages* (API calls), not tokens, so this is provider-agnostic. Token usage in the response is informational only.
- **Streaming format differences:** All handled inside the provider implementations. The client always sees the same normalized SSE format.
- **Legacy keys:** During migration, existing `anthropicApiKey` values continue to work via the fallback path in `resolveAIConfig`. No user action required.

---

## 14. What This Spec Does Not Cover

- **Provider-specific features:** Tool use / function calling (Anthropic's tool_use, OpenAI's function_calling, Google's function declarations) are not abstracted. The current AI features only use text completion.
- **Image/multimodal input:** All providers support image input, but Tandem's AI features are text-only. Multimodal support would be a separate spec.
- **Fine-tuned models:** OpenAI supports fine-tuned model IDs. Users can enter any model ID in the settings, so this works implicitly.
- **Self-hosted models:** Ollama, vLLM, or other local model servers could be added as a fourth provider type later. The OpenAI provider would work with any OpenAI-compatible API by making the base URL configurable.
- **Cost tracking:** Tracking per-user API costs across providers. The daily message limit is a rough proxy; detailed cost tracking would require per-provider token pricing tables.
- **A/B testing between providers:** No mechanism to randomly route requests to different providers for comparison.
- **Provider-specific rate limits:** Each provider has its own rate limits (TPM, RPM). Tandem's rate limiting is per-user regardless of provider. If a user hits the provider's rate limit, the error is surfaced.

---

## 15. Key Files Reference

| File | What's There Now | What Changes |
|---|---|---|
| `src/lib/ai/resolve-key.ts` | Anthropic-only config resolution | Multi-provider resolution with fallback chain |
| `src/app/api/ai/chat/route.ts` | Hardcoded Anthropic fetch + SSE | Uses `provider.stream()` from registry |
| `src/lib/ai/crypto.ts` | AES-256-GCM encrypt/decrypt | No changes — reused for all provider keys |
| `src/components/settings/AISettingsSection.tsx` | Anthropic key input only | Provider selector, model dropdown, key input |
| `src/components/admin/ServerSettingsForm.tsx` | Single model dropdown | Per-provider keys and model defaults |
| `src/components/ai/AIChatPanel.tsx` | Anthropic SSE parser | Normalized SSE parser, provider indicator |
| `prisma/schema.prisma` | `anthropicApiKey` fields | New `AIProvider` enum, provider-aware fields |
| `src/mcp/tools.ts` | MCP tool handlers | No changes — MCP is provider-agnostic |
