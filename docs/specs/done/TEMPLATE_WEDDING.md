# Template: Wedding Planning

**Spec version:** 1.0  
**Status:** Draft  
**Target release:** v1.3 (ships with EVENT_RSVP.md)  
**Depends on:** EVENT_RSVP.md, TEAMS.md

---

## 1. Overview

The Wedding Planning template is the flagship use case for the Event RSVP & Coordination feature. It ships as a ready-to-use template that couples can load when creating a new Event-linked project. It is opinionated by design — the structure reflects real wedding planning patterns, not a generic task list.

The template accomplishes two things simultaneously:

1. **For the couple** — a complete, phased planning system they can start using immediately, with the right tasks in the right order and delegation wired to the right people.
2. **For Tandem** — a demo-worthy, emotionally resonant example that shows off cascade, delegation, async threads, and the RSVP module all working together on something everyone understands.

The template assumes a **12-month planning horizon** but scales gracefully for shorter engagements — phases with future start dates simply stay deferred until relevant.

---

## 2. Team Structure

### 2.1 Roles

When the couple loads this template, they create a Team with the following pre-defined roles:

| Role | Who | Project visibility |
|---|---|---|
| **Couple** | Both partners (owners) | Everything |
| **Maid of Honor** | 1 person | Bridesmaid prep, bachelorette planning, day-of coordination |
| **Best Man** | 1 person | Groomsmen tasks, bachelor party planning, day-of coordination |
| **Bridesmaid** | 2–6 people | Bridesmaid prep, dress coordination, bachelorette planning |
| **Groomsman** | 2–6 people | Groomsmen tasks, attire coordination, bachelor party planning |
| **Family** | Parents, siblings | Ceremony logistics, accommodation info, rehearsal dinner |
| **Guest** | Everyone else | RSVP form only — no planning projects visible |

### 2.2 Invitation Flow

The couple invites each person by email and assigns their role. The invited person authenticates, completes their RSVP, and gains access to the projects their role permits. This is their onboarding into the team — the RSVP is not a separate form, it is the front door.

---

## 3. Project Structure

The template creates one parent project with six sequential sub-projects (phases). Within each phase, tasks are a mix of sequential (must complete in order) and parallel (can work simultaneously).

```
Wedding: [Couple's Names] — [Date]  (SEQUENTIAL parent)
├── Phase 1: Foundation             (PARALLEL — all tracks open at once)
├── Phase 2: Logistics              (PARALLEL)
├── Phase 3: Details                (PARALLEL)
├── Phase 4: Confirmation           (SEQUENTIAL — order matters here)
├── Phase 5: Final Week             (SEQUENTIAL)
└── Phase 6: Post-Wedding           (PARALLEL)
```

The parent project is SEQUENTIAL — Phase 2 becomes available only after Phase 1 is complete. Within each phase, most work is PARALLEL since vendors and logistics can be handled in any order.

---

## 4. Tasks by Phase

### Phase 1: Foundation
*12+ months out. Locks in the decisions everything else depends on.*  
**Project type:** PARALLEL  
**Outcome:** Venue booked, key vendors secured, budget agreed, wedding party assembled.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| Have the budget conversation — who contributes what | @partner | High | Couple | Do this before anything else. Every other decision flows from this number. |
| Set overall budget ceiling | @computer | Medium | Couple | |
| Draft initial guest list estimate (count only, not names) | @home | Low | Couple | Needed for venue sizing |
| Research and tour ceremony venues | @errands | High | Couple | Book tours, visit in person |
| Research and tour reception venues | @errands | High | Couple | Can be same venue or separate |
| Book ceremony venue — sign contract and pay deposit | @computer | High | Couple | |
| Book reception venue — sign contract and pay deposit | @computer | High | Couple | |
| Choose wedding date (or confirm venue's available dates) | @partner | Medium | Couple | |
| Decide on wedding style and color palette | @home | Medium | Couple | Browse Pinterest, magazines |
| Choose and ask Maid of Honor | @phone | High | Partner 1 | |
| Choose and ask Best Man | @phone | High | Partner 2 | |
| Choose and ask bridesmaids | @phone | High | Partner 1 | |
| Choose and ask groomsmen | @phone | High | Partner 2 | |
| Research and book photographer | @computer | High | Couple | Review portfolios, sign contract |
| Research and book videographer | @computer | High | Couple | Optional but time-sensitive |
| Research and book caterer (if not included with venue) | @computer | High | Couple | Schedule tasting |
| Research and book officiant | @phone | Medium | Couple | |
| Research and book DJ or band | @computer | High | Couple | Top vendors book 12+ months out |
| Research and book florist | @computer | Medium | Couple | |
| Consider hiring a wedding planner or day-of coordinator | @computer | Medium | Couple | |
| Get engagement ring insured | @phone | Low | Couple | |
| Consider wedding insurance | @computer | Low | Couple | |

### Phase 2: Logistics
*8–10 months out. Guest communication, attire, and supporting infrastructure.*  
**Project type:** PARALLEL  
**Outcome:** Save-the-dates sent, dress ordered, wedding website live, party attire selected, registries created.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| Build final guest list with names and addresses | @computer | Medium | Couple | |
| Create wedding website | @computer | Medium | Couple | Include date, venue, accommodation info |
| Create wedding hashtag | @home | Low | Couple | |
| Book engagement photo session | @phone | Low | Couple | |
| Design and order save-the-dates | @computer | Medium | Couple | |
| Mail save-the-dates | @errands | Low | Couple | 8 months out; 10+ months for destination |
| Begin wedding dress shopping | @errands | High | Partner 1 | Allow 6–9 months for delivery + fittings |
| Order wedding dress | @errands | High | Partner 1 | |
| Choose and order bridesmaid dresses | @errands | Medium | Maid of Honor | Delegate to MOH to coordinate with bridesmaids |
| Choose groomsmen attire (suits or tuxes) | @errands | Medium | Best Man | Delegate to BM to coordinate with groomsmen |
| Research and book rehearsal dinner venue | @computer | Medium | Couple | Often hosted by groom's family |
| Research accommodation blocks for out-of-town guests | @computer | Low | Couple | Reserve room blocks at 2–3 hotels |
| Share hotel accommodation info on wedding website | @computer | Low | Couple | |
| Create gift registries (2–3 retailers) | @computer | Low | Couple | |
| Book honeymoon destination and flights | @computer | High | Couple | Popular destinations book fast |
| Schedule catering tasting | @phone | Low | Couple | |
| Attend catering tasting and confirm menu direction | @errands | Medium | Couple | |

### Phase 3: Details
*4–6 months out. Invitations, food, beauty, and transportation.*  
**Project type:** PARALLEL  
**Outcome:** Invitations ordered, cake selected, transportation booked, beauty plan set.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| Design and order wedding invitations and stationery | @computer | Medium | Couple | Allow 6–8 weeks for printing |
| Assemble and mail invitations | @home | Low | Couple | 6–8 weeks before wedding |
| Set up RSVP system in Tandem (this Event) | @computer | Medium | Couple | Configure meal choices, dietary fields, lock date |
| Research and book hair stylist | @phone | Medium | Partner 1 | |
| Research and book makeup artist | @phone | Medium | Partner 1 | |
| Schedule hair and makeup trial | @phone | Low | Partner 1 | |
| Attend hair and makeup trial | @errands | Medium | Partner 1 | Bring inspiration photos |
| Research and book wedding cake / desserts | @errands | Medium | Couple | Attend tasting |
| Finalize cake design and flavors | @phone | Low | Couple | |
| Book wedding day transportation (limo, car service) | @computer | Medium | Couple | |
| Plan bachelor party | @computer | Medium | Best Man | Delegate fully to Best Man |
| Plan bachelorette party | @computer | Medium | Maid of Honor | Delegate fully to MOH |
| Research and order wedding favors | @computer | Low | Couple | |
| Write personal vows (if applicable) | @home | High | Each partner independently | Give plenty of time — not a last-minute task |
| Choose ceremony readings and readers | @partner | Medium | Couple | |
| Meet with officiant to plan ceremony details | @errands | Medium | Couple | |
| Order wedding party gifts (bridesmaids, groomsmen) | @computer | Low | Couple | |
| Order parent gifts | @computer | Low | Couple | |
| Purchase wedding rings | @errands | High | Couple | Allow time for sizing |
| Purchase wedding shoes and accessories | @errands | Medium | Couple | |

### Phase 4: Confirmation
*1–3 months out. Everything tightens up. Order matters.*  
**Project type:** SEQUENTIAL  
**Outcome:** All vendors confirmed, RSVPs closed, seating chart done, license obtained.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| First dress fitting | @errands | Medium | Partner 1 | Bring shoes and undergarments |
| Follow up with all RSVP non-responders | @phone | Medium | Maid of Honor | Delegate to MOH — this is exactly what Tandem threads are for |
| Close RSVP lock date in Tandem | @computer | Low | Couple | Cascade tasks fire automatically after this |
| Confirm final headcount with venue and caterer | @phone | Medium | Couple | Auto-triggered by RSVP lock |
| Compile dietary restrictions and send to caterer | @computer | Low | Couple | Auto-triggered by RSVP lock |
| Build seating chart | @computer | High | Couple | Needs final headcount first |
| Order place cards and table numbers | @computer | Low | Couple | |
| Order menu cards | @computer | Low | Couple | |
| Order ceremony programs | @computer | Low | Couple | |
| Send final confirmations to all vendors | @phone | Medium | Couple | Date, time, arrival logistics, contact info |
| Second dress fitting | @errands | Medium | Partner 1 | |
| Schedule final dress fitting | @phone | Low | Partner 1 | |
| Confirm bridesmaid dress fittings are complete | @phone | Low | Maid of Honor | Delegate to MOH |
| Confirm groomsmen attire fittings are scheduled | @phone | Low | Best Man | Delegate to Best Man |
| Apply for marriage license | @errands | Medium | Couple | Check local requirements — typically 2–4 weeks before wedding |
| Finalize ceremony order of events with officiant | @computer | Medium | Couple | |
| Choose processional and recessional music | @partner | Low | Couple | |
| Finalize reception playlist and must-play list with DJ/band | @computer | Low | Couple | Also specify do-not-play list |
| Plan reception décor details (centerpieces, linens, layout) | @computer | Medium | Couple | |
| Confirm honeymoon bookings (hotels, activities) | @computer | Low | Couple | |
| Final dress fitting | @errands | Medium | Partner 1 | |
| Write out complete wedding day timeline | @computer | High | Couple | Include vendor arrival times and contact info |
| Send wedding day timeline to all vendors and wedding party | @computer | Low | Couple | |

### Phase 5: Final Week
*7 days out. Delegate aggressively. Stay present.*  
**Project type:** SEQUENTIAL  
**Outcome:** Everything is handed off. The couple's only job on the wedding day is to enjoy it.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| Prepare vendor tip envelopes with labeled amounts | @home | Low | Couple | See gratuity guide in project notes |
| Give tip envelopes to Best Man or coordinator to distribute | @home | Low | Couple | Do not hold these yourself on the day |
| Assign day-of task list to wedding party members in Tandem | @computer | Medium | Couple | Cake pickup, vendor point-of-contact, gift collection, etc. |
| Confirm all wedding party members have reviewed their day-of tasks | @phone | Low | Maid of Honor | Delegate to MOH |
| Pack for honeymoon | @home | Low | Couple | |
| Check weather forecast and confirm venue contingency plan if needed | @computer | Low | Couple | |
| Final check — rings and marriage license located and packed | @home | Low | Couple | |
| Book spa or self-care treatment for yourself | @phone | Low | Couple | Optional but strongly recommended |
| Attend rehearsal at venue | @errands | Medium | Couple | Bring wedding party and immediate family |
| Rehearsal dinner | @errands | High | Couple | Be present — this is the last calm night |
| Wedding day — hand off the checklist, enjoy every moment | — | — | — | Your only job today is to be here. |

### Phase 6: Post-Wedding
*After the wedding. Loose ends and memories.*  
**Project type:** PARALLEL  
**Outcome:** Thank-you cards sent, dress preserved, memories secured.

| Task | Context | Energy | Assignee | Notes |
|---|---|---|---|---|
| Write and send thank-you cards | @home | Low | Couple | Within 3 months — don't procrastinate |
| Complete gift registry — exchange duplicates or unwanted items | @errands | Low | Couple | |
| Have wedding dress cleaned and preserved | @errands | Low | Partner 1 | Use a reputable preservation specialist |
| Follow up with photographer on album timeline | @phone | Low | Couple | |
| Follow up with videographer on delivery timeline | @phone | Low | Couple | |
| Update legal name if applicable | @errands | Medium | Couple | Social Security, DMV, passport, bank accounts |
| Change address if applicable | @computer | Low | Couple | |

---

## 5. Event Configuration

### 5.1 Event Settings

| Field | Value |
|---|---|
| Event title | "[Partner 1] & [Partner 2]'s Wedding" |
| Event date | Wedding date |
| RSVP lock date | 4 weeks before wedding date (configurable) |
| Linked project | This wedding project |
| Linked team | This wedding team |

### 5.2 Response Fields

These fields are pre-configured when the template loads. The couple can add, remove, or edit them.

| Field | Type | Required | Notes |
|---|---|---|---|
| Attendance | `attendance` | Yes | Will you be joining us? |
| Party size | `headcount` | Yes (if attending) | How many guests in your party? (including yourself) |
| Meal choice | `single_select` | Yes (if attending) | Options: Chicken / Fish / Vegetarian / Child's meal |
| Dietary restrictions | `multi_select` | No | Options: Gluten-free / Nut allergy / Vegan / Dairy-free / Kosher / Halal / Other |
| Notes for the couple | `text` | No | Anything else we should know? |

### 5.3 Cascade Trigger Tasks

These tasks fire automatically when the RSVP lock date passes:

| Condition | Task generated | Assignee |
|---|---|---|
| Lock date passes | "Confirm final headcount ({{confirmed_headcount}}) with venue" | Couple |
| Lock date passes | "Confirm final headcount ({{confirmed_headcount}}) with caterer" | Couple |
| Dietary flags present | "Compile dietary restrictions list and send to caterer" | Couple |
| Any guests have not responded 3 days before lock | "Follow up with RSVP non-responders" | Maid of Honor |
| All responses in before lock date | "All RSVPs received — headcount confirmed" (closes tracker) | — |

---

## 6. Pre-Wired Delegations

These tasks are pre-assigned to wedding party roles when the template loads. They become active only once the relevant team member has accepted their invitation and authenticated.

| Task | Delegated to | Phase |
|---|---|---|
| Coordinate bridesmaid dress ordering and fittings | Maid of Honor | Phase 2 |
| Coordinate groomsmen attire and fittings | Best Man | Phase 2 |
| Plan bachelorette party | Maid of Honor | Phase 3 |
| Plan bachelor party | Best Man | Phase 3 |
| Follow up with RSVP non-responders | Maid of Honor | Phase 4 |
| Confirm bridesmaid dress fittings are complete | Maid of Honor | Phase 4 |
| Confirm groomsmen attire fittings are scheduled | Best Man | Phase 4 |
| Distribute vendor tip envelopes on wedding day | Best Man | Phase 5 |
| Confirm wedding party has reviewed day-of tasks | Maid of Honor | Phase 5 |
| Collect gifts and cards at end of reception | Best Man | Phase 5 |

---

## 7. Suggested Thread Topics

The template pre-creates these discussion threads in the project to give the couple and wedding party a structured place for async decisions. Each thread is attached to the relevant task.

| Thread title | Type | Attached to |
|---|---|---|
| "Groomsmen suit color and style — vote here" | QUESTION | Groomsmen attire task |
| "Bridesmaid dress color shortlist" | QUESTION | Bridesmaid dress task |
| "DJ must-play and do-not-play list" | UPDATE | DJ/band task |
| "Ceremony readings — suggestions welcome" | QUESTION | Choose ceremony readings task |
| "Day-of task assignments — confirm you've seen yours" | FYI | Assign day-of task list task |

These replace group texts. The conversation stays attached to the decision it belongs to.

---

## 8. Project Notes (Shown in Project Description)

The template pre-populates the project description with a brief orientation for the couple:

> **Welcome to your wedding project.**
>
> This project is organized into six phases that follow the natural rhythm of wedding planning. Phase 1 unlocks immediately — it covers the decisions that everything else depends on. Later phases become available as earlier ones complete.
>
> Your Maid of Honor and Best Man have pre-assigned tasks waiting for them once they accept their invitations. Send those invitations early — the sooner they're in the system, the sooner the delegation machinery starts working for you.
>
> The RSVP module handles guest responses automatically. Once you set a lock date, Tandem will follow up with non-responders and automatically queue your headcount confirmation tasks when responses close.
>
> **Your only job is to make decisions. Tandem handles the reminders.**

---

## 9. Gratuity Reference (Project Wiki Page)

The template creates a wiki page titled "Vendor Gratuity Guide" linked from the tip envelope task in Phase 5. This gives the couple a reference point without needing to leave the app.

Standard gratuity ranges to include:
- Venue coordinator: $50–$100
- Caterer / catering staff: 15–20% of food and beverage bill (if not included)
- Photographer: $50–$200
- Videographer: $50–$200
- DJ: $50–$150
- Band (per musician): $25–$50
- Florist: $50–$100
- Officiant: $50–$100 (or donation to their organization)
- Hair stylist: 15–20%
- Makeup artist: 15–20%
- Driver / transportation: 15–20%

Note: These are guidelines, not rules. Tip based on quality of service and your budget.

---

## 10. Open Questions

| # | Question | Decision |
|---|---|---|
| 1 | Should the template default to Partner 1 / Partner 2 naming, or gender-specific roles (Bride/Groom)? | Default to Partner 1 / Partner 2. Gender-neutral. Couples can rename. |
| 2 | Should Phase 1 tasks include estimated due dates calculated from the wedding date? | Yes — if the couple sets the wedding date during setup, each phase's tasks get suggested due dates pre-filled. Couple can override. |
| 3 | Should the template prompt for a wedding date before loading, or load first and let the couple set it? | Prompt first. The date is needed to calculate phase timelines. A 2-step setup wizard: (1) set date and names, (2) load template. |
