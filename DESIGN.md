# CasaEnComú — design identity

Two themes, one palette. Night is the default look: a black gradient ground with a warm
yellow secondary and a red accent. Day is the same two hues re-tuned so they hold contrast
on light paper. Nothing else changes between them — same type, same spacing, same radii.

## Colour

| Role | Night | Day | Used for |
|---|---|---|---|
| Canvas | `#0b0b0d` → `#141418` gradient | `#fbfaf7` → `#f1efe8` gradient | the page ground |
| Raised | `#17171c` | `#ffffff` | cards, header, popovers, inputs |
| Sunken | `#111116` | `#f4f2ec` | wells, table stripes, empty states |
| Ink | `#f6f5f2` | `#16161a` | headings, prices |
| Body | `#c9c6bf` | `#3f3d39` | paragraphs |
| Muted | `#8f8c85` | `#6f6c66` | metadata, captions |
| Hairline | `#2a2a31` | `#e4e1d9` | borders and dividers |
| **Accent (red)** | `#ff453a` | `#e02a1f` | primary buttons, the brand mark, the price pin, destructive states |
| **Secondary (yellow)** | `#ffd60a` | `#e0a800` | active filters, family score, the "new" badge, map highlights |
| Error | `#ff6b5e` | `#c13515` | validation |

Accent and secondary never appear in the same control. Red asks for a click; yellow marks
something the family already chose.

Text on accent is always white. Text on secondary is always ink — yellow is too light to
carry white in either theme.

## Type

Plus Jakarta Sans, self-hosted by `next/font`, weights 400/500/600/700. Prices and the
family score use 600. Nothing is italic. Nothing is uppercase except two-letter labels.

## Shape and depth

One radius: `--radius-card: 14px`, pills at `9999px`. One shadow tier, defined per theme —
in night the elevation comes from a lighter surface plus a hairline, not from a black shadow
nobody can see.

## Motion

One rule: 120–180 ms, `ease-out`, on colour and transform only. The single exception is the
theme switch, which reveals the new theme with a circle wipe from the toggle button through
the View Transition API, and which is skipped entirely under `prefers-reduced-motion`.

## The distinctive move

The theme switch itself. One button, one circular wipe out of it, the whole page repainted —
no fade, no cross-dissolve, no second showpiece anywhere else on the page.
