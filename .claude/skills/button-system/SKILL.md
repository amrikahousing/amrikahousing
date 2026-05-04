---
name: button-system
description: >-
  Button design system for the amrikahousing app. Use whenever adding, editing,
  or reviewing any button in the codebase — including pages, modals, forms,
  and wizards. Defines the four tiers: primary CTA (near-black), confirmation/
  success (emerald), secondary/ghost (outline), destructive (red), and warning
  (amber). Covers when to use each tier, exact Tailwind classes, disabled
  states, and what NOT to change (badges, toggles, dark-themed pages).

---

## Button Tiers

### 1. Primary CTA — near-black
Use for: initiating actions (Add, Invite, Connect, Send, Next in wizard, Submit new thing).

```
bg-slate-950 hover:bg-slate-800 text-white rounded-lg px-4 py-2.5
text-sm font-semibold transition-colors
disabled:cursor-not-allowed disabled:opacity-60
```

Examples: "Add Unit", "Add User", "Invite", "Send message", "Next", "Submit request", "Connect bank"

### 2. Confirmation / Success — emerald
Use for: affirming a change that already happened or completing a flow (Save, Done, Mark complete, Confirm payment).

```
bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2.5
text-sm font-semibold transition-colors
disabled:cursor-not-allowed disabled:opacity-60
```

Examples: "Save changes", "Save Unit", "Mark complete", "Confirm payment", "Done"

### 3. Secondary / Ghost — neutral outline
Use for: reversible or low-commitment actions (Cancel, Back, Skip, Close).

```
border border-slate-200 bg-white text-slate-700 hover:bg-slate-50
rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors
```

### 4. Destructive — red
Use for: genuinely irreversible actions only (Delete account, Permanently remove, Delete all data).

```
bg-red-700 hover:bg-red-800 text-white rounded-lg px-4 py-2.5
text-sm font-semibold transition-colors
```

### 5. Warning / Cautionary — amber
Use for: reversible but consequential actions (Deactivate, Archive).

```
bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2.5
text-sm font-semibold transition-colors
```

---

## Decision Rules

| Action type | Tier |
|---|---|
| Add / Create / Invite / Connect / Send / Next | Primary (near-black) |
| Save / Done / Mark complete / Confirm | Confirmation (emerald) |
| Cancel / Back / Skip / Close | Secondary (outline) |
| Delete / Remove permanently | Destructive (red) |
| Deactivate / Archive | Warning (amber) |

**One primary color per app** — do not add new brand colors.  
**WCAG AA**: ensure 4.5:1 contrast ratio between text and button background.  
**Pair with labels** — don't rely on color alone; use clear text and icons.

---

## Do NOT Change

- **Status badge pills** — `bg-emerald-50 text-emerald-700`, `bg-amber-50 text-amber-700`, etc. These indicate state, not actions.
- **Toggle / switch buttons** — on/off state-driven colors (e.g. autopay toggle).
- **Progress indicators, dots, chart bars** — purely visual.
- **Icon-only buttons** — `h-7 w-7 rounded hover:bg-slate-100` — these are utility buttons, not CTAs.
- **Login page buttons** (`src/app/login/page.tsx`) — dark-themed page, emerald provides necessary contrast.
- **Onboarding flow** (`src/app/onboarding/OnboardingFlow.tsx`) — dark-themed page, same reason.
- **Context menu items** — inline text links inside dropdown menus.

---

## Height Variants

Preserve existing heights — do not change height classes when updating color:

| Size | Class | Use |
|---|---|---|
| Small | `h-8` or `h-9` | Inline / table row actions |
| Medium | `h-10` | Standard modal/form buttons |
| Large | `h-11` or `h-12` | Primary page CTAs, full-width buttons |
