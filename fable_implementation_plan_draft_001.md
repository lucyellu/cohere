# Fable Prompt — Cohere UI Overhaul (Revised)

> [!NOTE]
> **Branch `dev-fable` is created and pushed.** Ready to paste into Fable.

## Tiering Strategy

| Tier | Task | Feed to Fable |
|------|------|---------------|
| 🔴 **1** | Passport dimensions + stamp aesthetics + art integration + export profile pic fix | **First prompt** (below) |
| 🟡 **2** | Map improvements (toggles, zoom cap, robustness) | **Second prompt** |
| 🟢 **3** | PDF/PNG export improvements | **Third prompt** |

---

## TIER 1 PROMPT (Copy-Paste)

```
## Project Context

You are working on "Cohere" — a React + Vite + Tailwind music passport web app. The app tracks concerts attended and presents the data as a travel passport metaphor: visa stamps, entry stamps, ticket stubs, maps, and an exportable passport PNG/PDF.

**CRITICAL: Work on branch `dev-fable`. It already exists. Do NOT commit to main.**

Architecture:
- Frontend: `web/` (Vite + React + Tailwind)
- API: `api-gateway/` (Express)
- Passport styles: `web/src/index.css` (all `.cohear-` prefixed classes)
- Passport components: `web/src/components/passport/`
- Passport view: `web/src/components/PassportView.jsx`

Key files you'll be editing:
- `web/src/index.css` — `.cohear-spread`, `.cohear-mvisa`, `.cohear-ministub`, `.cohear-entry`, `.cohear-export`, `.cohear-stub`, `.cohear-visa`, `.cohear-perf`
- `web/src/components/passport/PassportSpread.jsx` — Open book layout (identity + stamps pages)
- `web/src/components/passport/TicketStub.jsx` — Full-size ticket stub with "✨ Art" button
- `web/src/components/passport/VisaCard.jsx` — Full-size visa card with "✨ Art" button
- `web/src/components/passport/ExportSheet.jsx` — PNG/PDF export layout
- `web/src/components/PassportView.jsx` — Parent that manages art state and renders everything

Reference images for design direction are in `assets/inspiration/`:
- `stamps (1).jpg` — Collection of vintage passport/postal rubber stamps (circular, oval, rectangular, various inks)
- `stamps (1).png` — Cute illustrated postage stamp (Vancouver, perforated edge, embossed look)
- `stamps (2).jpg` — Physical letterpress/foil postage stamp with thick paper and debossed art
- `ticketstubs (1).jpg` — Van Gogh museum ticket (large art panel + text, perforated counterfoil)
- `ticketstubs (1).png` — Claude Monet museum ticket (elegant dark background with artwork inset)
- `ticketstubs (2).jpg` — Collection of REAL vintage concert tickets (Rolling Stones, Led Zeppelin, David Bowie, Fleetwood Mac, KISS, etc.) — note the varied layouts, typography, and character
- `ticketstubs.png` — More vintage tickets at higher resolution (same collection, better detail)
- `passport (1).jpg` — Open passport booklet with stamps placed naturally on right page, identity on left with real photo riveted on
- `passport (2).jpg` — Design-portfolio passport with illustrated stamps, nicely proportioned open spread
- `map.jpg` — Journey Journal with string-and-pin routes through countries

Also check `assets/cohere/cohere_old/` for screenshots of the current app state, and `assets/cohere/cohere_new/` for the foil/moving stamp inspiration videos (stamp_foil, stamp_moving, sticker_wrap .mp4 files).

---

## TASK 1: Fix Passport Book Dimensions & Layout

### Problem
The open passport spread (`.cohear-spread`) is visually skewed and poorly proportioned:
- Fixed at 720px wide with min-height 540px per page — looks oddly tall and narrow
- Stamps and content only fill the TOP HALF of the right page, leaving a huge empty void below
- The 2-column stamp grid (3 on desktop) is too sparse — stamps are tiny with huge gaps
- The book spine shadow is too dark/heavy

### What to fix

1. **Passport proportions**: A real open passport is ~250mm × 176mm (landscape, ~1.42:1 ratio when open). Adjust `.cohear-spread` to use a more realistic aspect ratio. Consider `width: min(92vw, 780px)` with the aspect ratio enforced naturally, instead of the fixed 720px + min-height approach.

2. **Stamp grid fills the ENTIRE page**: Currently `PER_PAGE = 6` stamps in a 2×3 grid. The grid must fill the whole page height, not just the top half. Options:
   - Increase `PER_PAGE` to 9 or 12
   - Use `align-content: stretch` or auto-fill to distribute stamps vertically
   - Reduce the massive `gap: 18px 14px` and `padding: 18px 30px 12px`
   - Look at `passport (2).jpg` for how stamps can be packed organically

3. **Soften shadows & spine**: The inset shadow on `.cohear-spread__page.left/.right` and the `::before` spine should be subtle — the current ones are too dark and heavy. Look at `passport (1).jpg` for the gentle fold shadow.

4. **Mobile responsive**: The `@media (max-width: 820px)` breakpoint stacks pages vertically — fine, but both should maintain identity (not look like random disconnected cards).

---

## TASK 2: Revamp Stamp & Ticket Stub Aesthetics

### Problem
The current stamps are too small, generic, and lack the tactile, collectible feel of real concert memorabilia. They should feel like physical stickers, vintage postage stamps, or concert backstage passes you'd paste into a journal.

### Design Direction
Study the reference images carefully:
- `stamps (1).jpg`: Mix of CIRCULAR rubber stamps, OVAL immigration stamps, RECTANGULAR postage stamps — all in different inks (blue, red, green, black). Some have airplane icons, compass roses, national emblems. Note the variety of shapes and ink textures.
- `stamps (2).jpg`: A PHYSICAL stamp on thick paper with letterpress/debossed effect — the impression goes INTO the paper. The perforated edge is real and chunky.
- `ticketstubs (2).jpg` + `ticketstubs.png`: REAL vintage concert tickets — note how each one has completely different typography, layout, colors, and personality. The Rolling Stones ticket looks nothing like the Fleetwood Mac ticket. That variety is key.
- `ticketstubs (1).jpg/png`: Museum-style tickets with LARGE art panels (paintings) integrated elegantly — the art IS the ticket, not a separate image dropped in.

### Specific changes

#### Entry Stamps (`.cohear-entry` in PassportSpread + `.cohear-export__stamp` in ExportSheet)
Currently: plain rounded rectangle with city name, basically just text in a box.
**Should be**: Circular or oval rubber stamps, like real passport immigration stamps.
- Circular/oval border with city name running along the curve
- Tiny ✈ airplane icon, date in the center, "ADMITTED" at the top
- Use various ink colors (blue, red, green, brown) based on the city's region/continent
- The rotation scatter (`--rot`) is good — keep it for organic feel
- Some stamps should be slightly faded/smudged to look hand-stamped

#### Visa Stamps (`.cohear-visa` / `.cohear-mvisa` + `.cohear-perf`)
Currently: postage-stamp style with perforated edge.
**Should be**: More like `stamps (2).jpg` — thick paper, letterpress feel, with a genuine embossed/debossed texture.
- The perforation (`.cohear-perf`) needs to be more pronounced — currently it's just a background pattern. Use CSS `radial-gradient` mask to create actual scalloped edges (see the Vancouver seal stamp).
- Add a denomination feel — "TYPE C · 25¢" or the visit count as the "value"
- The country emoji seal needs to be surrounded by a circular guilloché pattern (concentric rings/rosette) — currently it's just a bare emoji
- Add a CSS-only embossment effect using layered `box-shadow` (inner shadow for deboss) and subtle `text-shadow` for raised text — reference the `stamps (2).jpg` letterpress look
- Consider a CSS shimmer/foil effect using `background: linear-gradient(...)` with animation for a subtle metallic sweep (inspired by the stamp_foil videos)

#### Ticket Stubs (`.cohear-stub` / `.cohear-ministub`)
Currently: decent structure (header/body/counterfoil) but generic.
**Should be**: Each ticket should feel unique per-artist, like the vintage concert tickets in the reference images.
- The counterfoil tear (`.cohear-stub__side`) should have a proper zigzag/serrated edge using CSS mask
- More typographic variety per-artist — currently every ticket uses the same font sizing and layout
- The barcode should have varied bar widths for realism
- The "ADMIT ONE" badge should be more prominent — a rosette or diagonal banner
- Add subtle paper texture using CSS noise/grain overlay
- The overall shape could vary slightly per stub (some wider, some taller) to match the organic feel of real ticket collections

### Art Integration (Critical — this is a major UX improvement)

**Current state**: The "✨ Art" button generates an image and drops it as a fitted `<img>` inside the ticket/visa. It feels disconnected — the art is just a rectangular image placed within the card, not integrated into the design. See `TicketStub.jsx` line 43-45: `<img src={art} ... style={{ height: 86, objectFit: 'cover' }} />`.

**What we want**: The generated art should feel like it IS the stamp/ticket, not a picture pasted onto it. Think of how museum tickets (Van Gogh reference) have the artwork as the entire ticket background, with text overlaid on top.

Changes needed:

1. **Regular view vs. Art view toggle**: Add a per-card toggle (the existing "✨ Art" / "✨ Redo" button already partially does this). When art is generated:
   - **Regular view** (default): Shows the current CSS-only card design — text, borders, barcode, etc.
   - **Art view**: The generated image becomes the card's BACKGROUND, with key text (artist name, date, venue) overlaid using semi-transparent panels or knockout text. The card border/perforation/counterfoil structure stays, but the fill is the art.
   - Users should be able to toggle BETWEEN these two views with a simple click. Currently clicking "Redo" regenerates — instead, the first click should toggle view, and a separate button or long-press should offer "Redo" to regenerate.

2. **For ticket stubs specifically**: The art view should feel like a concert poster or tour merchandise — the generated image fills the main body area behind the text, with the header and counterfoil maintaining their structural colors. Think of the Van Gogh/Monet reference tickets where the painting IS the dominant visual.

3. **For visa stamps specifically**: The art view should feel like a postage stamp illustration — the generated image fills the vignette area (`.cohear-visa__vignette`) with the border, perforation, country name, and denomination overlaid. Think of a real postage stamp where the illustration and the frame are one design.

4. **Embossment/foil effects on art**: When art is shown, add CSS effects that make it feel physically embedded:
   - A subtle `mix-blend-mode: multiply` or `overlay` to make the art look printed onto paper rather than displayed on a screen
   - Inner shadows around the art area suggesting the image is pressed into the card
   - Optional: A CSS-animated shimmer sweep across the art (like holographic foil) — reference the stamp_foil videos. This should be achievable with a `::after` pseudo-element using an animated `linear-gradient` from transparent to white/20 to transparent.

---

## TASK 3: Fix Profile Picture Stretch in Export

### Problem
In `ExportSheet.jsx`, the profile picture (`.cohear-export__photo`) stretches to fill its container, distorting the image. The identity photo should maintain its square aspect ratio.

### Fix
In `ExportSheet.jsx`, the `.cohear-export__photo img` needs `object-fit: cover` and the container should be a fixed square (e.g. `width: 80px; height: 100px` for passport proportions, or `aspect-ratio: 5/7`). Check the CSS in `web/src/index.css` under `.cohear-export__photo` and add the constraint there.

---

## General Guidelines

- **Don't break existing functionality** — the app is live on Render. All changes must be backward-compatible.
- **Use the existing design system** — all CSS classes are prefixed with `.cohear-`. The JSX uses Tailwind utilities for quick layout; the CSS file has the structural/themed styles.
- **Test at multiple viewport sizes** — passport must look good at 1440px+, 1024px, and 375px.
- **CSS-only effects preferred** — avoid adding new JS animation libraries. Use CSS transitions, gradients, masks, filters, and pseudo-elements for effects.
- **Keep html2canvas compatibility for ExportSheet** — the export uses html2canvas which doesn't support CSS masks, blend modes, or 3D transforms. ExportSheet must use only basic CSS (solid fills, borders, box-shadows). The fancy effects (masks, blend modes, shimmer animations) are for the in-app view only.
- **Preserve all existing comments and docstrings** — don't strip documentation.
- **Study the reference images** in `assets/inspiration/` before writing any CSS. Match the FEEL of those images, not just the structure.
```

---

## TIER 2 PROMPT (save for later)

```
## Context

Continue working on branch `dev-fable`. This is Task 4 — map improvements for the Cohere passport app.

Files to edit:
- `web/src/components/passport/PassportMap.jsx`
- `web/src/components/passport/ArtistTourMap.jsx`

### TASK: Map Improvements

1. **Route toggle**: In both map components, add a toggle button in the header bar to show/hide the route polyline (the dashed line connecting stops). Default ON, click to turn OFF.
   - Store the polyline reference and call `polyline.setMap(null)` / `polyline.setMap(map)` on toggle
   - Label: icon button "🛤️" with tooltip "Show/hide routes"
   - Persist in localStorage under `cohear-map-show-routes`

2. **Route line style**: Add a second toggle for straight vs. curved arcs:
   - Currently uses `geodesic: true` (great-circle arcs)
   - Add option for `geodesic: false` (straight Mercator lines)
   - Label: "✈️ Arcs / ⟶ Lines"

3. **Max zoom cap**: Add `maxZoom: 16` to both Google Maps init options (~line 38 in PassportMap, ~line 142 in ArtistTourMap). Prevents infinite tile zoom confusion.

4. **Artist tour robustness**: In ArtistTourMap, the `fetchTour()` can fail silently. Add a retry button in the error state and improve the empty-state message.
```

---

## TIER 3 PROMPT (save for later)

```
## Context

Continue working on branch `dev-fable`. This is Task 5 — PDF/PNG export improvements.

File to edit: `web/src/components/passport/ExportSheet.jsx` and its CSS in `web/src/index.css` (`.cohear-export__*` classes).

### TASK: Export Improvements

1. **Larger stamp rendering**: The `.cohear-export__grid--stamp` and `--stub` grids use tiny cells. Scale stamps to at least 2× their current size for print readability.

2. **Reuse in-app components**: Where feasible, render the same `VisaStamp`, `EntryRubberStamp`, and `MiniStub` components with a `forExport` prop that disables hover effects and uses print-safe CSS (no masks, blend modes, or 3D).

3. **Print-friendly CSS**: Add `@media print` rules that:
   - Hide buttons, interactive elements, navigation
   - Set pages to actual passport dimensions (88mm × 125mm per page)
   - Force white/cream background for ink efficiency
```

---

> [!IMPORTANT]
> **Ready to go.** The `dev-fable` branch is created and pushed to `origin`. Copy the **TIER 1 PROMPT** above and paste it into Fable. After it finishes, send **TIER 2**, then **TIER 3**.
