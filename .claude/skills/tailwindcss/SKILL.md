---
name: tailwindcss
description: Style React components with Tailwind CSS v4 utility classes. Use when styling UI components, applying responsive designs, theming, or working with CSS-in-JS patterns. Covers v4 CSS-first configuration, @theme directive, new variants, and breaking changes from v3.
---

# Tailwind CSS v4

## Resources

- [TailwindCSS Docs](https://tailwindcss.com/docs/styling-with-utility-classes)
- [Shadcn Components](https://ui.shadcn.com/docs/components)

## Core Setup (v4)

### CSS-First Configuration

Configure in CSS using `@theme` instead of `tailwind.config.js`:

```css
@import 'tailwindcss';

@theme {
    --font-display: 'Satoshi', 'sans-serif';
    --breakpoint-3xl: 1920px;
    --color-brand: oklch(0.84 0.18 117.33);
    --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
}
```

### Import Syntax

```css
/* v4 */
@import "tailwindcss";

/* v3 (deprecated) */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Package Changes

| Purpose | v4 Package |
|---------|------------|
| PostCSS plugin | `@tailwindcss/postcss` |
| CLI | `@tailwindcss/cli` |
| Vite plugin | `@tailwindcss/vite` |

No need for `postcss-import` or `autoprefixer`.

### Legacy Config Support

```css
@import 'tailwindcss';
@config "../../tailwind.config.js";
```

## Essential v4 Changes

### Opacity Syntax

```html
<!-- v4: Use color modifiers -->
<div class="bg-black/50 text-white/75 border-red-500/30">

<!-- v3 (removed): Don't use these -->
<div class="bg-black bg-opacity-50">
```

### CSS Variables in Arbitrary Values

```html
<!-- v4 -->
<div class="bg-(--brand-color)">

<!-- v3 (deprecated) -->
<div class="bg-[--brand-color]">
```

### Renamed Utilities

- `shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`
- `blur-sm` → `blur-xs`, `blur` → `blur-sm`
- `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`
- `outline-none` → `outline-hidden`

### Default Changes

- Border color: `currentColor` (was `gray-200`)
- Ring width: `1px` (was `3px`)
- Hover: only applies on `@media (hover: hover)`

## Quick Patterns

### Container Queries

```html
<div class="@container">
  <div class="@md:flex @lg:grid">Responsive to container</div>
</div>
```

### Dark Mode

```css
@import 'tailwindcss';
@variant dark (&:where(.dark, .dark *));
```

### Custom Utility

```css
@utility scrollbar-hidden {
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
}
```

### Custom Variant

```css
@variant pointer-coarse (@media (pointer: coarse));
```

## Guidelines

- Prefer ShadCN for UI components
- Avoid `tailwind.config.js` unless user requires it
- Use CSS variables via `@theme` for theming

## Detailed Reference

For complete documentation on theme namespaces, all new features, variants, breaking changes, and advanced configuration, see [references/v4-reference.md](references/v4-reference.md).
