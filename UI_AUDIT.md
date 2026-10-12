# Aervo UI Audit — Phase 1 (audit only)

_Generated 2026-10-03 from commit `479001e` plus the `/dashboard/` redirect fix. No source files were changed; this file is the only artifact._

## How this was measured

- **Scope:** all 17 HTML pages, the only shared stylesheet (`assets/css/app-nav.css`, used by 7 pages), and the JS that injects markup (`assets/js/app-nav.js`). Retired pages (hub, CSV dashboard, promise, signup archive) are excluded.
- **Static analysis:** every `<style>` block was parsed into rules (1,570 rules, ~250 KB of CSS), `var(--x)` references were resolved per page, and every inline `style="…"` attribute was extracted — including the 325 that live inside JavaScript template strings. Colours were normalised to RGB and clustered with CIE ΔE (< 4.5 ≈ visually identical).
- **Empirical responsive test:** each page was loaded in an iframe at 320 / 375 / 768px (mock API data, browser pane) and measured for horizontal overflow, tap-target height and text size.
- **Limits:** Shopify, Square and Integrations render only their empty/error state against mock data, so their data-driven content (tables, cards) was audited from CSS only. Colours set by JS (`element.style.x = …`, 76 assignments) are counted by occurrence but their values were not traced. Focus/hover/disabled states were sampled, not exhaustively compared.
- **"Uses"** below = occurrences across page CSS + inline styles + JS-built markup. **"Pages"** = how many of the 17 pages contain it.

---

## Executive summary

1. **There is no shared design system.** Each page carries its own `<style>` block; only the app nav is shared. The 17 pages fall into **six visual dialects** (table in §1) with different backgrounds, text colours, accents, card styles and radii.
2. **123 distinct colours / 404 colour+opacity values** are in use. **58 of the 123 sit within a visually indistinguishable distance of another** (19 clusters) — e.g. six different near-black page backgrounds (`#02030a`, `#020617`, `#050817`, `#050810`, `#0a1628`, `#020213`).
3. **The primary button exists in 8+ gradient variants** across pages (cyan→violet, purple, blue, green, reversed…), with white text on some and dark text on others. The **login / forgot / reset buttons aren't the brand button at all** — they are flat navy (`#1a243d` / `#1f2937`).
4. **Typography:** 57 distinct font sizes (many fractional from rem maths), 8 font weights including non-standard **850 and 950**, 17 line-heights. **DM Sans is loaded and used by one page only** (Intelligence); `Inter` is named in two stacks but never loaded.
5. **Spacing:** 50 distinct values; **33% are off a 4px grid** (6, 10, 14, 18, 22 …).
6. **Radius / shadow:** `.card` has **11 different definitions** (radius 12 → 32px); **70 distinct box-shadows**.
7. **Accessibility:** white text on the dashboard button blues/greens fails WCAG AA (1.9–4.0:1); the muted label colour `#475569` on dark is **2.6:1**; `outline: none` appears 16 times, with four structurally different replacement focus treatments in seven colours.
8. **Components are re-implemented per page:** three separate toast implementations, ≥ 26 native `alert()`/`confirm()` calls (17 on Integrations alone), four treatments of the one dropdown style.
9. **Inline styles:** 628 (597 stylistic). IMS, Shopify and Square build most of their UI from inline-styled template strings (88 / 56 / 148).
10. **Responsive:** 10 different breakpoints (400 → 980). Measured defects: the **Pricing header CTA clips on any viewport narrower than ~376px**; the **IMS Overview overflows by 30px at 320px**; Intelligence has 45% of its text under 12px and 29 of 36 tap targets under 36px tall.

---

## 1. Colors

**Totals:** 123 distinct base colours · 404 distinct colour+opacity values · 2,395 usages (1,758 in page CSS, 201 in static inline styles, 436 inside JS strings/templates). 29 colours are used exactly once; 52 appear on only one page. The busiest pages define 34–40 base colours each (Square 40, Shopify 36, IMS 34); the simplest 9 (About, Privacy).

### 1.1 The six visual dialects

| Dialect | Pages | Page background | Body text | Accent(s) | Card treatment | Font |
|---|---|---|---|---|---|---|
| **A. Aurora (marketing)** | index, pricing, demo, onboarding | `#02030a` | `#f7f7ff` | cyan `#29c8ff` → violet `#7c5cff`, mint `#23e6a8` | translucent white overlay, radius 16–28 | system + "SF Pro Text"/"Inter" |
| **A′. Aurora (app)** | settings, reports | `#02030a` | `#f7f7ff` / `#f0f4ff` | same three | settings: translucent r24 · reports: opaque `#080d1a` r14 | system |
| **B. Slate dashboards** | ims, shopify, square, integrations | `#020617` | `#e5e7eb` | **purple** `#a855f7` (IMS) · **blue** `#3b82f6`/`#60a5fa` (Shopify, Integrations) · **green** `#34d399`/`#059669` (Square) | radial `#1e293b → #0f172a`, r16, slate border @0.2 | system |
| **C. Intelligence** | intelligence | `#050810` | `#f1f5f9` | blue `#3b82f6`, violet `#8b5cf6`, amber `#f59e0b`, green `#10b981` | solid `#0c1120`, r14 | **DM Sans / DM Mono** |
| **D. Auth / simple** | login, forgot-password (`#050817`, text `#d6def8`) · reset-password (radial `#111827→#020617`) · welcome (radial `#020617→#020213`) · about (radial `#0f172a→#020617`) | see left | `#d6def8` / `#e5ecff` / `#e5e7eb` | blues `#5082ff #6e9bff #89b4ff` (login) · `#60a5fa #38bdf8` (reset) · `#2563eb` (welcome) | radial navy, r18–24, coloured glows | system |
| **E. Legal** | privacy | gradient `#0a1628→#0d1f35` | `#b8c5d6` | `#5b9cf5`, `#4dd4d4`, `#7b68ee` | translucent, 900px | system |

### 1.2 Competing "primary" colours

| Role | Values in use (uses · pages) |
|---|---|
| Brand blue / cyan | `#29c8ff` (167·8) · `#3b82f6` (64·4) · `#60a5fa` (66·8) · `#8fbfff` (17·9) · `#5082ff` / `#6e9bff` / `#89b4ff` (login) · `#38bdf8` · `#2563eb` |
| Violet / purple | `#7c5cff` (140·8) · `#a855f7` (49·2) · `#7c3aed` (10·1) · `#8b5cf6` (11·1) · `#a78bfa` (9·4) · `#d8b4fe` (13·1) |
| Success green | `#23e6a8` (119·9) · `#34d399` (84·5) · `#10b981` (17·1) · `#22c55e` (10·4) · `#059669` |
| Warning amber | `#fbbf24` (30·7) · `#f59e0b` (24·3) · `#f5c26b` (settings `--warn`) · `#ffc107` (demo) |
| Danger red | `#ef4444` (43·5) · `#ff6b6b` (25·2) · `#f87171` (15·6) · `#ff6464` (demo) · `#fca5a5` (text) |

### 1.3 Gradients — 120 distinct definitions (67 linear, 53 radial)

Primary-button / accent gradients actually in use:

| Gradient | Uses · pages | Where |
|---|---|---|
| `linear-gradient(90deg, #29c8ff, #7c5cff)` | 17 · 5 | demo, index, onboarding, pricing, settings |
| `linear-gradient(135deg, #29c8ff, #7c5cff)` | 9 · 3 | demo, onboarding, settings |
| `linear-gradient(120deg, #29c8ff, #7c5cff)` | 5 · 3 | marketing |
| `linear-gradient(135deg, #7c3aed, #a855f7)` | 7 · 1 | IMS |
| `linear-gradient(135deg, #3b82f6, #60a5fa)` | 6 · 3 | Shopify, Integrations, Intelligence |
| `linear-gradient(90deg, #3b82f6, #60a5fa)` | 2 · 1 | Intelligence |
| `linear-gradient(135deg, #059669, #34d399)` | 2 · 1 | Square |
| `linear-gradient(135deg, #7c5cff, #29c8ff)` / `90deg` | 4 + 1 · 1 | Reports (colours **reversed**) |
| `linear-gradient(90deg, #23e6a8, #29c8ff)` / 135deg | 3 + 2 | demo / onboarding |
| `#96bf48 → #5a8a1f`, `#23e6a8 → #1aad80` | 1 each | onboarding Shopify / Square connect buttons |

### 1.4 Near-duplicates (full list in Appendix F)

| Cluster (× uses) | What it is |
|---|---|
| `#050817`×22 · `#050816`×19 · `#020617`×11 · `#080d1a`×8 · `#0a0f1e` · `#020213` | page backgrounds / dark text-on-gradient (16 pages) |
| `#0f172a`×37 · `#111827`×5 · `#0c1120`×4 · `#0f1e32`×3 · `#0a1628`×2 · `#151e30` · `#0d1124` · `#0d1426` · `#0f1628` | card / surface fills (13 pages) |
| `#1a2237`×9 · `#1e293b`×5 · `#1a243d`×2 · `#0d1f35` · `#12213a` | elevated surface / button fill (12 pages) |
| `#ffffff`×412 · `#f1f5f9`×24 · `#f9fafb`×9 | "white" text and overlays |
| `#d7dcf0`×123 · `#dfe7ff`×9 · `#d6def8`×2 | muted text (used at **15 different opacities** 0.3 → 0.9) |
| `#e5ecff`×79 · `#ebeeff`×5 · `#dbeafe` | primary text |
| `#f7f7ff`×40 · `#f0f4ff`×6 · `#f5f7ff`×3 | primary text (marketing) |
| `#000000`×60 · `#02030a`×16 · `#050810`×3 | shadows / base background |
| `#ff6b6b`×25 · `#ff6464`×8 · `#f87171`×15 · `#ff7b7b`×2 | danger |
| `#8fbfff`×17 · `#96c3ff` · `#8cbeff` · `#60a5fa`×66 · `#5b9cf5` · `#93c5fd`×15 · `#a0c8ff` | blue tints |

### 1.5 Text and border colours

- **Text:** `#9ca7d6` ×77 (11 pages) and `#e5ecff` ×73 (12 pages) are the clear majority secondary / primary values. Muted text is split between `#64748b` ×43, `#6b7a99` ×26, `#475569` ×26, `rgba(215,220,240,.7)` ×48 and `.65` ×24.
- **Borders:** white-alpha at nine levels (.05 .06 .07 .08 .10 .12 .13 .15 .20 — `.06` ×31 and `.10` ×29 most common) **plus** slate `#94a3b8` at five levels (.10 .15 .20 .25 .30 — `.20` ×24 is the dashboards' default) **plus** solid `#3a4a7c` / `#4a5a8c`.
- **Surface tints** (white overlays on backgrounds): .06 ×33 · .05 ×28 · .03 ×27 · .04 ×24 · .08 ×20 · plus .02 .07 .10 …

### 1.6 Contrast failures (WCAG AA = 4.5 : 1 text, 3 : 1 large)

| Pair | Ratio | Where |
|---|---:|---|
| white on `#29c8ff` | **1.94** | would fail if the gradient text were white |
| white on `#34d399` | **1.92** | Square gradient end |
| white on `#3b82f6` | 3.68 | Shopify / Integrations / Intelligence primary buttons |
| white on `#059669` | 3.77 | Square primary |
| white on `#a855f7` | 3.96 | IMS primary |
| `#475569` on `#050810` | **2.64** | Intelligence labels (26 uses) |
| `#64748b` on `#02030a` | 4.33 | muted text, 43 uses |
| `#050816` on `#29c8ff` / `#7c5cff` | 10.26 / 4.59 | marketing buttons — **pass** |
| `#6b7a99` on `#02030a` | 4.77 | passes |

---

## 2. Typography

**Families (first family in stack):** `system-ui` on 16 pages (29 declarations) · `DM Mono` ×10 and `DM Sans` ×7 on **Intelligence only** · `inherit` ×8 · one stray `monospace`. Nine distinct full stacks:

| Pages | Stack |
|---:|---|
| 11 | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| 4 | `…, "SF Pro Text", sans-serif` |
| 2 | `…, "SF Pro Text", "Inter", sans-serif` (**Inter is never loaded**) |
| 1 | `…, "SF Pro Text", "Segoe UI", sans-serif` |
| 1 | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` (privacy) |
| 1 | `"DM Sans", sans-serif` (Intelligence — the **only** Google Fonts request) |
| 1 | `"DM Mono", monospace` |

**Sizes:** 57 distinct px values (+ two `clamp()` hero sizes). Most-used: 13px ×106 (12 pages), 12px ×104 (13), 14px ×63 (13), 11px ×62 (6), 16px ×32 (13), 14.4px ×25, 13.6px ×24 (6), 12.48/13.12/12.8px ×~19 each. 32 of the 57 values are fractional (e.g. 12.48, 13.12, 13.28, 13.44, 13.76, 14.08, 14.72, 15.2, 16.32, 17.6) — artefacts of `rem`/`em`. **101 of 714 font-size declarations (14%) are under 12px**, down to 8.8px (Square 21, Intelligence 28). Full list: Appendix B.

**Weights (8 values):** 600 ×108 (15 pages) · 700 ×60 · 800 ×40 · **950 ×27 (5 pages)** · 500 ×17 · 900 ×14 · 400 ×5 · **850 ×4 (2 pages)**. 850/950 aren't real steps for system fonts; they snap to 800/900 unpredictably.

**Line-height (17 values):** 1.6 ×29 · 1 ×21 · 1.5 ×14 · 1.7 ×8 · 1.2 ×7 · 1.8 ×4 · plus 1.55, 1.06, 1.15, 1.4, 1.3, 1.12, 1.75, 1.85, 1.05, 1.65, 1.1.

**Letter-spacing:** 36 spellings / ~28 distinct values (−0.04em … 0.28em, plus px values 0.4–4px). Uppercase "kicker" labels alone use 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.22, 0.28em and 0.5, 0.7, 0.8, 0.9, 1, 1.5, 2, 4px.

**Inconsistencies by page:** Intelligence is the only DM-font page; **no page sets a base `body` font-size** (browser default 16px) while dashboards size every component individually at 11–15px; marketing uses `rem` (0.68–1rem), dashboards use `px`.

---

## 3. Spacing

**50 distinct padding/margin/gap values, 1,928 usages.** On the 4px grid: **1,299 (67%)** · even but off-grid (2, 6, 10, 14, 18, 22, 26 …): **497 (26%)** · odd/fractional (1, 3, 5, 7, 9, 11, 13, 15): **132 (7%)**.

| Most used | Uses · pages |
|---|---|
| 8px | 218 · 15 |
| 0 | 210 · 17 |
| 10px | 196 · 17 (off-grid) |
| 16px | 196 · 16 |
| 12px | 173 · 15 |
| 20px | 135 · 16 |
| 14px | 109 · 16 (off-grid) |
| 24px | 109 · 17 |
| 6px | 97 · 16 (off-grid) |
| 4px | 91 · 16 |
| 32px | 48 · 15 |

**Where it's inconsistent**
- **Card padding:** card-like containers use 13×15, 14, 16, 18, 20, 22, 24, 28, 32, 34 and 40px.
- **Page gutters:** 32px (dashboards, Intelligence, Integrations) · 24px (Settings) · 20px (About) · 14px (Demo on mobile) — each page chooses its own.
- **Section rhythm:** `margin-bottom` 16 / 20 / 24px used interchangeably on the same kinds of blocks (20 inline `margin-bottom:24px`, 7 × 20px, 7 × 16px).
- **Negative margins:** `-24px` (table wrappers in IMS/Shopify/Square) and one `-170px` decorative offset.
- **Magic offsets:** hard-coded top padding to clear fixed headers (`150px` on demo mobile, `80px` Intelligence, `96px` Settings, `88px` dashboards) rather than a shared header-height value.

---

## 4. Components

### 4.1 Buttons — every primary/secondary variant

**Marketing `.btn` base (4 pages, 4 different sizes):** pill radius · padding 12×20 / 10×20 / 9×18 / 10×18 · font 0.92 / 0.9 / 0.85 / 0.88rem · weight 700 (index / pricing / demo / settings).

**Primary actions:**

| Page | Class | Background | Text | Radius | Padding · font |
|---|---|---|---|---|---|
| index, pricing, demo, settings | `.btn-primary` | `90deg #29c8ff→#7c5cff` + glow | `#050816` | pill | (base above) |
| onboarding | `.btn-next` | same gradient | `#050816` | **14px** | 14px · 1rem / 800 |
| onboarding | `.btn-connect-shopify` / `-square` | `#96bf48→#5a8a1f` / `#23e6a8→#1aad80` | `#fff` / `#050816` | 12px | 12px · .9rem / 800 |
| pricing | `.tier-cta` | `.ghost-cta` white .05 + 1px border (Starter/Essential/Business) · **`.trial-cta` tinted cyan gradient with cyan text (Pro)** · `.primary-cta` solid gradient is defined but **never used** | `#f7f7ff` / `#29c8ff` | **14px** | 13px · .95rem / 800 |
| demo | `.demo-cta-btn` | same gradient | `#050816` | pill | 8×18 · .82rem / 800 |
| ims | `.btn-save` / `.btn-add` | `135deg #7c3aed→#a855f7` | white | pill | 10×20 · 13px/600 · 8×16 · 12px/600 |
| ims / shopify / square | `.btn-send` | purple / blue / green gradient | white | **12px** | 12×20 · 14px/600 · min-height 44 |
| shopify / square | `.btn-primary` | blue / green gradient + glow | white | pill | 12×28 · 15px/600 · min-height 44 |
| integrations | `.btn-connect` | `135deg #3b82f6→#60a5fa` | white | **10px** | 12px · 14px/600 |
| intelligence | `.btn-primary`, `.chat-send-btn` | **solid** `#3b82f6` | `#fff` | **9px** | 9×20 · 13px/600 |
| reports | `.btn-generate` | **reversed** `135deg #7c5cff→#29c8ff` | `#fff` | pill | 10×22 · 14px/600 |
| welcome | `.primary-btn` | **radial navy** `#1d2a4a→#12213a` + blue glow | `#e5ecff` | pill | 10×20 · 14px |
| **login / forgot-password** | `button[type=submit]` / `button` | **flat `#1a243d`** | `#b4cdff` | **10px** | 11×0 · 15px |
| **reset-password** | `button` | **flat `#1f2937`** | `#dbeafe` | 10px | 11×0 · 15px |

**Secondary / ghost:** `.btn-ghost` is defined on 6 pages with 7 different definitions (background white at .02 / .04 / .05 alpha). Others: `.btn-cancel` (IMS), `.btn-back` (onboarding, r14), `.btn-add-store` (dashed), `.filter-btn`, `.btn-logout` (retired into the shared nav). **Danger:** `.btn-danger` exists on IMS (`rgba(239,68,68,.2)` / `#fca5a5`) and Settings (`rgba(255,107,107,.1)` / `#ff6b6b`).

**Hover / active / disabled:** sampled, not exhaustively compared; 16 `outline: none` resets across 12 pages.

### 4.2 Cards — 11 definitions of `.card` across 11 pages

| Page | Background | Radius | Padding | Border | Shadow |
|---|---|---:|---|---|---|
| ims / shopify / square | radial `#1e293b→#0f172a` | 16 | 24 | 1px slate @.2 | `0 20px 40px rgba(0,0,0,.4)` |
| integrations (`.integration-card`) | same radial | 16 | 28 | same | same |
| intelligence | solid `#0c1120` | 14 | 22 | white @.07 | none |
| reports (`.metric-card`/`.chart-card`) | solid `#080d1a` | 14 | 18×20 / 24 | white @.06 | none |
| settings | translucent gradient | 24 | 24 | white @.07 | — |
| index | translucent gradient | **28** | 18 | white @.07 | — |
| pricing (`.tier`) | translucent gradient | 28 | 28×24×32 | white @.07 | — |
| onboarding | translucent gradient | 28 | 40 | white @.09 | `0 40px 100px rgba(0,0,0,.6)` |
| demo (`.panel`/`.stat-card`) | translucent gradient | 16 | 20–22 | white @.08 | — |
| login / forgot-password | radial `#1a2237→#050817` | 18 | 32×28×28 | white @.06 | `0 20px 50px rgba(0,0,0,.6)` |
| reset-password | radial `#1e293b→#020617` | 20 | 32×28×26 | slate @.35 | `0 24px 60px …` **+ cyan glow** |
| welcome | radial `#111827→#020617` | 24 | 32×30×26 | `rgba(148,163,255,.25)` | `…15,23,42,1` **+ blue glow** |

Sub-cards (platform-card r16/2px border, type-card r14, staff-card r12, review-card r12, pb-card r12, pb-ctx-card r10, plan-card r16) add six more radius/padding combinations.

### 4.3 Inputs and dropdowns

| Page | Selector | Radius | Padding | Font | Background | Border |
|---|---|---:|---|---|---|---|
| ims | `.form-input` | 10 | 10×14 | 14px | `rgba(15,23,42,.8)` | slate @.2 |
| ims / shopify / square | `.chat-input` | 12 | 12×16 | **16px**, min-h 44 | `rgba(15,23,42,.6)` | slate @.3 |
| login / forgot / reset | `input` | **8** | 10×11 | 14px | solid `#050817` / `#020617` | solid `#323a5c` / `#334155` |
| intelligence | `.goal-input`, `.chat-input-box`, `.manual-field input` | 8–9 | 7–9 × 11–13 | 13px | `rgba(255,255,255,.04)` | white @.13 |
| reports / demo | `.chat-input` | 10 | 10×14 | 13px / .85rem | white @.04–.05 | white @.10 |
| onboarding | `.field input/select` | 12 | 12×14 | .95rem | white @.04 | white @.10 |
| settings | `input/select/textarea` | 12 | 11×14 | .92rem | `rgba(0,0,0,.3)` | white @.10 |
| index | `.input` | **14** | 0×14 (height-based) | — | `rgba(0,0,0,.22)` | white @.14 |

**Focus states — four structural treatments in seven colours:** border-colour only (IMS `#a855f7`, Shopify `#60a5fa`, Square `#34d399`, Reports `#7c5cff`, Intelligence `#3b82f6`, Demo cyan @.4) · border + 1px ring (login/forgot/reset, `#6e9bff` / `#60a5fa`) · border + 3px glow (onboarding, settings) · border + 4px glow (index). **Inputs under 16px** (every page except the dashboard chat boxes) trigger iOS Safari's focus-zoom.

**Dropdowns:** no custom dropdown component exists. Native `<select>` appears in 4 treatments: IMS `.form-input`, Square inline-styled filter (r6, 6×10), onboarding `.field select`, Settings `select`.

### 4.4 Tables

`.data-table` is copy-pasted identically into IMS / Shopify / Square (th 12px `#9ca7d6`, td 13px, padding 12, slate borders). Everything else differs: **demo** (th .72rem, padding `0 0 10px`, no side padding), **reports** (th 11px `#6b7a99` on a `.02` tint, td 13px `#c8d4f0`, padding 12×16). Only 5 pages render tables; `overflow-x:auto` wrappers exist on IMS, Shopify, Square and Reports, but none was found on Demo.

### 4.5 Modals / overlays

Only two real modals: **IMS** (`#0f172a`, r16, padding 32, max-width 480, overlay `rgba(0,0,0,.75)`, z 200) and **Settings** (`#0a0f1e`, **r24**, padding 28, max 440, overlay `.7`, **z 9998**). Other pages use `alert()`/`confirm()`.

### 4.6 Badges / status pills (47 definitions across 12 pages)

Common shape = pill, 11–12px, weight 600–900, padding 3–6 × 8–14. Variants: IMS `.badge` (3×10, 11px/600, 5 colour classes) · integrations `.integration-status` (5×12, 12px/600) · settings `.integration-status` (4×10, .75rem/700) · intelligence `.pb-pill` (2×8, **10px**/700), `.bench-badge` (2×7), `.ai-insight-badge` (**9px**, r4) · reports `.ai-badge`, `.meta-tag`, `.desc-tag`, `.suggestion-chip` · marketing gradient badges (`.popular-badge`, `.plan-badge`, `.demo-badge`, `.wide-badge`) · shop badges per platform (IMS purple, Shopify `#22c55e`, Square `#34d399`). The "tinted" status recipe (bg α.15 + border α.30 + light text) is already used consistently in IMS/onboarding/pricing/Intelligence, just with different base colours.

### 4.7 Headers, navigation, sidebars

- **Signed-in app (7 pages):** one shared fixed 64px bar (resolved in the previous change).
- **Public:** index (fixed, container 1120, 36px logo, scroll progress, "Menu" button) · pricing (fixed, logo image + "AERVO" wordmark, nav links **hidden ≤768 with no menu**) · demo (fixed 1280 + a fixed top banner, "⚡ AERVO" text brand) · about (floating hamburger only, no brand/logo) · login (fixed 64px, "Back to Aervo" + 2 links hidden ≤768) · forgot-password (fixed 64px, brand only) · reset-password, welcome, onboarding: none · privacy: plain-text logo.
- **Brand mark** is rendered six ways: image logo only (36 / 38px), image + "AERVO" wordmark (pricing), "AERVO" text (forgot-password), "⚡ AERVO" (demo), plain "Aervo" (privacy), and none (about, reset-password, welcome, onboarding).
- **Sidebars:** Reports 240px sticky solid `#080d1a` · Settings 240px translucent card sidebar (sticky at 96px) · Intelligence playbook rail 268px.

### 4.8 Loading, empty, toast / message states

| State | Variants |
|---|---|
| **Spinner** | 40px / 3px slate ring + coloured top (IMS purple, Shopify blue, Square green, Integrations) · Reports 40px / 3px white .1 · Intelligence 36px and 18px / 2px blue |
| **Loading text** | "Loading your dashboard…" style with `.loading{padding:60px 20px}` on IMS/Shopify/Square; Integrations `.loading{padding:60px}`; Reports has **no `.loading` rule** (4 uses); Settings, Onboarding, Demo have none |
| **Empty** | IMS/Square `.empty-state` (40×20, `#64748b` 14px) · Integrations (80×20, 64px emoji) · Reports (56px emoji, 18px title) · Intelligence `.pb-empty` (64×20) · **Shopify uses none** |
| **Toasts** | 3 separate implementations: IMS (r12, 12×18, bottom/right 24), Intelligence (r10, 12×18, 24), Settings (14×20, **28**) |
| **Inline messages** | login `.error`, reset `.error` / `.success`; forgot-password none |
| **Native dialogs** | ≥ 26 lines with `alert(`/`confirm(`: Integrations 17, IMS 3, Reports 2, Onboarding 2, Shopify 1, Intelligence 1 |

---

## 5. Border radius, shadows, borders

**Radius — 20 distinct values:** 999px ×82 · 12px ×51 · 8px ×36 · 14px ×33 · 50% ×32 · 10px ×31 · 16px ×26 · 4px ×21 · 6px ×18 · **99px ×13 (a second "pill" spelling)** · 18, 24, 28 (×8, ×8, ×7) · 9, 0, 20, 7, 2, 5, 32. Overlaps: 8/9/10/12/14/16/18 are all used for "medium" controls and cards.

**Shadows — 70 distinct `box-shadow` values (Appendix E).** Most reused: `0 20px 40px rgba(0,0,0,.4)` (×4, 4 pages) and a handful at ×2. Everything else is bespoke — the majority of the remainder are coloured glows (cyan, violet, mint, amber, red, blue, green) at varying blur/alpha, plus stacked glow + inset combinations on marketing pages.

**Borders:** 1px ×330 (all pages) · 2px ×11 · 3px ×10 · 1.5px ×2; 348 solid, 5 dashed. Colours — see §1.5 (≥ 20 distinct border colour+alpha combinations).

**Motion / stacking:** 14 distinct transition durations (0.2s dominant: ×85 incl. `.2s`; 0.15s ×26; 0.18s, 0.3s, 180ms …) and 15 distinct z-index values (0, 1, 2, 3, 10, 20, 99, 100, 200, 300, 500, 999, 9998, 9999, 99999 — six rules sit at 9998–99999).

---

## 6. Inline styles and page-specific overrides

- **628 inline `style=""` attributes** (597 stylistic, 31 are pure `display:` toggles). **325 are inside JS template strings** — IMS 88, Shopify 56, Square 148, Intelligence 20, Reports 9. Static markup: index 112, demo 43, onboarding 35, Intelligence 40, login 18, Settings 15.
- 326 inline styles set a colour, 177 a font-size, 278 padding/margin. Repeated verbatim: `margin-bottom:24px` ×20 (4 pages), `display:flex;gap:8px;align-items:flex-start` ×21 and `color:#23e6a8;flex-shrink:0;margin-top:1px` ×21 (both in index.html's feature lists), `color:#34d399;font-weight:600` ×12, `color:#64748b` ×11, `color:#9ca7d6` ×10.
- **No shared stylesheet beyond the nav.** Of 1,570 page-level rules only **198 (13%) are byte-identical on more than one page**, almost all copy-paste between IMS ↔ Square (43), Shopify ↔ Square (42), IMS ↔ Shopify (29).
- **Same class name, different component:** `.card` (11 pages / 11 definitions) · `.btn-primary` (7 / 8) · `.btn-ghost` (6 / 7) · `.btn` (4 / 6) · `.brand` (4 / 5) · `.page` (4 / 4) · `.container` (6 / 4) · `.spinner` (5 / 4) · `.chat-messages` (5 / 4) · `.empty-state` (4 / 3).
- **`!important`:** 27 declarations — index.html 22 (13 inside media queries), Shopify 3, Square 1, Reports 1 (print).
- **Multiple style blocks:** index.html has 4 `<style>` blocks; every other page has one.

---

## 7. Layout

| Page | Max content width | Header | Grid / structure |
|---|---:|---|---|
| ims / shopify / square | **1600** | shared nav | `.grid-2` `minmax(400px,1fr)`, `.grid-3` 300, `.grid-4` 220–280 (fluid) |
| integrations | 1400 | shared nav | `repeat(auto-fill, minmax(400px,1fr))` |
| intelligence | 1360 | shared nav | 3-col intel grid; 268px rail |
| settings | 1200 | shared nav | `240px 1fr` page; sticky sidebar |
| reports | none (fills) | shared nav | `240px 1fr`; `repeat(4,1fr)` metrics |
| demo | 1280 | fixed header + banner | `repeat(4,1fr)` stats, 2/3-col, `repeat(12,1fr)` |
| index / pricing | 1120 | fixed header | hero 1.2fr/.8fr; `repeat(4,1fr)` pricing |
| privacy | 900 | none | single column |
| about / welcome | 720 | none / floating menu | single column / 3-col |
| login / forgot / reset / onboarding | card only | fixed 64px (login, forgot) / none | centred card |

**Findings:** 8 different max-widths (720 → 1600); gutters 14–32px; dashboards at 1600 vs sibling app pages at 1200–1400; header offsets are hard-coded magic numbers (§3); fixed-column grids (`repeat(4,1fr)` pricing, `repeat(12,1fr)` demo hour-grid) rely on page-specific breakpoints (980 / 640) rather than a shared one.

---

## 8. Responsiveness

**Breakpoints in use (10):** max-width 400, 480, 520, 560, **640**, 720, **768**, 820, 900, 980. 768 appears on 11 pages; 640 on 4; 480 on 3; 900 on 3. **Reset-password has no media queries.** (The shared nav adds a measured fit-to-width plus a 768 collapse.)

**Measured at 375px (iframe test):**

| Page | Page-level horizontal overflow | Tap targets < 36px tall | Text nodes < 12px |
|---|---|---:|---:|
| index | none | 1 / 13 | 7 / 164 |
| **pricing** | **header CTA group clipped** (right edge at 376px; ~16px of "Get started" off-screen at 360px, ~56px at 320px) | 6 / 12 | **33 / 127** |
| demo | none | 8 / 12 | **21 / 122** |
| about / login / forgot / welcome / onboarding | none | 1–3 | 0–5 |
| reset-password | form not exercised (error state only) | — | — |
| privacy | none | 22 / 24 (inline text links) | 0 / 232 |
| IMS — overview / products / sales / customers / expenses / import | none (sales +1px) | 7/11 · 5/21 · 8/13 · 2/7 · 1/6 · 1/7 | 5/61 · **22/67** · 4/38 · 4/32 · 4/24 · 2/20 |
| **intelligence** | none | **29 / 36** | **52 / 116 (45%)** |
| reports | none | 4 / 17 | 2 / 41 |
| settings | none | 5 / 17 | 3 / 40 |
| shopify / square / integrations | chrome only (error state) | not meaningful | not meaningful |

**Measured at 320px:** **IMS Overview overflows by 30px** (the "Recent Sales" card/table is 334px wide in a 320px viewport — `.grid-2` collapses to one column but the table's min-content is wider). Pricing header clipping as above. **At 768px: no page overflows.**

**Other responsive risks (static):**
- Pricing / login `.nav-links` and demo's `.header-right` were hidden at narrow widths with no replacement (demo header CTAs now shown; pricing still has no mobile menu).
- Inputs at 13–15px on 12+ pages cause iOS focus-zoom; only the dashboard chat boxes are 16px.
- Fixed header + fixed demo banner use hard-coded content offsets, so any wrap change causes overlap (this already happened once in demo).
- 101 font-size declarations under 12px; Intelligence's data-dense UI (9–11px) is the worst case.

---

## 9. Proposed design tokens

Chosen to match what the app already does most, with three deliberate deviations flagged **⚠** (accessibility or consolidating a split vote).

### 9.1 Colour

| Token | Value | Why (current usage) |
|---|---|---|
| `--bg` | `#02030a` | 6 pages' body background; replaces `#020617 / #050817 / #050810 / #0a1628` |
| `--bg-elevated` | `#070b17` | existing `--bg2` (index, settings) — sticky bars, sidebars, modals |
| `--surface` | `rgba(255,255,255,.04)` | cards (marketing, settings, onboarding, demo) |
| `--surface-raised` | `rgba(255,255,255,.06)` | hover / nested (most-used tint, ×33) |
| `--surface-hover` | `rgba(255,255,255,.08)` | |
| `--overlay` | `rgba(0,0,0,.7)` | modal backdrop (.7 / .75 today) |
| `--border-soft` | `rgba(255,255,255,.06)` | most-used border alpha (×31) |
| `--border` | `rgba(255,255,255,.10)` | default (×29); replaces slate @.15–.2 |
| `--border-strong` | `rgba(255,255,255,.20)` | hover / emphasis; replaces slate @.2–.3 |
| `--text` | `#e5ecff` | primary text, 12 pages |
| `--text-secondary` | `#9ca7d6` | 11 pages, 77 uses; 8.7:1 |
| `--text-muted` | `#6b7a99` ⚠ | 4.77:1 (passes AA). Majority muted is `#64748b` (4.33:1, fails) — this is the closest passing value |
| `--primary-from` / `--primary-to` | `#29c8ff` / `#7c5cff` | the brand pair on 8 pages (167 + 140 uses) |
| `--gradient-primary` | `linear-gradient(90deg, #29c8ff, #7c5cff)` | 17 uses vs 9 for 135° |
| `--on-primary` | `#050816` ⚠ | 10.3:1 on cyan, 4.6:1 on violet; white fails (1.9:1) on the cyan end |
| `--focus-ring` | `0 0 0 3px rgba(41,200,255,.15)` + border `rgba(41,200,255,.5)` | the glow already used by onboarding/settings |
| `--success` | `#34d399` (text `#6ee7b7`) | merges `#23e6a8 / #10b981 / #22c55e` |
| `--warning` | `#fbbf24` | merges `#f59e0b / #f5c26b / #ffc107` |
| `--danger` | `#ef4444` (text `#fca5a5`) | merges `#ff6b6b / #f87171 / #ff6464` |
| `--info` | `#60a5fa` (text `#93c5fd`) | merges `#3b82f6 / #38bdf8 / #5b9cf5` |
| status tint recipe | bg `α .15` · border `α .30` · text = light variant | already how IMS/onboarding/pricing pills are built |

### 9.2 Typography

| Token | Value |
|---|---|
| `--font-sans` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (16 of 17 pages; drops unloaded "Inter" and "SF Pro Text") |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` (replaces DM Mono) |
| Size scale (px) | **11 · 12 · 13 · 14 · 16 · 18 · 20 · 24 · 32 · 40 · 56**, hero `clamp()` stays. Rule: round to nearest (15 → 14 for body, 16 for inputs/headings) — collapses 57 values to 11 |
| Weights | **400 · 500 · 600 · 700 · 800** (850 → 800, 900/950 → 800) |
| Line-height | **1.2** headings · **1.5** UI/body · **1.7** long-form (privacy) · 1 for icon/number-only boxes |
| Letter-spacing | **−0.02em** display headings · **0** default · **0.08em** uppercase labels |
| Minimum text size | 11px (nothing below; today 8.8–10.88px on 7 pages) |
| Input font-size | 16px on mobile (stops iOS zoom), 14px ≥ 768 |

### 9.3 Spacing, radius, shadow, motion

| Token | Values |
|---|---|
| Spacing (4px grid) | **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80**. Mapping: 1–3→4 · 5–7→8 · 9–11→12 · 13–15→16 · 17–19→20 · 21–23→24 · 26–28→24/32 · ties round up |
| Radius | `xs 4` · `sm 8` (tags, small controls) · `md 12` (inputs, buttons-in-forms, small cards) · `lg 16` (cards) · `xl 24` (hero cards, modals) · `pill 999px` · circle `50%`. Mapping: 6,9→8 · 10,14→12/16 · 18→16 · 20,28,32→24 · 99→999 |
| Shadow | `sm 0 2px 8px rgba(0,0,0,.4)` · `md 0 20px 40px rgba(0,0,0,.4)` (existing #1) · `lg 0 40px 80px rgba(0,0,0,.6)` (modals, existing) · `glow 0 0 18px rgba(41,200,255,.3)` (existing) — replaces 70 |
| Border | 1px solid `--border` default; 2px only for selectable cards / active state; dashed only for drop zones |
| Motion | `--dur-fast .15s` · `--dur .2s` (majority) · `--dur-slow .3s`; ease default |
| z-index | `1` raised · `10` sticky · `100` nav · `200` popover · `1000` modal · `1100` toast |
| Breakpoints | `480` · `768` · `1024` (collapses 10 values; 768 is already the majority) |
| Layout | nav `64px`; marketing container `1120`; app container `1400`; narrow `720`; legal `900` |

### 9.4 Canonical component specs (to be applied in Phase 2)

- **Button:** pill, 13–14px/600, padding 10×20 (lg 12×28), primary = `--gradient-primary` + `--on-primary` + glow; secondary = `--surface` + `--border`; danger = danger tint recipe; full-width form submit = radius 12. Min height 40 (44 on touch).
- **Input / select / textarea:** radius 12, padding 10×14, `--surface` fill, `--border`, `--focus-ring` on focus (never bare `outline:none`).
- **Card:** `--surface`, `--border`, radius 16, padding 24 (20 compact), optional `shadow-md`.
- **Badge:** pill, 11px/600, padding 3×10, status tint recipe.
- **Table:** th 12px secondary on `--surface`, td 13–14px, padding 12×16, `--border-soft` rows, always inside an `overflow-x:auto` wrapper.
- **Modal:** `--bg-elevated`, radius 24, padding 28–32, `--overlay`, z 1000.
- **Loading / empty:** one spinner (40px / 3px, `--primary-from` top) and one empty-state block (icon + 16px title + 14px secondary text + optional CTA).
- **Toast:** one shared implementation replacing the three, plus replace `alert()`/`confirm()`.

---

## 10. Decisions needed before Phase 2

1. **Platform accents.** Dashboards currently colour by platform (IMS purple, Shopify blue, Square green). Recommendation: **one brand primary for all buttons/links**, and keep a per-platform `--accent` only for the active tab, shop badge and charts (the shared nav already works this way via `data-accent`). Confirm, or choose to unify fully.
2. **Primary gradient text colour.** Dark `#050816` (passes AA, matches the marketing site) vs white (fails on cyan). Recommendation: dark.
3. **Dashboard max-width 1600 → 1400** (matches Integrations/Intelligence; changes how wide IMS/Shopify/Square render on large monitors). Keep 1600?
4. **Intelligence's DM Sans.** Recommendation: drop it and use the system stack (removes the only external font request). Or load DM Sans site-wide.
5. **Marketing card radius 28 → 24** and weight 950 → 800 are small visible changes to the landing page. Acceptable?
6. **Delivery approach (suggested):** add `assets/css/tokens.css` (the variables above) + `base.css` + `components.css`, link them from every page, then migrate page by page (auth pages first — smallest, most visible inconsistency — then dashboards, then marketing), with before/after screenshots at 375/768/1280 for each page.

---

## 11. Phase 2 results (implemented)

### 11.1 What shipped

- **Shared design layer**, loaded in this order on every page: `assets/css/tokens.css` → `base.css` → `components.css` (+ `app-nav.css` on signed-in pages) → page `<style>` (layout only) → `assets/js/ui.js`.
- **`tokens.css`**: colour, type, spacing, radius, shadow, motion, z-index and layout tokens from section 9. Platform accents are the only per-page colour (`--accent` / `--accent-rgb`: IMS `#a855f7`, Shopify `#60a5fa`, Square `#34d399`).
- **`components.css`**: buttons, form controls, cards, badges, tables, modal, toast, spinner/empty/alert, and the auth shell. Old page-specific class names (`.btn-save`, `.btn-send`, `.panel`, `.tier`, …) resolve to the canonical component, so page CSS keeps layout only.
- **`ui.js`**: one `showToast`, `uiConfirm`, `uiPrompt`. All native `alert/confirm/prompt` calls and the three page-local toast implementations were removed.
- **Pages migrated (17):** login, forgot-password, reset-password, welcome, about, privacy, dashboard/ims, dashboard/shopify, dashboard/square, integrations, intelligence, reports, settings, index, pricing, demo, onboarding (plus the shared nav).
- 188 repeated inline styles were converted to utility classes in `base.css`.

### 11.2 Before → after (same measuring scripts as Phase 1)

| Metric | Before | After |
|---|---|---|
| Distinct base colours | 123 | 39 |
| Colour + alpha combinations | 404 | 193 |
| Font sizes | 57 | 13 |
| Font weights | 8 | 5 |
| Line-heights | 17 | 4 |
| Letter-spacings | 36 | 3 |
| Spacing values | 50 | 28 |
| Spacing on the 4px grid | 67% | 97% |
| Border radii | 20 | 8 |
| Box shadows | 70 | 10 |
| z-index values | 13 | 7 |
| Transition durations | 12 | 5 |
| `outline: none` | 16 | 3 |
| Inline `style=""` attributes | 628 | 426 |
| Page-owned CSS | 249 KB | 215 KB (+ 37 KB shared, cached once) |

### 11.3 Decisions applied, and where I deviated

Applied as recommended: one brand gradient `#29c8ff → #7c5cff` for all primary buttons with dark text (white fails AA on the cyan end); `--text-muted` is `#6b7a99` (AA); app max-width 1400px; system font stack everywhere (Intelligence's DM Sans/DM Mono removed).

Deviations:
- The type scale also contains 28px and 48px (avoids large jumps in stat numbers and hero text).
- Spacing of 3px or less (hairlines) stays literal.
- Chart.js configs keep literal colours, because CSS variables can't be read there: platform hue for series, token values for ticks and grids.
- `.card` padding is now 24px everywhere; compact lists use `.card-compact` (16px).
- Marketing `--text` is slightly bluer than before; the Pro plan CTA is now the primary gradient.

### 11.4 Pre-existing markup bugs fixed along the way

- **login**: nested/unclosed buttons and a broken "or" divider around the Google/Shopify buttons.
- **about**: nested `<head>` and duplicate `<title>`.
- **reports**: missing `<main>` wrapper and a duplicated block with duplicate IDs.
- **intelligence**: raw `${...}` template text rendered on the page.
- **settings**: stray "Upload photo" text and an orphan `</button>`.
- **Responsive:** IMS overflowed at 320px and the Pricing header CTA clipped (both fixed); Demo's banner CTA overlapped the fixed header (fixed).

### 11.5 Verification performed

- Before/after screenshots at 375 / 768 / 1280 for every page, plus the sub-views and states (IMS tabs and modals, Shopify and Square tabs, settings billing and delete modal, reports CSV tab, toast). "Before" comes from a pristine export of `HEAD`.
- A mock API stub with realistic Shopify, Square and Integrations data (the real API only allows CORS from aervoapp.com).
- Link audit: 0 broken links across 17 pages. Handler audit: no undefined handlers (the three `showToast` hits are false positives; `ui.js` is loaded on those pages).
- Syntax check of every inline script.
- Two regressions found in the final sweep and fixed:
  - The shared nav could overflow after a resize, because links animate `all` and were measured mid-transition. `app-nav.js` now measures with transitions off and refits on resize of its parts.
  - The Square orders toolbar select inherited the full-width form-control rule. Added `.input-sm`.

### 11.6 Remaining

- About 400 inline styles remain, mostly one-off layout inside JS templates.
- 11px is still the smallest text size (badges, table headers).
- Demo overflows by 2px at 320px.
- Shopify App Bridge throws a console error outside the Shopify admin (pre-existing, expected).
- Placeholder mock shapes show "undefined" in a few widgets on the local preview only (e.g. reports upload quota); the live API returns the real shape.

---

## Appendix A — Every distinct base colour (123)

Sorted by usage. "Uses" counts every occurrence in page CSS, inline styles, JS-built markup and chart config. Alpha variants are the number of distinct opacities the same RGB is used at.

| Colour | Uses | Pages | Main roles | Alpha variants |
|---|---:|---:|---|---:|
| `#ffffff` | 412 | 14 | bg 178, border 169, text 48 | 22 |
| `#29c8ff` | 167 | 8 | bg 90, shadow 31, border 19 | 27 |
| `#7c5cff` | 140 | 8 | bg 89, border 20, other 14 | 24 |
| `#d7dcf0` | 123 | 5 | text 118, bg 3, other 2 | 15 |
| `#23e6a8` | 119 | 9 | text 46, bg 42, border 18 | 17 |
| `#9ca7d6` | 106 | 11 | text 77, other 29 | — |
| `#94a3b8` | 93 | 7 | border 51, text 18, other 16 | 10 |
| `#34d399` | 84 | 5 | text 32, bg 18, other 18 | 15 |
| `#e5ecff` | 79 | 12 | text 73, other 6 | — |
| `#60a5fa` | 66 | 8 | other 19, text 17, bg 15 | 13 |
| `#3b82f6` | 64 | 4 | bg 29, border 24, shadow 6 | 14 |
| `#000000` | 60 | 15 | shadow 26, bg 18, other 14 | 18 |
| `#a855f7` | 49 | 2 | bg 20, border 14, other 9 | 11 |
| `#64748b` | 45 | 4 | text 43, other 2 | — |
| `#ef4444` | 43 | 5 | bg 16, other 13, border 10 | 11 |
| `#f7f7ff` | 40 | 5 | text 34, bg 4, other 2 | — |
| `#0f172a` | 37 | 7 | bg 25, other 11, shadow 1 | 8 |
| `#6b7a99` | 32 | 4 | text 26, other 6 | — |
| `#fbbf24` | 30 | 7 | text 10, other 8, bg 7 | 8 |
| `#475569` | 28 | 2 | text 26, other 2 | — |
| `#ff6b6b` | 25 | 2 | text 8, bg 7, border 5 | 14 |
| `#f59e0b` | 24 | 3 | other 7, bg 7, text 6 | 9 |
| `#f1f5f9` | 24 | 1 | text 23, other 1 | — |
| `#050817` | 22 | 9 | bg 22 | 4 |
| `#fca5a5` | 20 | 4 | text 17, other 3 | — |
| `#050816` | 19 | 5 | text 19 | — |
| `#8fbfff` | 17 | 9 | bg 7, border 7, text 3 | 3 |
| `#10b981` | 17 | 1 | other 7, bg 6, border 3 | 6 |
| `#02030a` | 16 | 6 | bg 16 | 6 |
| `#6ee7b7` | 15 | 5 | text 14, other 1 | — |
| `#93c5fd` | 15 | 9 | text 14, other 1 | — |
| `#f87171` | 15 | 6 | text 9, other 6 | 2 |
| `#d8b4fe` | 13 | 1 | text 13 | — |
| `#9aa8c8` | 13 | 3 | text 13 | — |
| `#020617` | 11 | 7 | bg 11 | — |
| `#e5e7eb` | 11 | 6 | text 10, bg 1 | — |
| `#8b5cf6` | 11 | 1 | bg 5, border 5, other 1 | 10 |
| `#7c3aed` | 10 | 1 | bg 8, border 1, shadow 1 | 3 |
| `#22c55e` | 10 | 4 | bg 7, border 3 | 4 |
| `#96bf48` | 10 | 2 | bg 5, border 4, text 1 | 5 |
| `#f9fafb` | 9 | 6 | text 9 | — |
| `#dfe7ff` | 9 | 8 | text 9 | — |
| `#1a2237` | 9 | 9 | bg 9 | — |
| `#a78bfa` | 9 | 4 | text 7, other 1, bg 1 | — |
| `#ff6464` | 8 | 2 | bg 4, text 3, border 1 | 5 |
| `#080d1a` | 8 | 1 | bg 8 | — |
| `#c8d4f0` | 8 | 1 | text 8 | — |
| `#3a4a7c` | 7 | 7 | border 7 | — |
| `#4a5a8c` | 7 | 7 | border 7 | — |
| `#fde047` | 6 | 3 | text 6 | — |
| `#059669` | 6 | 1 | bg 3, shadow 2, border 1 | 4 |
| `#ffc107` | 6 | 1 | bg 3, text 2, border 1 | 4 |
| `#f5c26b` | 6 | 2 | svg 2, other 2, bg 1 | 4 |
| `#b4e6ff` | 6 | 2 | other 6 | 2 |
| `#b8c5d6` | 6 | 1 | text 6 | — |
| `#f0f4ff` | 6 | 1 | text 6 | — |
| `#1e293b` | 5 | 5 | bg 5 | — |
| `#cbd5e1` | 5 | 3 | text 4, other 1 | — |
| `#ebeeff` | 5 | 2 | text 5 | 3 |
| `#111827` | 5 | 3 | bg 5 | — |
| `#8b94c0` | 5 | 2 | text 5 | — |
| `#5078b4` | 5 | 1 | border 5 | — |
| `#4dd4d4` | 5 | 1 | text 3, bg 1, border 1 | 2 |
| `#6e9bff` | 4 | 2 | border 2, shadow 2 | 2 |
| `#89b4ff` | 4 | 2 | shadow 4 | 2 |
| `#5082ff` | 4 | 2 | shadow 4 | 2 |
| `#0c1120` | 4 | 1 | bg 4 | — |
| `#2563eb` | 4 | 2 | bg 2, shadow 2 | 3 |
| `#7a8ba0` | 4 | 1 | text 4 | — |
| `#38bdf8` | 3 | 2 | shadow 2, bg 1 | 3 |
| `#86efac` | 3 | 3 | text 3 | — |
| `#f5f7ff` | 3 | 1 | text 3 | — |
| `#050810` | 3 | 1 | bg 3 | 2 |
| `#fecaca` | 3 | 2 | text 2, other 1 | — |
| `#0f1e32` | 3 | 1 | bg 3 | — |
| `#cbd5f5` | 2 | 2 | text 2 | — |
| `#9ca3af` | 2 | 2 | text 2 | — |
| `#ffd166` | 2 | 1 | text 1, bg 1 | — |
| `#d6def8` | 2 | 2 | text 2 | — |
| `#c5cff6` | 2 | 2 | text 2 | — |
| `#323a5c` | 2 | 2 | border 2 | — |
| `#1a243d` | 2 | 2 | bg 2 | — |
| `#b4cdff` | 2 | 2 | text 2 | — |
| `#222c48` | 2 | 2 | bg 2 | — |
| `#ff7b7b` | 2 | 2 | text 2 | — |
| `#aaafcd` | 2 | 1 | text 2 | — |
| `#a6b3dd` | 2 | 1 | text 2 | — |
| `#bbf7d0` | 2 | 2 | text 2 | — |
| `#0a1628` | 2 | 1 | bg 2 | — |
| `#c7d2fe` | 2 | 2 | text 2 | — |
| `#1f2937` | 2 | 2 | bg 1, border 1 | — |
| `#818cf8` | 2 | 2 | shadow 2 | 2 |
| `#6b7280` | 2 | 2 | text 2 | — |
| `#94a3ff` | 2 | 1 | border 2 | 2 |
| `#3b0764` | 1 | 1 | bg 1 | — |
| `#fb923c` | 1 | 1 | other 1 | — |
| `#1e3a8a` | 1 | 1 | bg 1 | — |
| `#064e3b` | 1 | 1 | bg 1 | — |
| `#fb7185` | 1 | 1 | other 1 | — |
| `#b4d2ff` | 1 | 1 | bg 1 | — |
| `#a0c8ff` | 1 | 1 | bg 1 | — |
| `#96c3ff` | 1 | 1 | bg 1 | — |
| `#8cbeff` | 1 | 1 | bg 1 | — |
| `#b4dcff` | 1 | 1 | bg 1 | — |
| `#151e30` | 1 | 1 | bg 1 | — |
| `#95bf47` | 1 | 1 | bg 1 | — |
| `#0d1124` | 1 | 1 | bg 1 | — |
| `#5a8a1f` | 1 | 1 | bg 1 | — |
| `#1aad80` | 1 | 1 | bg 1 | — |
| `#0d1f35` | 1 | 1 | bg 1 | — |
| `#5b9cf5` | 1 | 1 | text 1 | — |
| `#67e8f9` | 1 | 1 | text 1 | — |
| `#dddddd` | 1 | 1 | border 1 | — |
| `#666666` | 1 | 1 | text 1 | — |
| `#0d1426` | 1 | 1 | bg 1 | — |
| `#c4b5fd` | 1 | 1 | text 1 | — |
| `#334155` | 1 | 1 | border 1 | — |
| `#dbeafe` | 1 | 1 | text 1 | — |
| `#0f1628` | 1 | 1 | bg 1 | — |
| `#0a0f1e` | 1 | 1 | bg 1 | — |
| `#020213` | 1 | 1 | bg 1 | — |
| `#1d2a4a` | 1 | 1 | bg 1 | — |
| `#12213a` | 1 | 1 | bg 1 | — |

## Appendix B — Every font-size value (px; rem × 16)

| Size | Uses | Pages |
|---:|---:|---:|
| 8.8px | 1 | 1 |
| 9px | 1 | 1 |
| 9.6px | 1 | 1 |
| 10px | 15 | 6 |
| 10.4px | 1 | 1 |
| 10.88px | 2 | 2 |
| 11px | 62 | 6 |
| 11.2px | 3 | 2 |
| 11.52px | 15 | 5 |
| 12px | 104 | 13 |
| 12.48px | 19 | 5 |
| 12.8px | 18 | 5 |
| 13px | 106 | 12 |
| 13.12px | 19 | 4 |
| 13.28px | 1 | 1 |
| 13.44px | 4 | 1 |
| 13.6px | 24 | 6 |
| 13.76px | 4 | 1 |
| 14px | 63 | 13 |
| 14.08px | 12 | 4 |
| 14.4px | 25 | 6 |
| 14.72px | 12 | 3 |
| 15px | 20 | 11 |
| 15.2px | 12 | 5 |
| 15.68px | 1 | 1 |
| 16px | 32 | 13 |
| 16.32px | 1 | 1 |
| 16.8px | 3 | 3 |
| 16.96px | 1 | 1 |
| 17px | 1 | 1 |
| 17.6px | 4 | 3 |
| 18px | 13 | 9 |
| 18.4px | 1 | 1 |
| 19.2px | 6 | 3 |
| 20px | 18 | 7 |
| 20.8px | 1 | 1 |
| 22px | 13 | 9 |
| 22.4px | 6 | 4 |
| 24px | 16 | 11 |
| 25.6px | 4 | 4 |
| 26px | 4 | 4 |
| 28px | 10 | 7 |
| 28.8px | 4 | 4 |
| 30px | 1 | 1 |
| 30.4px | 1 | 1 |
| 32px | 8 | 6 |
| 32.8px | 1 | 1 |
| 36px | 2 | 2 |
| 38px | 1 | 1 |
| 38.4px | 5 | 2 |
| 40px | 1 | 1 |
| 42px | 3 | 3 |
| 44.8px | 1 | 1 |
| 48px | 3 | 2 |
| 52px | 1 | 1 |
| 56px | 1 | 1 |
| 64px | 2 | 2 |
| `clamp(2.6rem, 4.8vw, 4.1rem)` | 1 | 1 (index) |
| `clamp(2.4rem, 5vw, 3.8rem)` | 1 | 1 (pricing) |

## Appendix C — Every padding / margin / gap value (px)

On the 4px grid = divisible by 4.

| Value | Uses | Pages | On 4px grid |
|---:|---:|---:|:--:|
| -170px | 1 | 1 | no |
| -24px | 3 | 3 | yes |
| -4px | 1 | 1 | yes |
| -1px | 1 | 1 | no |
| 0px | 210 | 17 | yes |
| 1px | 28 | 5 | no |
| 2px | 29 | 9 | no |
| 3px | 24 | 10 | no |
| 4px | 91 | 16 | yes |
| 5px | 22 | 6 | no |
| 6px | 97 | 16 | no |
| 7px | 19 | 8 | no |
| 8px | 218 | 15 | yes |
| 9px | 8 | 3 | no |
| 10px | 196 | 17 | no |
| 11px | 19 | 7 | no |
| 12px | 173 | 15 | yes |
| 13px | 8 | 2 | no |
| 14px | 109 | 16 | no |
| 15px | 3 | 1 | no |
| 16px | 196 | 16 | yes |
| 18px | 29 | 12 | no |
| 20px | 135 | 16 | yes |
| 22px | 19 | 7 | no |
| 24px | 109 | 17 | yes |
| 26px | 9 | 3 | no |
| 28px | 30 | 14 | yes |
| 30px | 1 | 1 | no |
| 32px | 48 | 15 | yes |
| 34px | 2 | 1 | no |
| 36px | 2 | 2 | yes |
| 40px | 20 | 13 | yes |
| 44px | 1 | 1 | yes |
| 48px | 13 | 9 | yes |
| 52px | 1 | 1 | yes |
| 56px | 5 | 3 | yes |
| 60px | 13 | 9 | yes |
| 64px | 5 | 5 | yes |
| 70px | 1 | 1 | no |
| 72px | 4 | 4 | yes |
| 80px | 10 | 7 | yes |
| 88px | 4 | 4 | yes |
| 90px | 1 | 1 | no |
| 92px | 1 | 1 | yes |
| 96px | 2 | 2 | yes |
| 100px | 3 | 2 | yes |
| 110px | 1 | 1 | no |
| 120px | 1 | 1 | yes |
| 130px | 1 | 1 | no |
| 150px | 1 | 1 | no |

## Appendix D — Every border-radius value

| Value | Uses | Pages |
|---|---:|---:|
| `999px` | 82 | 13 |
| `12px` | 51 | 12 |
| `8px` | 36 | 13 |
| `50%` | 32 | 12 |
| `10px` | 31 | 12 |
| `16px` | 26 | 11 |
| `14px` | 21 | 8 |
| `6px` | 18 | 6 |
| `4px` | 13 | 3 |
| `99px` | 13 | 1 |
| `18px` | 8 | 8 |
| `24px` | 8 | 3 |
| `28px` | 7 | 3 |
| `9px` | 6 | 1 |
| `7px` | 2 | 2 |
| `4px 4px 0 0` | 2 | 2 |
| `inherit` | 2 | 1 |
| `2px` | 2 | 1 |
| `20px` | 2 | 2 |
| `4px 14px 14px 14px` | 1 | 1 |
| `14px 4px 14px 14px` | 1 | 1 |
| `32px` | 1 | 1 |
| `5px` | 1 | 1 |
| `14px 14px 4px 14px` | 1 | 1 |
| `14px 14px 14px 4px` | 1 | 1 |

## Appendix E — Every box-shadow value (70)

| Shadow | Uses | Pages |
|---|---:|---:|
| `0 20px 40px rgba(0, 0, 0, 0.4)` | 4 | 4 |
| `0 0 18px rgba(41, 200, 255, 0.25)` | 2 | 2 |
| `0 0 16px rgba(41, 200, 255, 0.4)` | 2 | 2 |
| `0 20px 50px rgba(0, 0, 0, 0.6)` | 2 | 2 |
| `0 0 0 1px rgba(110, 155, 255, 0.5)` | 2 | 2 |
| `0 0 12px rgba(137, 180, 255, 0.4), 0 0 26px rgba(80, 130, 255, 0.3)` | 2 | 2 |
| `0 0 16px rgba(137, 180, 255, 0.8), 0 0 40px rgba(80, 130, 255, 0.6)` | 2 | 2 |
| `0 24px 90px rgba(0, 0, 0, 0.75)` | 2 | 1 |
| `0 0 0 3px rgba(41, 200, 255, 0.1)` | 2 | 2 |
| `0 20px 40px rgba(0, 0, 0, 0.45)` | 1 | 1 |
| `0 10px 40px rgba(124, 58, 237, 0.2)` | 1 | 1 |
| `0 40px 80px rgba(0, 0, 0, 0.6)` | 1 | 1 |
| `0 12px 40px rgba(0, 0, 0, 0.55)` | 1 | 1 |
| `0 10px 40px rgba(59, 130, 246, 0.2)` | 1 | 1 |
| `0 10px 30px rgba(59, 130, 246, 0.4)` | 1 | 1 |
| `0 14px 40px rgba(59, 130, 246, 0.6)` | 1 | 1 |
| `0 10px 40px rgba(5, 150, 105, 0.2)` | 1 | 1 |
| `0 10px 30px rgba(5, 150, 105, 0.4)` | 1 | 1 |
| `0 0 18px rgba(41, 200, 255, 0.3)` | 1 | 1 |
| `0 0 28px rgba(41, 200, 255, 0.5)` | 1 | 1 |
| `0 2px 12px rgba(0, 0, 0, 0.3)` | 1 | 1 |
| `0 16px 40px rgba(0, 0, 0, 0.4)` | 1 | 1 |
| `0 0 18px rgba(41, 200, 255, 0.32), 0 0 32px rgba(124, 92, 255, 0.22)` | 1 | 1 |
| `0 0 22px rgba(41, 200, 255, 0.5), 0 0 40px rgba(124, 92, 255, 0.35)` | 1 | 1 |
| `0 0 18px rgba(41, 200, 255, 0.32)` | 1 | 1 |
| `0 18px 60px rgba(0, 0, 0, 0.3)` | 1 | 1 |
| `0 0 16px rgba(255, 255, 255, 0.18)` | 1 | 1 |
| `0 0 18px rgba(35, 230, 168, 0.35)` | 1 | 1 |
| `0 0 18px rgba(245, 194, 107, 0.35)` | 1 | 1 |
| `0 0 18px rgba(255, 107, 107, 0.35)` | 1 | 1 |
| `inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 10px 24px rgba(0, 0, 0, 0.45)` | 1 | 1 |
| `0 24px 70px rgba(0, 0, 0, 0.75)` | 1 | 1 |
| `0 0 14px rgba(41, 200, 255, 0.25)` | 1 | 1 |
| `0 40px 140px rgba(0,0,0,.75), inset 0 0 0 1px rgba(255,255,255,.04)` | 1 | 1 |
| `0 30px 120px rgba(0, 0, 0, 0.72)` | 1 | 1 |
| `0 0 0 4px rgba(41, 200, 255, 0.12)` | 1 | 1 |
| `inset 0 0 0 1px rgba(255,255,255,.07), inset 0 10px 24px rgba(0,0,0,.55), 0 0 0 1px rgba(41,200,255,.03)` | 1 | 1 |
| `0 2px 8px rgba(0,0,0,.4)` | 1 | 1 |
| `0 0 0 1px rgba(41,200,255,.18),0 20px 60px rgba(41,200,255,.12)` | 1 | 1 |
| `0 0 20px rgba(41,200,255,.25)` | 1 | 1 |
| `0 20px 50px rgba(0, 0, 0, 0.5)` | 1 | 1 |
| `0 4px 12px rgba(59, 130, 246, 0.3)` | 1 | 1 |
| `0 6px 16px rgba(59, 130, 246, 0.4)` | 1 | 1 |
| `0 8px 32px rgba(0, 0, 0, 0.4)` | 1 | 1 |
| `0 0 24px rgba(41, 200, 255, 0.35)` | 1 | 1 |
| `0 40px 100px rgba(0, 0, 0, 0.6)` | 1 | 1 |
| `0 0 20px rgba(41, 200, 255, 0.15)` | 1 | 1 |
| `0 0 20px rgba(35, 230, 168, 0.15)` | 1 | 1 |
| `0 0 20px rgba(124, 92, 255, 0.15)` | 1 | 1 |
| `0 0 20px rgba(168, 85, 247, 0.2)` | 1 | 1 |
| `0 0 20px rgba(41, 200, 255, 0.3)` | 1 | 1 |
| `0 0 32px rgba(41, 200, 255, 0.5)` | 1 | 1 |
| `0 0 40px rgba(35, 230, 168, 0.4)` | 1 | 1 |
| `0 0 18px rgba(41, 200, 255, 0.28), 0 0 32px rgba(124, 92, 255, 0.18)` | 1 | 1 |
| `0 0 26px rgba(41, 200, 255, 0.5), 0 0 44px rgba(124, 92, 255, 0.32)` | 1 | 1 |
| `0 2px 8px rgba(0, 0, 0, 0.4)` | 1 | 1 |
| `0 30px 80px rgba(0, 0, 0, 0.6)` | 1 | 1 |
| `0 0 0 1px rgba(41, 200, 255, 0.2), 0 20px 60px rgba(41, 200, 255, 0.12)` | 1 | 1 |
| `0 0 0 1px rgba(41, 200, 255, 0.3), 0 36px 100px rgba(41, 200, 255, 0.2)` | 1 | 1 |
| `0 0 20px rgba(41, 200, 255, 0.25), 0 0 36px rgba(124, 92, 255, 0.18)` | 1 | 1 |
| `0 0 28px rgba(41, 200, 255, 0.45), 0 0 50px rgba(124, 92, 255, 0.3)` | 1 | 1 |
| `0 8px 24px rgba(124, 92, 255, 0.35)` | 1 | 1 |
| `0 12px 32px rgba(124, 92, 255, 0.45)` | 1 | 1 |
| `0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(56, 189, 248, 0.15)` | 1 | 1 |
| `0 0 0 1px rgba(96, 165, 250, 0.4)` | 1 | 1 |
| `0 0 14px rgba(96, 165, 250, 0.55), 0 0 40px rgba(59, 130, 246, 0.35)` | 1 | 1 |
| `0 0 18px rgba(129, 140, 248, 0.9), 0 0 50px rgba(56, 189, 248, 0.5)` | 1 | 1 |
| `0 0 28px rgba(41, 200, 255, 0.45)` | 1 | 1 |
| `0 24px 80px rgba(15, 23, 42, 1), 0 0 60px rgba(37, 99, 235, 0.45)` | 1 | 1 |
| `0 0 18px rgba(129, 140, 248, 0.8), 0 0 46px rgba(37, 99, 235, 0.7)` | 1 | 1 |

## Appendix F — Near-duplicate colour clusters (ΔE < 4.5, i.e. visually indistinguishable)

| # | Colours (× uses) | Pages touched |
|---:|---|---:|
| 1 | `#ffffff` ×412 · `#f1f5f9` ×24 · `#f9fafb` ×9 | 16 |
| 2 | `#d7dcf0` ×123 · `#dfe7ff` ×9 · `#d6def8` ×2 | 13 |
| 3 | `#e5ecff` ×79 · `#ebeeff` ×5 · `#dbeafe` ×1 | 14 |
| 4 | `#60a5fa` ×66 · `#5b9cf5` ×1 | 9 |
| 5 | `#000000` ×60 · `#02030a` ×16 · `#050810` ×3 | 15 |
| 6 | `#f7f7ff` ×40 · `#f0f4ff` ×6 · `#f5f7ff` ×3 | 6 |
| 7 | `#0f172a` ×37 · `#111827` ×5 · `#0c1120` ×4 · `#0f1e32` ×3 · `#0a1628` ×2 · `#151e30` ×1 · `#0d1124` ×1 · `#0d1426` ×1 · `#0f1628` ×1 | 13 |
| 8 | `#ff6b6b` ×25 · `#ff6464` ×8 | 4 |
| 9 | `#050817` ×22 · `#050816` ×19 · `#020617` ×11 · `#080d1a` ×8 · `#0a0f1e` ×1 · `#020213` ×1 | 16 |
| 10 | `#8fbfff` ×17 · `#96c3ff` ×1 · `#8cbeff` ×1 | 10 |
| 11 | `#93c5fd` ×15 · `#a0c8ff` ×1 | 10 |
| 12 | `#f87171` ×15 · `#ff7b7b` ×2 | 7 |
| 13 | `#e5e7eb` ×11 · `#dddddd` ×1 | 6 |
| 14 | `#96bf48` ×10 · `#95bf47` ×1 | 3 |
| 15 | `#1a2237` ×9 · `#1e293b` ×5 · `#1a243d` ×2 · `#0d1f35` ×1 · `#12213a` ×1 | 12 |
| 16 | `#c8d4f0` ×8 · `#cbd5f5` ×2 | 3 |
| 17 | `#c5cff6` ×2 · `#c7d2fe` ×2 | 4 |
| 18 | `#b4cdff` ×2 · `#b4d2ff` ×1 | 3 |
| 19 | `#222c48` ×2 · `#1d2a4a` ×1 | 3 |

