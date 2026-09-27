---
name: Q9Stack
colors:
  surface: "#ffffff"
  surface-container: "#f4f4f4"
  on-surface: "#131313"
  on-surface-variant: "#656565"
  primary: "#1f1f1f"
  on-primary: "#fafafa"
  outline: "#dfdfdf"
---

# Design System: Q9Stack

Source-derived using [Google Stitch's DESIGN.md guidance](https://github.com/google-labs-code/stitch-skills/blob/main/plugins/stitch-design/skills/extract-design-md/SKILL.md).
This is the reusable `@q9labsai/ui` baseline, not a fictional Q9Stack application. [Token CSS](packages/ui/src/styles/tokens.css) owns precise OKLCH values; frontmatter hex values approximate neutral light tokens. [UI exports](packages/ui/README.md) define the consumable surface. This file owns visual direction, not delivery status. It is not a visual QA signoff.

## 1. Visual Theme & Atmosphere

A quiet, neutral foundation for product-specific work. White and charcoal surfaces, restrained borders, readable controls and a deliberate scale form the baseline. Consumers can theme the product without forking primitive behavior. Do not impose a shared marketing identity on every generated application.

## 2. Color Palette & Roles

Light surfaces are white with soft neutral secondary regions. Dark mode is a designed charcoal counterpart. Near-black primary actions use light text in light mode; dark mode reverses their emphasis. Success, warning and destructive actions use the semantic tokens already defined in CSS. Accent colors in charts are not a license to recolor application navigation. Input boundaries and focus rings must remain visible in both modes.

## 3. Typography Rules

Geist Variable is the interface family; Geist Mono Variable is for code and aligned technical data. Use the shipped font entry points. Preserve readable hierarchy, text scaling and appropriate language fallbacks. Do not use Latin-only font assumptions as an excuse to break RTL or mixed-language content.

## 4. Component Stylings

Reuse the exported primitives, presentational auth screens, and AppShell. The base radius is `0.625rem`; use token-derived variants rather than one-off shapes. Auth components receive callbacks and do not import an authentication library. Keep disabled, pending, invalid, empty and denied states distinct. Hugeicons supply the established icon language. Previews should exercise real components, not approximations.

## 5. Layout Principles

AppShell combines sidebar, topbar, main content and a responsive mobile drawer. RTL is first-class: logical properties and explicit direction/locale context preserve meaning. The preview should demonstrate both directions, both themes, keyboard interaction, screen-reader labels and narrow-screen reflow. Native mobile designs use their platform systems under the approved variant contract; web primitives are not a native UI implementation.

## 6. Design System Notes for Stitch Generation

### Language to use

Use “neutral reusable UI foundation,” “Geist typography,” “crisp charcoal actions,” and “RTL-first application shell.”

### Component prompts

Design a primitive preview with default, focused, invalid, disabled and pending controls in light/dark and LTR/RTL. Design an AppShell example whose content can be removed without changing the reusable shell. Do not invent a Q9Stack end-user dashboard.

Refine one existing flow at a time. Include mobile, light/dark, empty, loading,
denied, error, keyboard-focus, and reduced-motion states. Generated concepts do
not authorize new product scope; [theory.md](theory.md) owns that boundary.
