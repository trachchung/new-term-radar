# Tailwind CSS v4 Reference

## Table of Contents

- [Theme Namespaces](#theme-namespaces)
- [New Features](#new-features)
- [New Variants](#new-variants)
- [Custom Extensions](#custom-extensions)
- [Breaking Changes](#breaking-changes)
- [Advanced Configuration](#advanced-configuration)

## Theme Namespaces

All design tokens are available as CSS variables with namespace format `--category-name`:

| Namespace | Description | Example |
|-----------|-------------|---------|
| `--color-*` | Color utilities | `bg-red-500`, `text-sky-300` |
| `--font-*` | Font family | `font-sans` |
| `--text-*` | Font size | `text-xl` |
| `--font-weight-*` | Font weight | `font-bold` |
| `--tracking-*` | Letter spacing | `tracking-wide` |
| `--leading-*` | Line height | `leading-tight` |
| `--breakpoint-*` | Responsive breakpoints | `sm:*`, `md:*` |
| `--container-*` | Container queries | `@sm:*`, `max-w-md` |
| `--spacing-*` | Spacing/sizing | `px-4`, `max-h-16` |
| `--radius-*` | Border radius | `rounded-sm` |
| `--shadow-*` | Box shadow | `shadow-md` |
| `--inset-shadow-*` | Inset box shadow | `inset-shadow-xs` |
| `--drop-shadow-*` | Drop shadow filter | `drop-shadow-md` |
| `--blur-*` | Blur filter | `blur-md` |
| `--perspective-*` | Perspective | `perspective-near` |
| `--aspect-*` | Aspect ratio | `aspect-video` |
| `--ease-*` | Transition timing | `ease-out` |
| `--animate-*` | Animation | `animate-spin` |

Access in CSS: `var(--color-blue-500)`

### Dynamic Spacing

Default: `--spacing: 0.25rem`. Every multiple works automatically (e.g., `mt-21`).

### Override Namespaces

```css
--font-*: initial;   /* Override entire namespace */
--*: initial;        /* Override entire theme */
```

## New Features

### Container Queries (Built-in)

```html
<div class="@container">
  <div class="@sm:flex @md:grid @max-md:hidden">...</div>
</div>
```

- `@sm:`, `@md:`, etc. for container breakpoints
- `@max-md:` for max-width queries
- `@min-md:@max-xl:hidden` for ranges

### 3D Transforms

```html
<div class="transform-3d rotate-x-45 rotate-y-30 perspective-near">...</div>
```

- `transform-3d` enables 3D
- `rotate-x-*`, `rotate-y-*`, `rotate-z-*`
- `scale-z-*`, `translate-z-*`
- `perspective-*` (`perspective-near`, `perspective-distant`)
- `backface-visible`, `backface-hidden`

### Gradient Enhancements

```html
<div class="bg-linear-45 from-blue-500 to-purple-500">...</div>
<div class="bg-linear-to-r/oklch from-red-500 to-yellow-500">...</div>
<div class="bg-conic from-red-500 via-green-500 to-blue-500">...</div>
<div class="bg-radial-[at_25%_25%] from-white to-black">...</div>
```

### Shadow Composition

```html
<div class="shadow-lg inset-shadow-sm ring-1 inset-ring-1">...</div>
```

### New CSS Properties

- `field-sizing-content` - Auto-resize textareas
- `scheme-light`, `scheme-dark` - color-scheme property
- `font-stretch-*` - Variable font stretch

## New Variants

### Composable Variants

Chain variants: `group-has-data-potato:opacity-100`

### New Variant List

| Variant | Purpose |
|---------|---------|
| `starting` | `@starting-style` transitions |
| `not-*` | `:not()` pseudo-class |
| `inert` | `inert` attribute |
| `nth-3:`, `nth-last-5:` | nth-child selectors |
| `nth-of-type-4:` | nth-of-type selectors |
| `in-*` | Like `group-*` without `group` class |
| `open` | `:popover-open` support |
| `**` | Target all descendants |

## Custom Extensions

### Custom Utilities

```css
@utility tab-4 {
    tab-size: 4;
}
```

### Custom Variants

```css
@variant pointer-coarse (@media (pointer: coarse));
@variant theme-midnight (&:where([data-theme="midnight"] *));
```

### Plugins

```css
@plugin "@tailwindcss/typography";
```

## Breaking Changes

### Renamed Utilities

| Old | New |
|-----|-----|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `drop-shadow-sm` | `drop-shadow-xs` |
| `drop-shadow` | `drop-shadow-sm` |
| `blur-sm` | `blur-xs` |
| `blur` | `blur-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` |

### Removed Utilities

Use color opacity modifiers instead:

- `bg-opacity-*` → `bg-black/50`
- `text-opacity-*` → `text-black/50`
- `border-opacity-*` → `border-black/50`
- `divide-opacity-*` → `divide-black/50`

### Default Changes

- Border color: `currentColor` (was `gray-200`)
- Ring width: `1px` (was `3px`)
- Placeholder: current color at 50% opacity (was `gray-400`)
- Hover: only on `@media (hover: hover)` devices

### Syntax Changes

- CSS variables: `bg-(--brand-color)` not `bg-[--brand-color]`
- Stacked variants: left-to-right (not right-to-left)
- Use CSS variables instead of `theme()` function

## Advanced Configuration

### Prefix

```css
@import 'tailwindcss' prefix(tw);
/* Results in: tw:flex, tw:bg-red-500, tw:hover:bg-red-600 */
```

### Source Detection

```css
@source "../node_modules/@my-company/ui-lib";
@import "tailwindcss" source(none);  /* Disable auto-detection */
```

### Dark Mode

```css
@import 'tailwindcss';
@variant dark (&:where(.dark, .dark *));
```

### Container Customization

```css
@utility container {
    margin-inline: auto;
    padding-inline: 2rem;
}
```

### @apply in Vue/Svelte

```html
<style>
    @import 'tailwindcss/theme' theme(reference);
    h1 {
        @apply font-bold text-2xl text-red-500;
    }
</style>
```
