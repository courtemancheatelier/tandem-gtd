# GTD Education Popup — Feature Specification

**Document:** `docs/specs/GTD_EDUCATION_POPUP.md`  
**Version:** v1.0  
**Status:** Ready for Implementation  
**Author:** Jason Courtemanche / Courtemanche Atelier  
**Date:** March 6, 2026  

---

## 1. Problem Statement

A significant portion of visitors to tandemgtd.com have no prior exposure to Getting Things Done. For these visitors, product-level copy ("faithful GTD implementation," "cascade engine," "Horizons of Focus") creates confusion rather than excitement — they don't know what they're looking at or why it matters.

The existing landing page assumes GTD familiarity it cannot count on. This popup bridges that knowledge gap before the visitor forms a negative first impression.

---

## 2. Goals

- Give GTD-unfamiliar visitors a compact, honest orientation to what GTD is and why it matters
- Do it without derailing the browsing experience for visitors who *do* know GTD
- Help unfamiliar visitors feel informed enough to evaluate Tandem fairly
- Establish Tandem's philosophy (data ownership, faithful methodology) early — not just explain GTD generically

---

## 3. Trigger Behavior

### 3.1 When to Show

The popup is triggered by clicking a persistent **"New to GTD?"** contextual link that appears on the landing page. It is **not** an auto-popup on page load — that's intrusive and would penalize users who already know GTD.

Placement of the trigger link:
- Inline with the hero headline/subhead, directly below or adjacent to where the GTD acronym first appears
- Example: *"A faithful implementation of GTD — [New to GTD?]"*

### 3.2 Show/Hide State

- Dismissed state is stored in `localStorage` under `tandem_gtd_intro_seen` 
- Once dismissed, the trigger link remains visible but the popup does not auto-reopen
- User can re-open at any time by clicking the link again (it functions as a toggle/reveal)
- No suppression on subsequent visits — the link is always available; the auto-trigger is what gets suppressed

---

## 4. Content Architecture — Five Slides

The popup is a **stepped modal** — not a wall of text. Five compact slides, each answering one question. Users advance manually with a "Next →" button, or can jump via step indicators.

---

### Slide 1 — What is GTD?

**Headline:** Your brain is for having ideas, not holding them.

**Body:**
Getting Things Done (GTD) is a personal productivity method created by David Allen. The core insight is simple: your brain is terrible at storing to-do lists, but excellent at solving problems — if it isn't simultaneously trying to remember everything you're supposed to do.

GTD gives you a trusted external system to hold all your commitments, so your mind stays clear.

**Visual concept:** Simple two-column contrast — left: cluttered brain with thought bubbles (sticky notes, errands, deadlines, emails); right: calm brain with an arrow pointing to an organized system.

---

### Slide 2 — What Problem Does It Solve?

**Headline:** The "I should really..." feeling has a name.

**Body:**
You know that low-level background anxiety — the sense that you're forgetting something, or that you're working on the wrong thing? GTD calls that an "open loop": a commitment you've made to yourself that isn't captured anywhere your brain trusts.

Every unmade dentist appointment, unfinished project, or unanswered email is an open loop quietly draining your attention.

GTD closes the loops — not by doing everything at once, but by giving every commitment a proper home.

**Visual concept:** A loop icon (open circle with tension, then a closed/resolved circle). Or simply: a mind filled with floating sticky notes → all notes filed into labeled slots.

---

### Slide 3 — How Is It Different from a To-Do List?

**Headline:** A to-do list asks "what?" GTD asks "what *next*?"

**Body:**
Most to-do apps give you a place to write "Bathroom renovation." GTD asks you to define the *next physical action* — the one specific thing you could do today to move it forward.

"Bathroom renovation" isn't actionable. "Search tile prices on Home Depot" is.

GTD also organizes by **context** — where you are, what tools you have, how much energy you have. So when you're at a hardware store with 20 minutes, you see *exactly* what you can do right now. Not everything you've ever thought of doing.

**Visual concept:** Side-by-side comparison: generic to-do list (vague) vs. GTD-style next actions list (specific, contextual). Or a filter icon showing "@Home / 30 min / Medium energy → 3 tasks visible."

---

### Slide 4 — The Five Steps (Brief Overview)

**Headline:** It's a workflow, not just a list.

**Body:**
GTD is a five-step cycle you run continuously:

1. **Capture** — Get everything out of your head into an inbox
2. **Clarify** — Decide what each item is and what (if anything) to do about it
3. **Organize** — Put it where it belongs: your calendar, an action list, reference, or the trash
4. **Reflect** — Review your system regularly so it stays trusted
5. **Engage** — Choose what to work on with confidence, not anxiety

The magic is in the system you build and the habit of maintaining it — not in any single piece.

**Visual concept:** Horizontal five-step flow diagram with icons. Can be simple and monochromatic — this slide is reference material, not an emotional hook.

---

### Slide 5 — Why Tandem?

**Headline:** A GTD app that thinks in GTD.

**Body:**
Most productivity apps bolt GTD terminology onto a generic task list. Tandem was built from the ground up around the methodology — including the parts most apps skip.

- When you complete a task, Tandem automatically surfaces what's next in your project — you don't hunt for it
- Your context filters are the primary work surface, not a buried feature
- The Weekly Review is guided and interactive, not just a reminder to do one
- Your data lives on your server. GTD is an intimate map of your mind — it belongs to you

You don't have to know GTD deeply to start. Tandem grows with you.

**CTA:** [Start your free trial →] or [Back to Tandem →]

**Visual concept:** Tandem UI screenshot or simplified mockup showing the "What Should I Do Now?" view with context filters active.

---

## 5. UX Specifications

### 5.1 Modal Design

| Property | Value |
|---|---|
| Max width | 640px |
| Overlay | Semi-transparent dark backdrop (`bg-black/60`) |
| Padding | 32px |
| Border radius | `rounded-2xl` |
| Close button | Top-right `×`, always visible |
| Step indicators | 5 dots at bottom, filled = visited |
| Navigation | Previous / Next buttons; slide 5 shows CTA instead of Next |
| Animation | Fade-in on open, slide transition between steps |
| Keyboard | `Escape` closes, arrow keys advance/retreat |
| Scroll behavior | Modal content scrollable if viewport is small (mobile) |

### 5.2 Trigger Link Style

The "New to GTD?" link should feel helpful, not promotional:
- Small, muted text link — not a button
- Consider a `?` circle icon prefix
- Example: `ⓘ New to GTD?`

### 5.3 Mobile Behavior

- Full-screen modal on viewports < 480px
- Each slide fits in a single screen without scrolling if possible
- Step indicator dots are tap targets (48px minimum)

---

## 6. Implementation Notes

### 6.1 Component Location

`components/marketing/GtdEducationModal.tsx`

Props:
```typescript
interface GtdEducationModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

### 6.2 State Management

- `currentSlide: number` (0–4)
- `hasBeenSeen: boolean` (from localStorage)
- No server-side state required — this is purely client-side

### 6.3 LocalStorage Key

`tandem_gtd_intro_seen` → `"true"` once user reaches slide 5 or explicitly dismisses

### 6.4 Analytics Events (optional)

If analytics are added later:
- `gtd_modal_opened`
- `gtd_modal_slide_N_viewed` (per slide)
- `gtd_modal_completed` (reached slide 5)
- `gtd_modal_dismissed` (closed before completing)

---

## 7. Content Tone Notes

- **Plain language throughout** — no GTD jargon until it's defined
- **Empathetic, not preachy** — "You know that feeling…" not "Most people fail to…"
- **Honest about the learning curve** — "Tandem grows with you" acknowledges GTD takes practice
- **Brief** — each slide is readable in under 30 seconds. This is an orientation, not a tutorial.
- **No urgency language** — no "Don't miss out" or time pressure. That's misaligned with Tandem's philosophy.

---

## 8. Open Design Questions (Resolved)

| Question | Decision |
|---|---|
| Auto-popup vs. opt-in trigger? | Opt-in trigger link — respects GTD-familiar users |
| How many slides? | Five — one question per slide, matches GTD's five steps |
| Include a visual on every slide? | Yes — even simple icons break up text and aid retention |
| Should the CTA go to sign-up or back to homepage? | Both options on slide 5; primary CTA is trial signup |
| Does this replace marketing copy or supplement it? | Supplements — this lives inside the marketing site, not replacing the hero section |

---

## 9. Future Enhancements (Out of Scope for v1.0)

- Video version of the GTD intro (15-second animated explainer)
- Persistent "GTD Primer" page linked from the modal for users who want to go deeper
- Localization (if Tandem expands internationally)
- A/B testing different slide copy or CTA placement

---

*Spec status: Complete. Ready for implementation.*
