# SCADA Desktop — dashboard override

This page override takes precedence over `../MASTER.md`. The generated master is a
starting point; these choices adapt it to a safety-oriented industrial operator tool.

## Direction

- Product pattern: dense real-time operations dashboard, not a marketing landing page.
- Tone: calm, technical, deterministic, high-contrast. Avoid cinematic glow,
  glassmorphism, oversized display text, and decorative ambient motion.
- Signature element: a compact top status rail that always exposes connection state,
  active endpoint, session, point count, and the age of the latest packet.

## Typography

- UI: `Segoe UI Variable`, `Segoe UI`, system sans-serif.
- Telemetry, UUIDs, flags, timestamps: `Cascadia Mono`, `Consolas`, monospace with
  tabular figures.
- Minimum body size 14px on desktop; form controls at least 16px.

## Semantic palette

- Background: `#0B111B`; surface: `#111A27`; elevated surface: `#172230`.
- Border: `#2B3B4D`; foreground: `#F3F7FA`; secondary text: `#AAB8C5`.
- Primary/action: cyan `#2BC3DA`; connected/success: green `#39D98A`.
- Warning: amber `#F5B942`; destructive/error: red `#FF6B76`.
- Never communicate connection, quality, or command result through color alone.

## Interaction and density

- Use a 4/8px spacing rhythm; controls are at least 44px high and have a visible focus ring.
- Use 150–200ms opacity/border transitions only. Respect `prefers-reduced-motion`.
- Validate fields on blur and submit; show the cause and recovery next to the field.
- Use a semantic table with pagination for large point sets; do not announce every
  telemetry update through an ARIA live region.
- Commands report “accepted by server”, never “executed”, because the current RPC only
  acknowledges queueing.
