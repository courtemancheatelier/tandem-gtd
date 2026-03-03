# Info Website & Operator Landing Page

> Public-facing landing pages for the flagship site (`tandemgtd.com`) and operator-customizable instance branding.

**Status:** Open
**Depends on:** ServerSettings singleton (`prisma/schema.prisma:321-340`), admin settings API (`src/app/api/admin/settings/route.ts`), admin settings UI (`src/app/(dashboard)/settings/admin/page.tsx`)

---

## 1. Overview

Tandem currently has no public-facing pages — the middleware redirects all unauthenticated visitors to `/login`. There's no way for someone to learn about Tandem before they hit a login screen, and no mechanism for operators to brand their instance.

This spec introduces a **two-tier landing page system**:

1. **Flagship site** (`tandemgtd.com`) — a marketing/info page explaining what Tandem is, the GTD methodology, how to get started as a user or operator, and links to GitHub/docs.
2. **Operator landing pages** — each instance operator can customize a public-facing landing page with their own branding, description, and signup CTA. A footer links back to `tandemgtd.com`.

The approach is **hybrid**: static page structure lives in code, key content blocks are stored in the database and editable via admin settings. This avoids a full CMS while giving operators real customization.

---

## 2. Schema Changes

### 2.1 New Fields on `ServerSettings`

Add the following fields to the existing `ServerSettings` model (`prisma/schema.prisma:321-340`):

```prisma
model ServerSettings {
  // ... existing fields ...

  // ── Instance Branding ──────────────────────────────────────────────
  landingMode        LandingMode @default(OPERATOR)
  instanceName       String      @default("Tandem GTD")
  instanceTagline    String      @default("A self-hosted GTD app that actually does GTD.")
  instanceDesc       String?     // Short markdown description for the landing page hero
  instanceLogoUrl    String?     // URL or path to a custom logo image
  accentColor        String      @default("#6366f1") // Primary accent (hex)
  operatorName       String?     // e.g. "Courtemanche Atelier"
  operatorUrl        String?     // e.g. "https://example.com"
  landingEnabled     Boolean     @default(true) // Show landing page at / (false = redirect to /login)

  // ── Content Blocks ─────────────────────────────────────────────────
  heroHeading        String?     // Override default hero heading
  heroDescription    String?     // Override default hero description (markdown)
  featureHighlights  String?     // JSON array of {title, description, icon} — max 6
  ctaHeading         String?     // Override default CTA section heading
  ctaDescription     String?     // Override default CTA description
  ctaButtonText      String?     // Override default CTA button label
  ctaButtonUrl       String?     // Override default CTA button link (default: /login)
}
```

### 2.2 LandingMode Enum

```prisma
enum LandingMode {
  FLAGSHIP   // tandemgtd.com — full marketing site with operator CTA
  OPERATOR   // Operator instance — custom branding with "Powered by Tandem" footer
}
```

### 2.3 Defaults Strategy

All new fields have sensible defaults or are nullable. Existing instances get `OPERATOR` mode with "Tandem GTD" branding — the landing page looks good out of the box with zero configuration. The `FLAGSHIP` mode is only set on the official `tandemgtd.com` instance.

---

## 3. Public Route Group

### 3.1 Route Structure

Create a new `(public)` route group for pages that don't require authentication:

```
src/app/
├── (public)/
│   ├── layout.tsx          # Minimal layout (no sidebar, no auth check)
│   ├── page.tsx            # Landing page (/ route)
│   └── about/
│       └── page.tsx        # Optional: about page (flagship only)
├── (auth)/
│   └── login/
│       └── page.tsx        # Existing login page
├── (dashboard)/
│   └── ...                 # Existing authenticated pages
```

### 3.2 Public Layout

The `(public)/layout.tsx` provides a minimal shell:
- No sidebar or dashboard navigation
- No auth context or session provider
- Clean, marketing-focused layout
- Responsive container with max-width
- Shared footer component

### 3.3 Middleware Exclusions

Update `src/middleware.ts` (line 66) to exclude the landing page and other public routes from auth:

```typescript
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login|manifest\\.json|sw\\.js|offline\\.html|icons/|\\.well-known/|about).*)",
  ],
};
```

Additionally, add logic in the middleware function to handle the `/` route:

```typescript
export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public landing page: skip auth, but redirect authenticated users to /do-now
  if (pathname === "/") {
    // Check for session token cookie
    const hasSession =
      req.cookies.has("next-auth.session-token") ||
      req.cookies.has("__Secure-next-auth.session-token");
    if (hasSession) {
      return NextResponse.redirect(new URL("/do-now", req.url));
    }
    return NextResponse.next();
  }

  // ... existing API and page route handling ...
}
```

**Key behavior:**
- Unauthenticated visitors see the landing page at `/`
- Authenticated users hitting `/` are redirected to `/do-now`
- `/login` remains excluded from auth (already in matcher)
- `/about` excluded from auth (flagship only)

---

## 4. Landing Page Design

### 4.1 Page Sections

The landing page (`(public)/page.tsx`) renders these sections top-to-bottom:

1. **Navigation bar** — Instance logo/name, "Log in" button, "Get Started" button
2. **Hero** — Large heading, description text, primary CTA button
3. **Features** — 3-6 feature cards in a responsive grid
4. **How it works** — 3-step visual flow (flagship: "Deploy → Configure → Invite"; operator: "Sign up → Set up → Start capturing")
5. **CTA section** — Final call to action with heading, description, button
6. **Footer** — Instance info, links, attribution

### 4.2 Responsive Layout

- **Desktop:** Full-width hero, 3-column feature grid, centered CTA
- **Tablet:** 2-column feature grid, slightly reduced spacing
- **Mobile:** Single column, stacked features, full-width CTA buttons

### 4.3 Styling

- Uses Tailwind CSS and the existing design system
- Respects dark mode via existing `dark:` classes
- Accent color from `accentColor` field applied via CSS custom property
- Clean, modern look — no heavy graphics, typography-driven
- Consistent with the existing Tandem UI aesthetic

---

## 5. Flagship vs Operator Mode

### 5.1 Flagship Mode (`FLAGSHIP`)

Set only on `tandemgtd.com`. Content focuses on:

- **Hero:** "Your GTD system, your hardware, your rules." — explains what Tandem is and why self-hosting matters
- **Features:** Cascade engine, context views, Horizons, Weekly Review, multi-user, open source
- **How it works:** "Deploy → Configure → Invite" — three steps to running your own instance
- **CTA (operators):** "Run Your Own Instance" → links to GitHub/docs
- **CTA (users):** "Find a Tandem Instance" → links to a directory or instructions
- **Footer:** GitHub link, documentation link, license info, "Built by Courtemanche Atelier"

### 5.2 Operator Mode (`OPERATOR`)

Default for all instances. Content is customizable:

- **Hero:** Operator's heading + description (defaults: instance name + tagline)
- **Features:** Operator's feature highlights (defaults: same GTD features as flagship)
- **How it works:** "Sign up → Set up → Start capturing" — three steps to getting started
- **CTA:** "Get Started" → links to `/login` (or operator's custom URL)
- **Footer:** Operator name/link, **"Powered by [Tandem GTD](https://tandemgtd.com)"** attribution (always present, not removable)

### 5.3 Content Resolution

The landing page component resolves content in this order:
1. Custom value from `ServerSettings` (if non-null)
2. Mode-specific default (flagship vs operator defaults differ)
3. Universal fallback

```typescript
function resolveContent(settings: ServerSettings) {
  return {
    heroHeading:
      settings.heroHeading ??
      (settings.landingMode === "FLAGSHIP"
        ? "Your GTD system, your hardware, your rules."
        : settings.instanceName),
    heroDescription:
      settings.heroDescription ??
      (settings.landingMode === "FLAGSHIP"
        ? "Tandem is an open-source implementation of David Allen's Getting Things Done..."
        : settings.instanceTagline),
    // ... etc
  };
}
```

---

## 6. Content Block System

### 6.1 Editable Blocks

Each content block is a field on `ServerSettings` (see section 2.1). Blocks support:

- **Plain text** — headings, button labels
- **Markdown** — descriptions (rendered with the existing `react-markdown` setup)
- **JSON** — feature highlights (structured array)

### 6.2 Feature Highlights Schema

The `featureHighlights` field stores a JSON array:

```typescript
interface FeatureHighlight {
  title: string;       // e.g. "Next-Action Cascade"
  description: string; // Short markdown description
  icon: string;        // Lucide icon name (e.g. "zap", "target", "mountain")
}
```

Maximum 6 highlights. Default set differs by mode:

**Flagship defaults:**
| Icon | Title | Description |
|------|-------|-------------|
| `zap` | Next-Action Cascade | Complete a task, the system promotes what's next |
| `target` | Context Views | "What Should I Do Now?" across all projects |
| `mountain` | Horizons of Focus | All six GTD altitudes, from runway to 50,000 ft |
| `clipboard-check` | Weekly Review | Interactive guided review workflow |
| `users` | Multi-User | Share projects and delegate within your instance |
| `lock-open` | Fully Open Source | AGPL-3.0, no tiers, no gated features |

**Operator defaults:** Same set, emphasizing the instance's GTD capabilities.

### 6.3 Content API

The existing admin settings API (`/api/admin/settings`) handles branding fields alongside other settings — no separate endpoint needed. The PATCH endpoint already accepts arbitrary allowed fields and upserts.

Add a **public** endpoint for the landing page to fetch branding without authentication:

```
GET /api/public/branding
```

Returns only the public-safe branding fields:

```typescript
{
  landingMode: "OPERATOR",
  instanceName: "Tandem GTD",
  instanceTagline: "A self-hosted GTD app...",
  instanceDesc: null,
  instanceLogoUrl: null,
  accentColor: "#6366f1",
  operatorName: "Courtemanche Atelier",
  operatorUrl: "https://example.com",
  landingEnabled: true,
  heroHeading: null,
  heroDescription: null,
  featureHighlights: null,
  ctaHeading: null,
  ctaDescription: null,
  ctaButtonText: null,
  ctaButtonUrl: null,
  registrationMode: "WAITLIST"
}
```

This endpoint requires no auth and omits all sensitive settings (AI keys, toggles, etc.).

---

## 7. Admin Branding UI

### 7.1 New Section in Admin Settings

Add a new collapsible section to `ServerSettingsForm` (`src/components/admin/ServerSettingsForm.tsx`) titled **"Branding & Landing Page"**. Place it at the top of the form, before the AI Configuration section.

### 7.2 Form Fields

| Field | Control | Notes |
|-------|---------|-------|
| Landing Page | Switch | `landingEnabled` — show landing page at `/` or redirect to `/login` |
| Landing Mode | Select | `FLAGSHIP` / `OPERATOR` — only visible to admins |
| Instance Name | Input | `instanceName` — shown in navbar, login, footer |
| Tagline | Input | `instanceTagline` — one-line description |
| Description | Textarea | `instanceDesc` — markdown, shown in hero |
| Logo URL | Input | `instanceLogoUrl` — URL to logo image |
| Accent Color | Color input | `accentColor` — hex color picker |
| Operator Name | Input | `operatorName` — who runs this instance |
| Operator URL | Input | `operatorUrl` — link to operator's site |

### 7.3 Content Blocks Editor

Below the branding fields, a sub-section for **Landing Page Content**:

| Field | Control | Notes |
|-------|---------|-------|
| Hero Heading | Input | Override default hero heading |
| Hero Description | Textarea | Markdown, override default hero description |
| Feature Highlights | Structured editor | Add/edit/remove up to 6 features (title + description + icon picker) |
| CTA Heading | Input | Override default CTA heading |
| CTA Description | Textarea | Override default CTA description |
| CTA Button Text | Input | Override default button label |
| CTA Button URL | Input | Override default button link |

Empty fields fall back to mode-specific defaults. A "Reset to Defaults" button clears all content overrides.

### 7.4 Preview

A "Preview Landing Page" link opens `/` in a new tab. The admin can toggle `landingEnabled` off while editing, then enable when ready.

---

## 8. Login Page Branding

### 8.1 Instance Name & Logo

Update the login page (`src/app/(auth)/login/page.tsx`) to:

1. Fetch branding from `/api/public/branding` (or use a server component with direct DB access)
2. Display `instanceLogoUrl` (if set) above the login form
3. Display `instanceName` instead of hardcoded "Tandem GTD"
4. Apply `accentColor` to the primary button

### 8.2 "Powered by" Footer

On operator instances, the login page footer shows:

```
Powered by Tandem GTD — tandemgtd.com
```

This links to `https://tandemgtd.com` and is always present on non-flagship instances.

### 8.3 Registration Mode Awareness

The login page already handles `WAITLIST` vs `OPEN` registration modes. No changes needed to that logic — the branding is purely visual.

---

## 9. Middleware & Routing

### 9.1 Route Table

| Route | Auth Required | Notes |
|-------|--------------|-------|
| `/` | No | Landing page (public) |
| `/about` | No | About page (flagship only) |
| `/login` | No | Login page (existing) |
| `/do-now` | Yes | Main dashboard (existing) |
| All other `(dashboard)` routes | Yes | Existing behavior |

### 9.2 Authenticated User Redirect

When an authenticated user visits `/`, redirect to `/do-now` (see middleware changes in section 3.3). This keeps the experience seamless — logged-in users never see the marketing page.

### 9.3 Landing Disabled Redirect

When `landingEnabled` is `false`, the `/` route redirects to `/login`. This is the legacy behavior and serves as a fallback for operators who don't want a public page.

Implementation: the `(public)/page.tsx` component checks `landingEnabled` via the branding API and performs a client-side redirect if disabled. Alternatively, use middleware:

```typescript
// In middleware, after session check for /
if (pathname === "/") {
  // Fetch landing settings (cached)
  const settings = await getLandingSettings();
  if (!settings.landingEnabled) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
```

**Note:** Middleware DB access requires careful handling. The recommended approach is to make the `(public)/page.tsx` a server component that reads settings directly and conditionally redirects, avoiding a DB call in middleware.

---

## 10. Migration

### 10.1 Prisma Migration

```
npx prisma migrate dev --name add-instance-branding
```

All new fields have defaults or are nullable — no data migration needed. Existing `ServerSettings` rows gain the new fields with defaults automatically.

### 10.2 Admin Settings API

Add the new fields to the `allowedFields` array in `src/app/api/admin/settings/route.ts` (line 59-76):

```typescript
const allowedFields = [
  // ... existing fields ...
  "landingMode",
  "instanceName",
  "instanceTagline",
  "instanceDesc",
  "instanceLogoUrl",
  "accentColor",
  "operatorName",
  "operatorUrl",
  "landingEnabled",
  "heroHeading",
  "heroDescription",
  "featureHighlights",
  "ctaHeading",
  "ctaDescription",
  "ctaButtonText",
  "ctaButtonUrl",
];
```

### 10.3 GET Response

Update the GET handler defaults (line 23-43) to include the new fields with their defaults.

---

## 11. Edge Cases

### 11.1 No Custom Content

When an operator hasn't customized anything, the landing page shows sensible defaults based on `landingMode`. The page looks complete and professional with zero configuration.

### 11.2 Landing Disabled

When `landingEnabled` is `false`:
- `/` redirects to `/login`
- Login page still shows instance branding (name, logo)
- No public information is exposed

### 11.3 Invalid Logo URL

If `instanceLogoUrl` points to a broken image:
- Render a text fallback using `instanceName`
- Use `next/image` with `onError` handler to detect and hide broken images

### 11.4 Long Content

- Hero heading: truncated via CSS (`line-clamp-2`) on mobile
- Hero description: rendered as markdown, scrollable if excessively long
- Feature highlights: grid wraps naturally; max 6 enforced in admin UI

### 11.5 SEO

- Landing page includes `<title>`, `<meta description>`, and Open Graph tags derived from instance branding
- Flagship mode includes structured data (JSON-LD) for the software application
- Operator mode includes `<meta name="robots" content="noindex">` by default (configurable)

### 11.6 Hardcoded "Tandem GTD" References

Audit the codebase for hardcoded "Tandem GTD" strings and replace with `instanceName` where appropriate:
- Page `<title>` tags
- PWA `manifest.json` name/short_name
- Email templates (if any)
- Login page heading

Some references should remain hardcoded (e.g. the "Powered by Tandem GTD" attribution footer).

---

## 12. Implementation Order

1. **Schema** — Add fields to `ServerSettings`, create `LandingMode` enum, run migration
2. **Public branding API** — `GET /api/public/branding` endpoint
3. **Admin settings API** — Add new fields to allowedFields in PATCH handler, update GET defaults
4. **Public route group** — Create `(public)` layout and landing page component
5. **Landing page** — Build sections (hero, features, how-it-works, CTA, footer) with content resolution
6. **Middleware** — Exclude `/` from auth, add authenticated redirect to `/do-now`
7. **Admin UI** — Add "Branding & Landing Page" section to `ServerSettingsForm`
8. **Login branding** — Update login page to use instance branding
9. **Flagship content** — Write default content for flagship mode
10. **Polish** — SEO, responsive testing, dark mode, broken-image handling

---

## 13. Non-Goals

- **Full CMS** — No page builder, no arbitrary pages, no WYSIWYG editor. The structure is fixed in code; only content blocks are editable.
- **Themes** — Only accent color is customizable. Full theming (fonts, layouts, component styles) is out of scope.
- **Multi-page marketing site** — Flagship gets `/` and optionally `/about`. No blog, no docs site, no pricing page. Keep it simple.
- **Logo upload** — Logo is specified via URL, not uploaded to the server. Operators can host their logo anywhere (S3, CDN, public URL).
- **i18n** — Landing page content is single-language. Internationalization is a separate concern.
