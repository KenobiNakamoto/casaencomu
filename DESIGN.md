# CasaEnComú — design identity

Two themes, one palette. Night is the default look: a black gradient ground with a warm
yellow secondary and a red accent. Day is the same two hues re-tuned so they hold contrast
on light paper. Nothing else changes between them — same type, same spacing, same radii.

The values below are the source of truth in prose. The values that **ship** are in
`src/app/globals.css`, and `src/app/globals.test.ts` reads them from that file and asserts every
pair that carries text. If this table and the stylesheet disagree, the stylesheet is right and
this table is stale.

## Colour

| Role | Token | Night | Day | Used for |
|---|---|---|---|---|
| Canvas | `--canvas` → `--canvas-far` | `#0b0b0d` → `#141418` | `#fbfaf7` → `#f1efe8` | the page ground |
| Raised | `--raised` | `#17171c` | `#ffffff` | cards, header, popovers, inputs |
| Sunken | `--sunken` | `#111116` | `#f4f2ec` | wells, table stripes, empty states |
| Ink | `--ink` | `#f6f5f2` | `#16161a` | headings, prices |
| Body | `--body` | `#c9c6bf` | `#3f3d39` | paragraphs |
| Muted | `--muted` | `#a39f97` | `#68645c` | metadata, captions, placeholders |
| Hairline | `--hairline` | `#2a2a31` | `#e4e1d9` | decorative dividers |
| Control border | `--control-border` | `#77747e` | `#8b867d` | the edge of anything you can click or type in |
| Focus | `--focus` | `#98cbee` | `#245f89` | the focus ring |
| **Accent (red)** | `--accent` | `#ff453a` | `#e02a1f` | the brand mark, ornament, the price pin |
| **Action (red)** | `--action-bg` | `#c83a2f` | `#c52b22` | the filled primary button, and only that |
| **Secondary (yellow)** | `--secondary` | `#ffd60a` | `#e0a800` | the selection edge and map highlight |
| Selection | `--selection-bg` / `--selection-ink` | `#2a2405` / `#ffe17a` | `#fdf6e0` / `#695200` | a chosen filter or area |
| Success | `--success-bg` / `--success-ink` | `#10241a` / `#90d3aa` | `#e6f4ec` / `#176b3e` | preseleccionada, source active |
| Warning | `--warning-bg` / `--warning-ink` | `#302615` / `#f2c86e` | `#fff5dc` / `#815c00` | revisando, cannot check |
| Danger | `--danger-bg` / `--danger-ink` | `#351c1b` / `#ff938c` | `#fcedeb` / `#b52a22` | no disponible, validation, out of budget |
| Info | `--info-bg` / `--info-ink` | `#182631` / `#98cbee` | `#eef5fa` / `#245f89` | nueva |
| Visit | `--visit-bg` / `--visit-ink` | `#292236` / `#c5addf` | `#f4effa` / `#6b4b8a` | visita prevista |

**Accent is not action.** `--accent` is the ornamental red — the mark, a pin, an icon. It is too
light in night mode to carry white text: white on it measures 3.41:1. Anything with white text on
a red ground uses `--action-bg`, which measures 5.61:1 in day and 5.12:1 in night. The
`btn-primary` utility applies the whole set, hover and pressed included; write that, not a colour.

Accent and secondary never appear in the same control. Red asks for a click; yellow marks
something the family already chose. Text on secondary is always ink — yellow is too light to
carry white in either theme.

**Status is never colour alone.** Every stage chip carries a shape beside its word, every error
carries text. A member who cannot separate the six stage colours still reads six different chips.

## Type

Plus Jakarta Sans, self-hosted by `next/font`, weights 400/500/600/700. Prices and the
family score use 600. Nothing is italic. Nothing is uppercase except two-letter labels.

Editable fields are 16 px and never smaller. Below that, iOS Safari zooms the whole page when
the field takes focus, and the page does not zoom back.

## Shape and depth

One radius: `--radius-card: 14px`, pills at `9999px`. One shadow tier, defined per theme —
in night the elevation comes from a lighter surface plus a hairline, not from a black shadow
nobody can see.

## Reach and focus

Anything you tap has a 44 × 44 px hit area. The visible glyph can be smaller: the `touch-target`
utility grows the area underneath without moving anything on screen.

The focus ring is 2 px of `--focus` at 2 px offset, declared once in the base layer and never
animated, so it is on screen the frame the key lands. No component writes `outline-none`.

## Obstructions

Two fixed things overlap the page: the header and, below 1024 px, the bottom navigation. Each has
one name — `--header-h`, `--nav-bottom-h` — and everything that must clear them reads that name.
There is no second hard-coded `bottom-20` anywhere.

## Motion

Tokens: `--duration-fast: 120ms`, `--duration-standard: 180ms`, `--duration-theme: 320ms`,
`--ease-out`. Colour and transform only; never width, height, margin or top/left.

`prefers-reduced-motion` is honoured once, globally, and it removes the movement itself where the
movement is the point — the card photo zoom and the map pin scale — not merely the transition that
carries it. A scale with no transition is still a jump.

## Over the page

Photographs open in two stacked layers, and the depth is the whole navigation: it has to be
obvious which one a click outside will close.

| Layer | Scrim | Blur |
|---|---|---|
| the mosaic, over the page | black at 55% | 6 px |
| one photograph, over the mosaic | black at 78% | 16 px |

The scrim is black in **both** themes. A lightbox is dark on white paper too, and a photograph
needs a neutral ground more than it needs the palette. Every control that floats over a
photograph carries its own dark chip for the same reason — it cannot borrow a theme's surface
when what is behind it is somebody's living room.

Both layers are a native `<dialog>`. The browser owns the top layer, Escape, the focus trap and
the return of focus; the stylesheet owns only the look. Nesting them is what makes Escape close
the photograph back to the mosaic, and the mosaic back to the page.

## The front door

`/entrar` and `/invitacion` are the only two pages a person can reach with no session, and the
only two with no header. They share one shell, `.puerta`: the mark and the line **«Preparaos para
encontrar vuestra casa, juntos.»** centred over a translucent card.

The ground moves. Three shapes — `--accent`, `--action-bg`, `--secondary` — are blurred 64 px past
their own edges and drift on loops of 31 s, 37 s and 43 s. The three durations share no factor, so
the picture never returns to where it started at an interval anybody would notice. Opacity is one
token, `--blob`: 0.24 on paper, 0.34 at night, because paper takes less colour than black does.

Transform only, never opacity or size, so the three of them stay on the compositor. The card is
86% `--raised` over a 16 px backdrop blur — the shapes have to stay visible behind it, or the
movement reads as a fault in the page rather than as its ground.

Reduced motion needs no rule of its own here. The global one stops the shapes where they are, and
what is left is the same picture without the movement.

## The distinctive move

The theme switch. One button, one circular wipe out of it, the whole page repainted — no fade, no
cross-dissolve, no second showpiece anywhere else on the page.

It has three states, not two: the system's choice, day, night. The wipe is skipped, and the theme
applied at once, in three cases: reduced motion, a browser without the View Transition API, and a
visible map. The last one is not a compromise — WebGL canvases snapshot blank, so the wipe would
reveal a white rectangle where the map is.
