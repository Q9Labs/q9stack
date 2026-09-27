---
name: __APP_NAME__
colors:
  surface: "#ffffff"
  surface-container: "#f4f4f4"
  on-surface: "#131313"
  on-surface-variant: "#656565"
  primary: "#1f1f1f"
  on-primary: "#fafafa"
  outline: "#dfdfdf"
---

# Design direction: `__APP_NAME__`

This file owns visual direction, not delivery status. Use `@q9labsai/ui` and
semantic color roles; its token CSS owns precise values. Keep the product's
identity distinct from the shared q9stack foundation.

## Visual foundation

Prefer calm surfaces, readable type, restrained borders and clear focus states.
Use the shipped Geist fonts where appropriate. Avoid one-off colors and
decorative containers that do not help users complete a task.

## Layout and language

Use the shared AppShell and exported primitives. Keep layouts responsive and
use CSS logical properties so English and Arabic work in both directions.
Respect reduced motion and preserve visible keyboard focus.
