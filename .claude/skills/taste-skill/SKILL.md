---
name: design-taste-frontend
description: Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, stack-aware architecture (read package.json first), CSS hardware acceleration, and balanced design engineering. Defers to project-specific skills (e.g. poker-ui-system) on stack + domain conflicts.
---

# High-Agency Frontend Skill

## 0. STACK DEFERENCE — READ FIRST

This skill ships generic UI/UX bias-correction. **It does not override project-specific skills or installed dependencies.**

Before applying any rule from sections 2-8 that touches a library, font, or framework:

1. **READ `package.json`** of the project you're editing. Don't recommend `framer-motion` if it's not installed; don't push `@phosphor-icons/react` if the project uses `lucide-react`.
2. **CHECK for a project-specific skill** (e.g. `poker-ui-system`, an `<app-name>-design-system.md`, or a `DESIGN.md` at repo root). If one exists, its conventions WIN on every conflict with this skill.
3. **CHECK existing imports** in 2-3 nearby files before introducing a new library. Match the established stack.

**Never blanket-recommend Next.js, Server Components, Phosphor icons, or Geist/Satoshi fonts.** Those are reasonable defaults for a greenfield marketing site; they're wrong for ~half of real projects (Vite SPAs, React Native, i18n-heavy apps with diacritic fonts, dashboards with established icon stacks).

## 1. ACTIVE BASELINE CONFIGURATION
* DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)
* MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)
* VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)

**AI Instruction:** baseline (8, 6, 4) unless a project-specific skill overrides, or the user explicitly requests different values in chat. Drive sections 3-7 from these (or overridden) values.

For DENSE data UIs (dashboards, live tracking, tournament software), the project-specific skill typically pushes VISUAL_DENSITY toward 6-8 and MOTION_INTENSITY toward 3-5. Honour that.

## 2. ARCHITECTURE & CONVENTIONS — verify before assuming

* **DEPENDENCY VERIFICATION [MANDATORY]:** Before importing ANY library, `grep package.json` (or `cat package.json | jq '.dependencies, .devDependencies'`). If absent, output the install command BEFORE the code; if present, use the installed version, not the latest you remember.
* **Framework:** Don't assume Next.js / RSC. Common React stacks:
    * **Next.js + RSC** — `'use client'` directives, server components, server actions. Default for new marketing sites.
    * **Vite + React SPA** — client-only, React Router, no RSC. Common for tracker/dashboard apps. **NO `'use client'` directives needed or wanted.**
    * **Remix / Astro / TanStack Start** — read the repo first.
* **State Management:** Local `useState`/`useReducer` for isolated UI. Global state for deep prop-drilling avoidance. Match the project's existing store (`zustand`, `redux toolkit`, `jotai`, etc.) — don't introduce a second one.
* **Styling:**
    * **Tailwind v4** — `@import "tailwindcss"` + `@theme` in CSS. Don't use v3 syntax (`@tailwind base/components/utilities`).
    * **Tailwind v3** — `@tailwind` directives + `tailwind.config.js`. Don't use v4 syntax.
    * Check `package.json` for the version. If a project uses `class-variance-authority`, use it for variants (shadcn pattern), not your own ad-hoc `cn()` ternaries.
* **ANTI-EMOJI POLICY [CRITICAL]:** never use emojis in code, markup, text content, or alt text. Replace with high-quality icons from the project's icon stack.
* **Responsiveness & Spacing:**
  * Standardise breakpoints (`sm`, `md`, `lg`, `xl`).
  * Constrain page width with `max-w-7xl mx-auto` (or the project's container token).
  * **Viewport Stability:** never `h-screen` for full-height heroes. Use `min-h-[100dvh]` to survive iOS Safari's viewport-bar dance.
  * **Grid over Flex-Math:** never `w-[calc(33%-1rem)]`. Use `grid grid-cols-{N} gap-{N}`.
* **Icons:** USE THE PROJECT'S INSTALLED ICON STACK. Common stacks:
    * `lucide-react` — Most React projects. Standard.
    * `@phosphor-icons/react` — Distinctive, more weight options. Choose at project inception.
    * `@radix-ui/react-icons` — Pairs with shadcn/ui ecosystem.
    * **Don't switch stacks mid-project** — costs consistency more than it saves character.
    * Standardise `strokeWidth` (e.g. exclusively `1.5` for chrome, `2.0` for emphasis) across the codebase.

## 3. DESIGN ENGINEERING DIRECTIVES (Bias Correction)

LLMs gravitate toward specific UI clichés. Construct premium interfaces using these engineered rules. **All rules defer to project-specific skills + verified stack.**

**Rule 1: Deterministic Typography**
* **Display/Headlines:** Default to `text-4xl md:text-6xl tracking-tighter leading-none` for marketing.
    * **ANTI-SLOP:** discourage `Inter` for "Premium" or "Creative" vibes UNLESS the project already uses it consistently.
    * **Distinctive Latin choices:** `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`.
    * **i18n WARNING:** for projects with Vietnamese / Arabic / Cyrillic / extended Latin, those Western-display fonts have poor diacritic coverage. Use locale-aware stacks: `Plus Jakarta Sans + Be Vietnam Pro` (Vietnamese), `IBM Plex Sans` (broad coverage), or the project's existing pairing. **Don't break diacritics for aesthetics.**
    * **TECHNICAL UI:** serif fonts banned for software dashboards. Use sans-serif pairs (`Geist + Geist Mono`, `Satoshi + JetBrains Mono`, or the project's equivalent).
* **Body/Paragraphs:** `text-base text-gray-600 leading-relaxed max-w-[65ch]`.

**Rule 2: Colour Calibration**
* **Constraint:** max 1 accent. Saturation < 80% UNLESS the domain demands per-category coding (status pills, position pills, severity tags). In domain-coloured UIs, the per-category palette IS the design system — don't collapse it.
* **THE "AI LILA" BAN:** the "AI Purple/Blue" aesthetic (purple button glow, neon gradient hero, lavender card stack) is banned. UNLESS the project's design system intentionally uses jewel-tone categorisation (legit poker pills, status badges, calendar event types). Read the project skill before flagging.
* **COLOUR CONSISTENCY:** one neutral family per project. Don't mix warm and cool greys without a documented reason.

**Rule 3: Layout Diversification**
* **ANTI-CENTRE BIAS:** centred Hero/H1 sections banned at `LAYOUT_VARIANCE > 4` for marketing pages.
    * **EXCEPTION:** domain-justified centring. Game boards, poker felts, sports broadcasts, music players, podcast covers, image-comparison sliders, modal dialogs — these are centred BECAUSE the content is centred. Don't break a centred felt to look "less AI".
* Force "Split Screen", "Left content / Right asset", "Asymmetric White-space" for marketing.

**Rule 4: Materiality, Shadows, "Anti-Card Overuse"**
* **DASHBOARD HARDENING:** at `VISUAL_DENSITY > 7`, generic card containers banned. Group with `border-t`, `divide-y`, or negative space.
* **Execution:** cards ONLY when elevation communicates hierarchy. Tint shadows to the background hue.

**Rule 5: Interactive UI States**
* Implement full interaction cycles:
  * **Loading:** skeleton loaders matching layout shape (avoid generic spinners). Match the project's existing loader vocabulary if one exists.
  * **Empty States:** composed "getting started" views.
  * **Error States:** inline, specific, plain language ("Connection failed. Try again." not "Oops!").
  * **Tactile Feedback:** `:active` → `-translate-y-[1px]` or `scale-[0.98]` for physical-press affordance.

**Rule 6: Data & Form Patterns**
* Label above input. Helper text under input. Error below. Standard `gap-2`.
* Numeric columns get `font-variant-numeric: tabular-nums` (or the project's `tabular-nums` utility).

**Rule 7: Domain Intent over Anti-AI Rules**
LLM bias-correction rules generate false positives on intentional patterns. Before flagging:
* **Round numbers** (`$100`, `100K`, `99%`) — fine when the domain produces round values (poker chips, prices in even dollars, percentages). Flag only when "fake data" smell is obvious.
* **Mock player / user names** — fine when the project is mock-first (`useDataModeStore`, fixture files in `data/mock/`). Verify before swapping.
* **Uppercase small-caps section labels** — fine for broadcast / editorial / dashboard vocabularies (`MAIN POT`, `BTN`, `STATS`, `LIVE NOW`). Generic anti-all-caps is for marketing prose.
* **Centred felts / boards / players** — verified above (Rule 3 exception).

## 4. CREATIVE PROACTIVITY (Anti-Slop Implementation)
* **"Liquid Glass" Refraction:** when glassmorphism is needed, add a 1px inner border (`border-white/10`) + subtle inner shadow (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) for edge realism.
* **Magnetic Micro-physics (MOTION_INTENSITY > 5):** USE THE PROJECT'S MOTION STACK.
    * If `framer-motion` is installed: `useMotionValue` + `useTransform` outside React renders. Never `useState` for continuous animation.
    * If `animejs` is installed: imperative timer; isolate in a leaf component with strict `useEffect` cleanup.
    * If only CSS: use `transform` + `transition-transform` + `transition-timing-function` (cubic-bezier) — works for most cases.
    * If neither: don't unilaterally add a motion library — first check whether CSS suffices.
* **Perpetual Micro-Interactions:** at MOTION_INTENSITY > 5, embed pulse / typewriter / float / shimmer where appropriate. **PERFORMANCE CRITICAL:** memoize, isolate in microscopic leaf components, never trigger parent re-renders.
* **Layout Transitions:** framer-motion `layout` / `layoutId` for FLIP / shared-element. **animejs cannot replicate these** — don't push to consolidate.
* **Staggered Orchestration:** for static stagger, CSS cascade (`animation-delay: calc(var(--i) * 100ms)` + `style={{'--i': index}}`) is enough — no library needed. For state-driven stagger, use the project's motion stack.

## 5. PERFORMANCE GUARDRAILS
* **DOM Cost:** grain / noise filters on fixed `pointer-events-none` overlays only. Never on scrolling containers.
* **Hardware Acceleration:** never animate `top`, `left`, `width`, `height`. Always `transform` + `opacity`.
* **Z-Index Restraint:** don't spam arbitrary `z-50` / `z-10`. Define a scale (e.g. modal=50, dropdown=40, sticky-nav=30, content=20, base=10) and stick to it.
* **Bundle Awareness:** before adding a motion / icon / animation library, check what's already installed. Adding `framer-motion` when `animejs` exists doubles motion-runtime cost.

## 6. MOTION STACK DECISION (when multiple are installed)

Common dual motion stacks: `framer-motion` + `animejs`, `framer-motion` + `react-spring`, `gsap` + plain CSS. Heuristic:

| Need | Reach for |
|---|---|
| React mount/unmount transitions (`<AnimatePresence>`) | `framer-motion` |
| Shared-element / layout-position FLIP (`layoutId`, `layout="position"`) | `framer-motion` |
| Per-frame React-state-driven animation (`useMotionValue` + `useTransform`) | `framer-motion` |
| Ambient continuous loop with NO React state read (breathing dot, idle marquee, scroll-triggered decoration) | `animejs` (timeline) or CSS (`@keyframes`) |
| Page-level scrolltelling, parallax, 3D | `gsap` + ScrollTrigger or Three.js — wrap in strict `useEffect` cleanup |
| Single hover / press feedback | CSS (`transition` + `:hover` + `:active`) — no library |

**Don't mix `framer-motion` and `gsap` in the same component tree.** Pick one for the leaf.

## 7. CAPTURE-AWARE CSS (when DOM is rasterised to image)

Apps that produce share images / OG cards / PDF reports via `html-to-image`, `@zumer/snapdom`, `dom-to-image`, or `html2canvas` have non-obvious constraints. If the project does this:

* **CSS-variable transforms can drop** in `foreignObject` SVG rasterisation on Brave / Chromium mobile when nested inside an already-transformed ancestor. Tailwind `-translate-x-1/2 -translate-y-1/2` compiles to `translate(var(--tw-translate-x), var(--tw-translate-y))`. Replace with inline literal `style={{ transform: 'translate(-50%, -50%)' }}` for centring inside `scale()` / `translate()` ancestors.
* **Multi-layer inset `box-shadow` can drop.** A felt rim using 4 stacked `inset 0 0 0 Xpx rgba(...)` layers may render rim-less. Replace with a sibling div carrying literal `border + outline + outlineOffset` — borders serialise reliably through `getComputedStyle`.
* **`embedFonts: true`** is mandatory for non-system fonts in `snapdom.toBlob`. Without it, the SVG `foreignObject` falls back to Arial/Helvetica.
* **Yield between heavy steps** (`requestIdleCallback` with `setTimeout(0)` fallback) when prefetching captures in the background so the user's foreground interaction stays smooth.
* **Test on mobile Brave / iOS Safari**, not just desktop Chrome. The drop bugs only fire on specific renderers.

## 8. TECHNICAL REFERENCE (Dial Definitions)

### DESIGN_VARIANCE (1-10)
* **1-3 (Predictable):** flexbox `justify-center`, strict 12-col, equal paddings.
* **4-7 (Offset):** `margin-top: -2rem` overlap, varied aspect ratios, asymmetric headers.
* **8-10 (Asymmetric):** masonry, fractional grids (`grid-template-columns: 2fr 1fr 1fr`), massive empty zones.
* **MOBILE OVERRIDE:** levels 4-10 fall back to single-column on `< 768px`.

### MOTION_INTENSITY (1-10)
* **1-3 (Static):** `:hover` and `:active` only.
* **4-7 (Fluid CSS):** `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)`. `animation-delay` cascades. `transform` + `opacity` only. `will-change` sparingly.
* **8-10 (Advanced):** scroll-triggered reveals, parallax. Project's motion stack (see Section 6). Never `addEventListener('scroll')` — use Intersection Observer or library hooks.

### VISUAL_DENSITY (1-10)
* **1-3 (Gallery):** generous white space, huge gaps, expensive feel.
* **4-7 (Daily App):** normal spacing.
* **8-10 (Cockpit):** tiny padding, 1px dividers, no cards. **Mandatory:** `font-mono` or `tabular-nums` on all numbers.

## 9. AI TELLS (Forbidden Patterns) — adjusted

### Visual & CSS
* **NO neon / outer glows** as a default. Inner borders or tinted shadows instead. Glows are OK for INTENTIONAL drama (winner reveal, alert pulse).
* **NO `#000000`.** Use off-black / zinc-950 / charcoal / tinted dark.
* **NO oversaturated accents** UNLESS domain-coded.
* **NO excessive gradient text** on large headers.
* **NO custom mouse cursors.**

### Typography
* **NO `Inter` for "Premium"** as the default suggestion. Use distinctive choices — BUT match the project's i18n requirements.
* **NO oversized H1s** that scream. Control hierarchy with weight + colour, not just scale.
* **Serif Constraints:** editorial / creative only. Never in dashboards.

### Layout & Spacing
* **Align & space mathematically.** No floating elements with awkward gaps.
* **NO 3-column card layouts** as the generic feature row. Use zig-zag, asymmetric grid, or horizontal scroll.

### Content & Data
* **NO generic names** ("John Doe", "Jane Smith") UNLESS the project is mock-first and the fixtures use intentional alternatives ("Carmen", "Daichi").
* **NO generic avatars** (egg, default user glyph). Use creative placeholders, initials-in-coloured-circles, or DiceBear-style sets — the project may already have one.
* **NO fake round numbers** UNLESS domain-justified (poker chips, percentages, dollar amounts in even units).
* **NO startup-slop names** ("Acme", "Nexus", "SmartFlow"). Invent contextual, premium brand names.
* **NO filler words** ("Elevate", "Seamless", "Unleash", "Next-Gen"). Concrete verbs only.

### External Resources & Components
* **NO broken Unsplash links.** Use `https://picsum.photos/seed/{token}/W/H` or SVG initials.
* **shadcn/ui customisation:** never the default state. Customise radii, colours, shadows.
* **Production-Ready Cleanliness:** clean, striking, meticulously refined.

## 10. THE CREATIVE ARSENAL (High-End Inspiration)

Pull from these when context warrants — but **match the project**. A live poker tracking UI doesn't need parallax tilt cards or gooey menus; a marketing page might.

### When to use what
* **Marketing / portfolio / editorial:** Bento grid, hover image trails, kinetic marquee, text mask reveals, parallax tilt, locomotive scroll, magnetic buttons, gooey menus.
* **Dashboards / data UIs:** skeleton loaders, sparkline cards, breathing live indicators, tabular numerals, divider-grouped sections, status-coloured pills.
* **Domain UIs (games, music, video):** centred content (Rule 3 exception), per-category palettes (Rule 2 exception), domain vocabulary (Rule 7 exception). Match the medium.

(Specific concepts — Dome Gallery, Coverflow, Spotlight Border Card, Holographic Foil, Mac OS Dock Magnification, Scroll Progress Path, etc. — pull from the original taste-skill's reference if the project context calls for them.)

## 11. THE BENTO PARADIGM (for SaaS dashboards specifically)

Skip this section unless building a SaaS dashboard. For tracking UIs, domain-specific layouts, or any non-Bento product, defer to the project skill.

Bento essentials when applicable:
* Background `#f9fafb`, cards `#ffffff` + `border-slate-200/50`, `rounded-[2.5rem]`, diffusion shadows.
* Typography: `Geist` / `Satoshi` / `Cabinet Grotesk`, `tracking-tight`.
* Labels OUTSIDE cards (gallery-style).
* Spring physics (`stiffness: 100, damping: 20`).
* Memoize perpetual animations.

## 12. FINAL PRE-FLIGHT CHECK

- [ ] **Read `package.json` and project-specific skills before recommending stack changes**
- [ ] Global state appropriate (not arbitrary)
- [ ] Mobile layout collapse (`w-full`, `px-4`, `max-w-7xl mx-auto`) for high-variance designs
- [ ] Full-height sections use `min-h-[100dvh]`, not `h-screen`
- [ ] `useEffect` animations have cleanup
- [ ] Empty, loading, error states present
- [ ] Cards used only where elevation matters
- [ ] CPU-heavy perpetual animations isolated in microscopic leaf components
- [ ] Motion library matches what's already installed (Section 6)
- [ ] If domain-coloured / centred / uppercase-labelled / mock-data: verified intentional (Rule 7), not flagged as AI-slop
- [ ] If DOM is rasterised: capture-aware CSS rules applied (Section 7)
