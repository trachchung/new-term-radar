---
name: poker-ui-system
description: Project-specific UI/UX rules for the Fullring poker monorepo (React 19 + Vite + Tailwind 4). Activate FIRST for any frontend work in poker-user-web / poker-tracker-admin / packages/poker-ui. Covers the dark broadcast-editorial aesthetic, the 3-surface unification pattern (live replay / read-only Tables tab / share PNG capture), snapdom capture constraints, motion-stack split (animejs vs framer-motion), the gold + burgundy + jewel-tone palette, the Plus Jakarta + Be Vietnam Pro + Space Grotesk typography, lucide-react iconography, and mock-first dev mode. Overrides generic anti-AI-slop rules that would false-positive intentional broadcast-poker patterns (uppercase small-caps labels, centred felt, round chip values, mock player names).
---

# Poker UI System

The Fullring monorepo ships a poker tournament platform: live tracking, hand replay, share artifacts. This skill captures the project's REAL design system so you don't override it with generic web-design defaults.

Read this BEFORE `taste-skill`, `frontend-design`, `redesign-skill`, or `ui-ux-pro-max`. Those skills are generic; this skill wins on every conflict for files inside `poker-user-web/`, `poker-tracker-admin/`, or `packages/poker-ui/`.

## 1. Stack reality — verify before assuming

Generic skills push Next.js + RSC + Phosphor + Geist. None apply here.

```jsonc
// Actual stack (from poker-user-web/package.json — verify if unsure)
{
  "react": "19",
  "react-dom": "19",
  "vite": "rolldown-vite",          // NOT Next.js, NO SSR, NO RSC
  "react-router": "7",               // createBrowserRouter
  "tailwindcss": "4",                // v4 with @theme in style.css
  "@tanstack/react-query": "5",
  "zustand": "5",                    // + immer + persist middleware
  "sonner": "2",                     // toasts (not radix-toast)
  "lucide-react": "*",               // ICONS — not phosphor, not radix-icons
  "@radix-ui/*": "*",                // PRIMITIVES (Dialog, Tooltip, Tabs ...)
  "class-variance-authority": "*",   // CVA — shadcn variant helper
  "framer-motion": "12",             // React-tree-aware transitions
  "animejs": "4",                    // ambient timer animations
  "@zumer/snapdom": "*",             // share-PNG rasterisation
  "react-zoom-pan-pinch": "*",       // pinch/zoom on share preview
  "react-i18next": "*"               // i18n — vi default, en secondary
}
```

**Rule:** before recommending a library, `grep package.json`. Never `npm install framer-motion` — already there. Never push `phosphor` — replace with `lucide-react`.

## 2. Aesthetic — broadcast-editorial poker

Dark surface + gold accent + burgundy felt + jewel-tone position pills. Broadcast vocabulary: uppercase small-caps eyebrows, tabular numerals, ledger lines. The aesthetic is intentional and consistent across all three surfaces.

**Tone:** premium broadcast (think ESPN poker overlay), not Vercel-dashboard-minimal, not maximalist play.

## 3. Colour system

Single accent: **gold `#EAC249`** (rgb 234, 194, 73). Used for the felt rim, the winner crown, the pot text, primary CTAs (`btn-broadcast-primary`), the BTN position pill. Don't introduce a second accent.

Background palette:
- App surface: dark navy from theme (`bg-surface-container-low/high`, `bg-surface-container-highest`)
- Felt: radial gradient `rgba(90,22,22,0.97)` (warm burgundy) → `rgba(15,8,8,1)` (deep)
- Header gradient: `linear-gradient(135deg, rgba(60,30,16,0.55), rgba(28,18,14,0.92) 70%, rgba(10,6,8,1))`
- Identity pill on felt: `linear-gradient(180deg, rgba(20,24,34,0.95), rgba(14,17,24,0.95))`

Position pill palette (jewel tones, intentional — DO NOT collapse to monotone):
- BTN / D — gold gradient (`#f5e6a3 → #d4a847 → #b8922e`) + dark brown text `#3a2800`
- BB — `bg-blue-600 text-white border-blue-400/50`
- SB — `bg-emerald-600 text-white border-emerald-400/50`
- UTG / UTG+1 / UTG+2 / MP / HJ / LJ / CO — `bg-slate-600 text-white border-white/45` (was dim `#1a1a1a` — bumped for legibility on dark felt)

Action verb palette:
- Fold — `text-outline` (muted)
- Check — `text-blue-400`
- Call — `text-success` (theme emerald)
- Bet / Raise — `text-gold`
- **All In** — `text-red-500 font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.45)]` (dramatic — keep)
- Limp — `text-on-surface-variant` (de-emphasised)

Stack numerals are **cyan `text-cyan-300`** (with `/60` opacity for BB sub-line). This is the project's secondary "data" hue alongside gold.

**The LILA BAN does not apply here.** This palette is a deliberate coloured system — purple Daichi pills + emerald SB + blue BB are signature poker-broadcast vocabulary, not AI slop.

## 4. Typography

```css
/* style.css — Tailwind v4 @theme tokens (verify exact names) */
--font-headline: 'Plus Jakarta Sans', sans-serif;   /* display + names */
--font-body:     'Be Vietnam Pro', sans-serif;      /* body + Vietnamese diacritics */
--font-label:    'Space Grotesk', sans-serif;       /* tabular numerals + small-caps */
```

**Do not push Geist, Outfit, Satoshi, or Cabinet Grotesk.** Those have weak Vietnamese-diacritic coverage (Đ, Â, Ô, ầ, ằ, …). The locale defaults to `vi` per `i18n/`. Plus Jakarta + Be Vietnam Pro is the right choice.

Type vocabulary:
- **Display / headlines** — `font-headline` + `font-bold` + `tracking-tight` (gold or on-surface)
- **Body text** — `font-body` + `text-on-surface`
- **Labels / small-caps eyebrows** — `font-label` + `uppercase` + `tracking-[0.18em-0.22em]` + size 9-12 px
- **Numerals** — `font-label` + `tabular-nums` + cyan or gold

Uppercase small-caps with wide tracking ARE the broadcast vocabulary. Generic "anti all-caps" rules do not apply — `FOLD`, `MUCK`, `SHOWDOWN`, `MAIN POT`, `BTN`, `LVL` are all intentional.

## 5. Iconography

`lucide-react`. Standard stroke width `1.5` for chrome icons, `2.0–2.5` for emphasis (e.g. WinnerCrown's `Crown` glyph uses `strokeWidth={2.5}` + `fill`). Don't switch to phosphor — would break the icon stack across every existing site.

Brand marks (RPT logo + FullRing wordmark) live in `public/images/` and are referenced via `<img>` with `opacity-40-60` + `mix-blend-screen` as ambient felt watermarks. Don't treat them as primary CTAs.

## 6. Motion stack — dual library by design

Two motion libraries are installed and serve different roles. **Don't consolidate.**

| Library | Use for | Why |
|---|---|---|
| `framer-motion` | React-tree-aware transitions: `layout`/`layoutId` shared-element morph (`top-nav` active pill, `leaders-tab` rank reorder), `<AnimatePresence>` mount/unmount (`replay-chip-fly`, `seat-chip-puck`) | animejs is imperative DOM — replicating FLIP / shared-element costs more code than the library |
| `animejs` | Ambient continuous timer animations: breathing event cards, interactive dots field, live-series strip, idle decoration | framer-motion's per-frame React reconciliation is wasted for "loop forever, never reads React state" effects |

**Heuristic:** if the animation needs to know about React mount/unmount or layout-position-change, use framer-motion. If it's "start a timer, animate something forever, never look at React", use animejs.

**CSS-only** when possible — transitions, `animation-delay` cascades, `transform` + `opacity` keyframes. Most micro-interactions don't need a library at all.

**Forbidden:** never animate `top`, `left`, `width`, `height`. Always `transform` + `opacity`.

Motion intensity is **moderate-to-low** for this project — it's a live tracking + data UI, not a marketing site. Reserve dramatic motion for the share-PNG winner crown reveal + chip fly. Avoid `useReducedMotion`-blind continuous loops.

## 7. The 3-surface unification pattern

The seat / felt / pot vocabulary renders on THREE surfaces:

| Surface | Component tree | Container | Notes |
|---|---|---|---|
| Live replay | `HandReplayDialog` → `ReplayOval` → `ReplaySeatPip` | dialog-sized | full motion, scrub controls |
| Read-only Tables tab | `ReadOnlySeatMap` → `ReadOnlySeat` | card-sized | spectator, no scrub, popovers on hover |
| Share PNG capture | `ShareReplayDialog` → `ReplayOval` (with `captureMode`) | 800 × 460 px off-screen | static, snapdom-rasterised, force-landscape |

Sizing rules that must hold across ALL three:
- Avatar landscape **100 px** / portrait **75 px**
- Name + stack landscape **18 px** / portrait **13 px**
- BB landscape **15 px** / portrait **11 px**
- Hole cards `size="md"`, positioned with inline `transform: translate(-50%, 25%)` above the avatar (25 % overlap)
- Position pill **16 px landscape** / **8 px portrait**, with `z-40` above hole cards (`z-30`)
- Winner crown top-right corner of avatar (`-top-2 -right-2`)

The shared geometry lives in `packages/poker-ui/lib/seat-positions.ts` (`computeSeatPositions`) and `packages/poker-ui/lib/table-geometry.ts` (`TABLE_GEOMETRY.{landscape,portrait}{Replay,Viewer,Tracker}`). `landscapeReplay` and `landscapeViewer` are intentionally unified (`refW: 1040, refH: 430, verticalOverhang: 60`).

When tweaking a seat-pip detail, ALWAYS apply to both `replay-seat-pip.tsx` AND `read-only-seat.tsx` unless you have a documented reason to diverge. The share PNG inherits from `replay-seat-pip` via `ReplayOval`.

## 8. snapdom capture constraints (UNIQUE TO THIS PROJECT)

`ShareReplayDialog` rasterises an off-screen DOM via `@zumer/snapdom`. Real bugs we've hit:

### Brave / Chromium-mobile drops CSS-variable transforms inside nested transformed ancestors

Tailwind compiles `-translate-x-1/2 -translate-y-1/2` to `transform: translate(var(--tw-translate-x), var(--tw-translate-y))`. When the element sits inside `TableCanvas`'s `transform: scale(X)` + the seat-pip outer's own translate, snapdom on Brave/Chromium mobile sometimes drops the variable-based transform and the child renders at `(0, 0)` of the ancestor — looks "missing" in the share PNG.

**Fix:** inline literal `style={{ transform: 'translate(-50%, 25%)' }}` instead of Tailwind translate utilities for centring inside transformed ancestors. Serialises cleanly through `getComputedStyle`.

### Multi-layer inset `box-shadow` drops in foreignObject SVG rasterisation

The original felt rim used a 4-layer inset `box-shadow` stack (`inset 0 0 0 12px #20201F, inset 0 0 0 16px rgba(234,194,73,0.7), inset 0 32px 80px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.4)`). snapdom dropped the inset layers → share PNG felt rendered rim-less.

**Fix:** render the gold rim as a separate sibling div with literal `border + outline + outlineOffset`. CSS borders serialise reliably.

### snapdom options for this project

```ts
await snapdom.toBlob(target, {
  type: 'png',
  fast: true,            // skips small idle delays
  dpr: 2,                // Retina-sharp anti-aliasing
  scale: 2,              // → 800 × 4 = 3200 px PNG
  embedFonts: true,      // MANDATORY — Be Vietnam Pro / Plus Jakarta / Space Grotesk
  backgroundColor: '#0a0606',
  quality: 1,
})
```

`embedFonts: true` is non-negotiable. Without it, snapdom's foreignObject SVG falls back to system Arial/Helvetica and the share PNG looks like a different product.

### Prefetch on idle — don't block the main thread

`ReplayHeader` mounts a hidden `<ShareReplayDialog prefetchOnly />` the moment the replay opens so the user-clicked-Share path is instant. The capture pipeline yields between heavy steps via `requestIdleCallback` (with `setTimeout(0)` fallback):

```ts
await yieldToIdle()            // before any work
await runPipelineStep()
await yieldToIdle()            // before snapdom.toBlob
await runSnapdom()
await yieldToIdle(5000)        // before secondary OG-card capture
```

Visible-mode capture (user is actively waiting) skips the yields. The cache (`replay-share-cache.ts`) dedupes prefetch + visible into a single Promise.

## 9. Mock-first development mode

Default `useDataModeStore` value is `'mock'`. The API client transparently intercepts requests via `resolveMock()` when `isMockMode()` is true. Mock data files live in `src/data/mock/` per domain.

Mock player names — Carmen, Daichi, Elena, Farid, Gita, Ines, Bao, Alice, Hao — are intentional dev data, not "John Doe" AI slop. Anti-cliche rules from `taste-skill` do not flag these.

Round chip values (5K, 10K, 100K, 1M, 11.6M) are intentional — poker chip denominations ARE round numbers. Don't fight the domain to look "less AI".

## 10. Domain vocabulary

Positions: `BTN` (= `D`), `SB`, `BB`, `UTG`, `UTG+1`, `UTG+2`, `MP`, `HJ`, `LJ`, `CO`.
Streets: `preflop` / `flop` / `turn` / `river` / `showdown`. Display labels in `forceCompact` action-grid header are uppercase: PREFLOP, FLOP, TURN, RIVER, SHOWDOWN.
Actions: `Fold`, `Check`, `Call`, `Bet`, `Raise`, `All In`, `Limp`, `Ante`, `Small Blind`, `Big Blind`.
Stack vocab: `stack-before`, `stack-after`, `commit`, `pot`, `main pot`, `side pot`, `BB` (big-blind units, e.g. "500.0 BB").
Replay tip + scrub vocab: `currentStep`, `LEADING_STEPS = 1` (one virtual "preflop no action yet" frame), `actionStep = currentStep - LEADING_STEPS`.

**`forceCompact`** = the action-list 5-column broadcast strip layout (used in HandReplayDialog History view + share PNG). `captureMode` (on `ShareReplayDialog`) = "this is the off-screen snapdom render, use the big-size branch regardless of viewport `sm:` breakpoint".

## 11. Pattern library — verified working

### Section frame + dividers
```tsx
<div className="grid grid-cols-5 bg-surface-container-low/40 section-frame overflow-hidden">
  <div className="flex flex-col min-w-0 border-l-2 section-divider">…</div>
</div>
```
`section-frame` + `section-divider` are project CSS classes — broadcast-strip vocabulary. `min-w-0` on grid items is mandatory (default `min-width: auto` lets one column inflate past its `1fr` share).

### Editorial broadcast header
```tsx
<div className="flex items-baseline flex-wrap gap-x-2.5 gap-y-0.5">
  <span className="uppercase tracking-[0.22em] text-[12px] font-label font-semibold">HAND #</span>
  <span className="font-headline font-bold text-lg tabular-nums">{hand}</span>
  <span aria-hidden className="text-outline-variant/30">·</span>
  …
</div>
```
Eyebrow + value pairs separated by middot. `text-outline-variant/30` for the dot, `tabular-nums` on every numeric value.

### Identity pill (seat-pip name / stack / BB)
```tsx
<div
  className="flex flex-col items-center gap-0 leading-tight relative z-10 px-2 pt-1.5 pb-1 -mt-6"
  style={{
    background: 'linear-gradient(180deg, rgba(20,24,34,0.95) 0%, rgba(14,17,24,0.95) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
    borderRadius: '10px 10px 40% 40% / 10px 10px 30% 30%',
  }}
>…</div>
```
The `-mt-6` deliberately overlaps the avatar bottom (chin); the asymmetric border-radius gives the vase silhouette. Don't change to a rectangle — the chin shape is signature.

### Action pill (broadcast row)
```tsx
<div className={cn(
  'flex items-center gap-0.5 sm:gap-2 min-w-0 rounded-md pl-0.5 sm:pl-1 pr-1 sm:pr-2 py-0.5 sm:py-1 border-l-2',
  isWinner ? 'action-pill-winner border-gold/80' : 'action-pill border-transparent',
  isForced && 'opacity-55',
)}>…</div>
```
`action-pill` + `action-pill-winner` are project CSS classes. Winner row gets the gold left rail.

### Position pill (above identity pill)
```tsx
<div className={cn(
  'absolute left-1/2 -translate-x-1/2 -top-5 py-1 px-2.5 text-[16px] z-40 whitespace-nowrap',
  'rounded-full font-black tracking-[0.08em] uppercase font-label border',
  'drop-shadow-[0_3px_6px_rgba(0,0,0,0.85)] ring-2 ring-black/35',
  isProminent ? positionBadgeCn(label) : 'bg-slate-600 text-white border-white/45',
)} />
```
`z-40` to clear the hole cards (`z-30`). Drop shadow + ring keep text readable on either felt or card-face backdrop.

## 12. Anti-pattern reminders (project-specific)

- **DO NOT** add `framer-motion` to a list/grid mount without checking that the motion is React-state-driven. Use CSS `animation-delay` + `:nth-child` for static stagger.
- **DO NOT** use `position: absolute; top:50%; -translate-y-1/2` inside `TableCanvas` (transform-scaled ancestor) without inline literal transform — snapdom on Brave/mobile drops it.
- **DO NOT** ship multi-layer `inset box-shadow` on anything that the share PNG captures.
- **DO NOT** add a second accent colour. Gold is the accent.
- **DO NOT** push Geist / Outfit / Satoshi / Cabinet Grotesk fonts — break Vietnamese diacritics.
- **DO NOT** consolidate animejs into framer-motion or vice versa — the dual stack is intentional.
- **DO NOT** flag uppercase small-caps / centred felt / round chip values / mock player names as AI-slop. Verify domain intent first.
- **DO NOT** divergeseat sizing between `replay-seat-pip` and `read-only-seat` without recording a reason.

## 13. Pre-flight checklist (poker UI work)

Before shipping a felt / seat / share-PNG / action-grid change:

- [ ] Read `package.json` to confirm available libs before importing
- [ ] If the change touches seat layout / sizing: applied to BOTH `replay-seat-pip.tsx` AND `read-only-seat.tsx`
- [ ] If the change is visible in the share PNG: tested against snapdom constraints (inline transform, no multi-layer inset shadow, `embedFonts: true`)
- [ ] If you added a motion: animejs for ambient, framer-motion for React-aware, CSS for everything else
- [ ] Position pill `z-40`, hole cards `z-30`, winner crown `z-50`
- [ ] Vietnamese names render correctly with `Plus Jakarta` / `Be Vietnam Pro` (Đ Â Ô ầ ằ ş visible)
- [ ] Mock-first: feature works with `useDataModeStore` set to `'mock'`
- [ ] `tabular-nums` on every numeric column
- [ ] No new `useState` for continuous animation — use animejs timer or framer `useMotionValue`
- [ ] CSS transitions on `transform` + `opacity` only

## 14. When generic skills conflict with this one

This skill wins. Specifically:

- `taste-skill` Next.js / RSC / Phosphor / Geist defaults → ignore, use this skill's stack
- `taste-skill` LILA BAN → does not apply to the position-pill jewel palette
- `taste-skill` "centred Hero banned" → does not apply to the felt (it IS a centred poker table)
- `redesign-skill` "lucide is bad" → false positive, this project standardised on lucide
- `redesign-skill` "uppercase headers bad" → false positive, broadcast vocabulary
- `frontend-design` "vary light + dark themes" → does not apply, project is dark-only

If a generic skill flags an intentional pattern in this project, defer to this skill.
