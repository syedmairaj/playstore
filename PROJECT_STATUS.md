# playstore.xyz — Project Status

> Branch: `googleplay` · Last updated: June 2026

---

## What Was Built — Full Progress Summary

### 1. AI Listing Optimizer (Core Feature)
The flagship feature. Generates fully structured Google Play Store listings using Gemini with a consultant-grade prompt engine.

- **Prompt engine v1–v11**: Evolved from basic generation to a full synthesis hierarchy with Fix/Exploit/Narrative framework, keyword categorisation, tone differentiation (Bold/Professional/Playful/Narrative), Arabic parity, and a "clean room rule" preventing data leakage between competitors.
- **Two-step wizard**: App context → Optimization signals → Generate. Active Context pills show what signals are driving the generation.
- **Keyword Strategy panel**: Categorised keyword chips (Primary/Secondary/Gap) with staggered reveal animation and Play Store ranking rationale.
- **v8 fields**: What's New, Screenshot Captions, A/B Title Variants, CTA Suggestions surfaced in results.
- **strategySummary + ctaSuggestion** wired into results panel.
- **OptimizerCreditsConfirmDialog**: Dynamic synthesis summary before crediting.
- **Optimization Sources sidebar**: Shows which signals (reviews, competitor, spotlight) fed into the generation.
- **Active Optimization Queue**: Cards from `workspace_listing_improvements` backlog with "Open in Optimizer" + dismiss. Atomic queue→archive transition on generation success.
- **History Archive**: Compact grid of past generations with delete, date, competitor source badge.
- **ASO Performance Attribution**: `listing_snapshots` + `listing_metrics` tables. Snapshot captured after every generation. `ListingHistory` component with Growth Tracking collapsible panel.
- **Quality Status badge** + Pro-tip note in Step 3.
- **"Strategic Positioning" field** (formerly "Hypothesis"): renamed to reflect professional ASO terminology. Label + contextual subtext updated in `optimizer-results-panel.tsx` and both i18n files. The data key `abTestVariant.hypothesis` is unchanged — only the user-facing label changed.

### 2. AI App Icon Generator (Brand Assets / Listing Optimizer)
Full two-page dialog (Configure → Pick & Download) powered by Runware FLUX.1 [dev].

- **FLUX.1 [dev]** (`runware:101@1`): 20 steps (25 with brand colour). Sharp vector-geometry output.
- **Compositional Intelligence prompt layer**: `STYLE_MODIFIERS` map (Looka tuning), `COMPOSITIONAL_RULES` (every request), dual-concept detector (`salt and sugar` → canvas split), universal negative prompt blocking photorealism/text artifacts.
- **Hex → natural language colour**: HSL→hue bucket→synonym cluster for FLUX conditioning. All 6 hue boundaries tuned (purple #7B1FA2 fix).
- **ECONNRESET retry**: 3 attempts, 55s timeout, 600ms/1200ms backoff.
- **Features**: Style chips (6 options), brand colour presets + custom picker, background toggle (solid/transparent), custom prompt textarea (Pro gate, 17 credits), 512×512 solid PNG with baked drop shadow.
- **Two-page layout**: Configure step → Pick & Download step with step bar.
- **Plan gates**: Free plan locks download (amber banner + Upgrade CTA). Custom prompt locked for free plan.
- **`AppIconGenerator`** shared component — single source of truth used in both Listing Optimizer dialog and Brand Assets page.

### 3. Brand Assets Module — Unified Creative Studio
Dedicated page at `/app/[workspaceId]/brand-assets` with Generate | My Vault top tabs.
Three native tabs: **App Icon** · **Banner** · **Screenshots**.
Screenshot Studio was merged into Brand Assets (no standalone nav item). `/screenshot-studio` redirects to `/brand-assets?tab=screenshot`.

#### App Icon Tab
- Renders `AppIconGenerator` inline.
- 15 credits per batch (4 variants).

#### Banner Tab (formerly "Feature Graphic")
- Generates 4 banners at 1024×576 (closest valid FLUX dimension pair to Play Store 1024×500).
- Style chips, brand colour, banner theme/mood, headline, subline.
- **Bake-at-download compositing**: App icon overlay + text overlay baked at export time. Preview shows clean raw AI image.
- 15 credits per batch.

#### Brand Kit CTA
- Generates icon batch + banner batch in parallel. 30 credits (15 + 15).

#### Screenshots Tab — Brand Mirror Engine
See full architecture details in Section 7 below.

#### My Vault
- Supabase Storage backed (`brand-assets` private bucket).
- `brand_assets` DB table covers `asset_type IN ('icon', 'banner', 'screenshot')`.
- Filter pills: All · Icons · Banners · Screenshots.
- `VaultGrid` uses React Query — auto-refreshes after generation via `queryClient.invalidateQueries`.
- `batchId` written into every asset's `meta` JSONB so the vault query can reconstruct the exact 4/6-image batch that was generated together (never mixes assets from different runs).

### 4. Reviews & Common Issues
- Gemini-powered Common Issues analysis (`reviews_issue_analysis`, 3 credits).
- Active Insights / History Archive tabbed UI. IssueCard grid with "Optimize All Insights" → LO queue.
- AI draft reply per review (1 credit).

### 5. Market Intelligence
- Category Top Charts: free ranked list.
- AI Keyword Spotlight (3 credits): Gemini analysis of top-10 chart titles.
- "Optimize with Market Spotlight" → stages keywords into LO queue.

### 6. Keyword Tracker
- Live Serper Google Preview per market (1 credit × country count).
- Rank snapshots, competitor dual-tracking.

### 7. Admin Dashboard
- Cost-per-user analytics, Provider COGS (Gemini vs Serper vs Runware), Credit Audit panel.

### 8. ASO Performance Attribution
- `listing_snapshots` captured after every generation.
- `ListingHistory` component with attribution view and Growth Tracking collapsible.

---

## Section 7 — Screenshot Studio: Brand Mirror Engine (Detailed)

This is the most complex subsystem. Read this section carefully before resuming work.

### 7.1 Architecture Overview — Composition-First Pipeline

```
User clicks "Generate 6 Screenshots"
        │
        ▼
POST /api/screenshot-studio/generate
  ├── Auth + credit check (20 credits debited synchronously)
  ├── Insert screenshot_jobs row (status = 'pending')
  ├── Return 202 { jobId }  ← client receives this immediately, no timeout risk
  └── after() schedules runBackground() ← runs after response is sent
              │
              ▼
        runBackground()
          ├── Tier 1: loadLatestListingHydrationForApp()
          │     Pull: title, shortDesc, features, screenshotCaptions,
          │           keywordSuggestions, strategySummary, ctaSuggestions
          │     Sets optimizedForConversion = true if listing exists
          │
          ├── generateScreenshotPack() — ONE Gemini call
          │     Output: 6 PackSlide objects (EN + AR copy per slide)
          │     Narrative arc: Value Hook → Feature×3 → Social Proof → CTA
          │     If listing data present: captions are constrained to match listing themes
          │
          ├── Promise.all(6) → generateScreenshotLayout() — 6 Gemini calls in parallel
          │     Output per slide: LayoutMap { backgroundPrompt, accentColor,
          │                       accentColorSecondary, textPosition, textColor,
          │                       backgroundMood, backgroundLuminance, uiMockDescription }
          │     backgroundPrompt = pure atmospheric background (NO device, NO text)
          │
          ├── callRunware() — ONE HTTP request batching all 6 image tasks
          │     Dimensions: 1024×1792 (multiples of 64, nearest valid 9:16)
          │     Output: 6 background image URLs (FLUX-generated, device-free)
          │
          ├── getAndroidFrameAndCache() — render SVG → PNG once, cache in-process
          │
          └── Promise.all(6) → composeScreenshot() + saveSlideToVault()
                For each slide:
                  1. Fetch raw FLUX blob from Runware CDN
                  2. composeScreenshot(rawBuffer, androidFrame, locale) via sharp:
                     - Scale bg to 1080×1920 (Lanczos3)
                     - RTL: flop() background, composite frame, flop() result back
                     - Overlay Pixel 9 Pro PNG frame at computed geometry
                  3. Save composed PNG to Supabase Storage
                  4. Update screenshot_jobs.slides[] + progress (client polls this)
```

### 7.2 Key Design Decision — Frameless AI Generation

**Decision**: AI (Runware FLUX) generates ONLY pure background art. The Android device frame is applied deterministically by `sharp` after generation, never by the AI model.

**Rationale**:
- FLUX's training data heavily associates "app screenshot" with iPhone frames — without explicit blocking it renders iPhone silhouettes ~80% of the time.
- Even with negative prompts, AI-generated frames have variable quality: inconsistent notch shape, wrong button positions, blurry bezels.
- A deterministic SVG→PNG frame (our Pixel 9 Pro asset) is pixel-perfect, consistent across all 6 slides, and guaranteed to be Android-only.
- The compositing step costs ~50ms per slide via `sharp` — negligible compared to Runware's 15-25s generation time.
- This architecture also enables future frame swapping (different device models) without touching the AI prompts.

**Implementation**:
- `lib/screenshot/android-frame.ts` — SVG source + `getAndroidFrameBuffer()` (cached in-process)
- `lib/screenshot/compose-screenshot.ts` — `composeScreenshot(bg, frame, locale)` + `isRTLLocale()`
- Frame is pre-fetched once per batch via `getAndroidFrameAndCache()`, then shared across all 6 parallel `composeScreenshot` calls

### 7.3 Pixel 9 Pro SVG Frame — Android Authenticity Markers

The frame SVG in `lib/screenshot/android-frame.ts` contains these explicit Android-vs-iOS differentiators:

| Feature | Our Frame | iPhone | Why It Matters |
|---|---|---|---|
| Front camera | **Pill punch-hole** | Circle (14) / Dynamic Island (15/16) | Pill = Android-exclusive visual signature |
| Bottom speakers | **Dual symmetric grilles + USB-C** | One asymmetric slot | Dual grilles = Android flagship signature |
| Volume buttons | **Two separate bars (Up/Down)** | Mute toggle + two buttons | Distinct Android button pattern |
| Port | **USB-C centred** | Lightning/USB-C (different position) | Combined with dual grilles = Android |
| Top | **Earpiece bar** | Face ID sensor array | No Face ID = not iPhone |

### 7.4 RTL Compositing Strategy

For Arabic locale (`isRTLLocale("ar") === true`):

1. **Background flip**: `sharp.flop()` horizontally mirrors the FLUX background before compositing. The AI generates backgrounds with active zone on the left (LTR default) — flip puts active zone on the right.
2. **Frame placement**: Frame is composited at the LEFT edge using standard `getFrameGeometry(isRTL: true)`.
3. **Result flip**: The entire composed image is `flop()`-ed back — net effect: device on left, brand content on right = correct RTL reading direction.
4. **Text**: Applied client-side at export time. `ctx.textAlign = "right"` and `textX` anchored to right edge of text zone. RTL is inferred from `useLocale()` — no user toggle.

### 7.5 Gemini Prompt Constraints — Background Generation

5 mandatory constraints enforced in `generateScreenshotLayout.ts` `backgroundPrompt` instruction:

1. **Zero hardware** — stated in EN + AR inline. Explains WHY (two overlapping frames = unusable).
2. **30% negative space** — Frame zone (`RIGHT` for LTR, `LEFT` for RTL) must stay clean and uncluttered. Active zone (opposite two-thirds) holds brand elements.
3. **Cohesive palette** — All 6 slides share the same brand hue family. Vary: gradient direction, shape density, light source. Keep constant: hue, saturation, overall tone.
4. **Professional aesthetic** — Reference brands: Notion, Calm, Duolingo, Robinhood, Linear, Headspace. Energy maps to slide role (Hero = boldest, CTA = confident).
5. **Explicit exclusions** — Terms hardcoded into `BASE_NEGATIVE` in the generate route, and also mentioned in the Gemini prompt so the positive description avoids them.

### 7.6 Runware Negative Prompt — Full Exclusion List

`BASE_NEGATIVE` in `app/api/screenshot-studio/generate/route.ts` covers:
- **Hardware**: phone, smartphone, iPhone, Apple iPhone, Android phone, device mockup, phone frame/outline/silhouette/shape, hardware, screen bezel, notch, dynamic island, home button, tablet, iPad, laptop, computer, monitor, gadget, hand holding phone
- **Text**: text, lettering, letters, words, fonts, typography, headline, caption, watermark, label, logotype, word mark, numbers, digits
- **UI elements**: UI chrome, app interface, app screenshot, interface mockup, icons, app icons, navigation bar, status bar, buttons
- **Composition violations**: centered busy composition, crowded layout, cluttered background, dense pattern covering full frame, objects in center of image, busy middle section
- **Aesthetic quality**: clip art, stock photo look, cheap gradient, rainbow gradient, neon explosion, garish colors, blurry, noisy, grainy, oversaturated, distorted, low quality
- **People**: portrait of person, realistic face, photorealistic human, hand, body part

Same list is mirrored in `app/api/screenshot-studio/render/route.ts` (`BASE_NEGATIVE_PROMPT`).

### 7.7 Listing Intelligence Sync

When an AI-optimized listing exists for the app:

```
Tier 1 fields pulled from listing_generations:
  output.title              → listingTitle
  output.shortDescription   → listingShortDesc
  appFeatures               → listingFeatures
  output.screenshotCaptions → up to 5 pre-optimized slot captions (MANDATORY constraints)
  output.keywordSuggestions → top 8 keywords (woven into copy)
  output.strategySummary    → strategic positioning theme (backbone of 6-slide arc)
  output.ctaSuggestions     → CTA themes (slide 6 reference)
```

The `generateScreenshotPack` prompt treats these as **mandatory constraints**, not suggestions. Slides 1–2 must lead with the same value proposition as the listing title. Keywords appear in ≥4 of 6 slides. `optimizedForConversion = true` triggers the "Synced with AI Listing" badge in the UI.

### 7.8 Async Job Pattern — No Timeout

`POST /api/screenshot-studio/generate` returns `202 { jobId }` in < 500ms.

Background work runs via `after()` (Next.js 15 built-in). Client polls `GET /api/screenshot-studio/job/[jobId]` every 2.5s. As each slide completes, `screenshot_jobs.slides[]` grows — client renders thumbnails incrementally with a progress bar (0/6 → 6/6). No external queue (no Upstash, no Inngest) needed.

**Resilience**: Credits are debited synchronously before the job is created. If `runBackground()` fails, `refundWorkspaceAiCredits()` is called and `screenshot_jobs.status = 'failed'`. Client polls detect the failure state and surface the error with the refund confirmation.

### 7.9 JSON Truncation Recovery

`generateScreenshotPack` had a hard `maxOutputTokens: 3500` that caused FLUX background prompts to be truncated mid-slide-6. Fixed:
- Raised to `maxOutputTokens: 6000` (6 slides × ~120 tokens each + overhead + Arabic copy = ~700-900 tokens total).
- Added `recoverPartialSlides(raw)` — depth-tracking brace scanner that extracts every complete `{...}` slide object from a truncated JSON string. If Gemini still truncates, whatever slides were fully emitted are recovered and padded. The job continues rather than hard-failing.

---

## Current File Structure — Brand Assets + Screenshot Studio

```
app/
├── [locale]/app/[workspaceId]/
│   ├── brand-assets/page.tsx           Server page — credits + plan SSR, client handles rest
│   └── screenshot-studio/page.tsx      Redirects to /brand-assets?tab=screenshot
│
app/api/
├── brand-assets/
│   ├── banner-generate/route.ts        POST — 15 credits, calls generateAppBanners()
│   ├── upload-url/route.ts             POST — signed Supabase Storage upload URL (15 MB limit)
│   ├── vault/route.ts                  GET  — lists icons/banners/screenshots with signed URLs
│   └── [assetId]/route.ts             DELETE — storage file + metadata row
│
└── screenshot-studio/
    ├── generate/route.ts               POST — 202 + jobId, runs runBackground() via after()
    ├── job/[jobId]/route.ts            GET  — polls job status, progress, slides[]
    ├── captions/route.ts               POST — legacy 3-credit caption endpoint (kept for compat)
    └── render/route.ts                 POST — legacy render endpoint (kept for compat)

lib/
├── screenshot/
│   ├── android-frame.ts               Pixel 9 Pro SVG → PNG via sharp (cached in-process)
│   └── compose-screenshot.ts          composeScreenshot() + isRTLLocale() + batch helper
├── gemini/
│   ├── generate-screenshot-pack.ts    6-slide narrative arc + listing intelligence sync
│   └── generate-screenshot-layout.ts  LayoutMap per slide (backgroundPrompt + compositor meta)
└── brand-assets/
    └── save-to-vault.ts               Client utility — fire-and-forget Supabase Storage upload

components/
├── brand-assets/
│   ├── BrandAssetsClient.tsx          3-tab unified studio + canvas compositor (bake-at-export)
│   └── VaultGrid.tsx                  React Query asset grid, filter: All/Icons/Banners/Screenshots
└── screenshot-studio/
    └── ScreenshotStudioClient.tsx     Legacy standalone client (kept, no longer nav-linked)

supabase/migrations/
├── 20260601100000_brand_assets_vault.sql    brand_assets table + bucket + RLS
└── 20260602100000_screenshot_jobs.sql       screenshot_jobs table + brand_assets constraint fix
```

---

## Credit Cost Reference (Current)

| Feature | Credits | Notes |
|---|---|---|
| AI Listing Generation | 5 | Full title/short/long/keywords/CTAs |
| Single field autofill | 3 | One field in optimizer |
| App Icon batch (basic) | 15 | 4 variants, FLUX.1 [dev] |
| App Icon batch (custom prompt) | 17 | Pro plan only |
| Banner batch | 15 | 4 variants, 1024×576 |
| Brand Kit (icon + banner) | 30 | 15 + 15 in parallel |
| Screenshot 6-pack | 20 | 6 composited 1080×1920 PNGs |
| Screenshot captions (legacy) | 3 | Fused into 20-credit action |
| AI keyword suggestion | 2 | Per keyword beyond free allowance |
| Serper rank preview | 1 | Per country |
| Review AI reply | 1 | Per review |
| Common Issues analysis | 3 | Per (workspace × app × lang) run |
| Market Keyword Spotlight | 3 | Per category+country |
| Marketplace scan | 1 | On-demand |

---

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Supabase Storage for all assets | No new infrastructure, RLS tied to auth, signed URLs built-in |
| FLUX.1 [dev] over schnell | 20-28 steps vs 4-6 — geometrically clean output for backgrounds and icons |
| 1024×1792 screenshot dimensions | Runware requires multiples of 64; 1080 and 1920 are not valid. 1024×1792 is the nearest valid 9:16 pair. Canvas compositor scales to 1080×1920 at export |
| Frameless AI generation | AI generates ONLY background art; Pixel 9 Pro frame applied by `sharp` server-side. Eliminates iPhone contamination (~80% of unconstrained generations), guarantees consistent Android branding across all slides |
| sharp for server-side compositing | Available in Next.js without extra deps; Lanczos3 scaling; lossless PNG; handles RTL via `flop()`; in-process frame buffer cache avoids repeat SVG renders |
| RTL via background flip, not frame flip | Frame is a symmetric device shape — flipping it looks identical. Flipping the BG puts brand content on the correct side for Arabic reading direction |
| Async job pattern (202 + polling) | 6-image generation takes 15-30s total; synchronous response would 502 on Vercel's 10s limit. `after()` + `screenshot_jobs` table + 2.5s client polling eliminates timeouts with zero external queue dependencies |
| Listing intelligence as mandatory constraints | Screenshots and store listing must tell the same story. If the LO has already determined the strategic theme and keywords, the screenshot copy must be semantically synchronized — not independently generated |
| batchId in vault meta | Allows vault query to reconstruct the exact N images from a single generation run, never mixing assets from different runs |
| AppIconGenerator as shared component | Single source of truth — one fix applies to both LO dialog and Brand Assets page |
| Client-side React Query for apps list | SSR-only caused 400s when app data was stale; client fetch mirrors ListingOptimizer pattern |

---

## Pending / Known Issues

### 🔴 Blocking

1. **Run Supabase migrations** — Both `20260601100000_brand_assets_vault.sql` and `20260602100000_screenshot_jobs.sql` must be applied via Supabase dashboard or `supabase db push`. Without these, vault saves return 500 and screenshot jobs cannot be created.

### 🟡 High Priority

2. **Brand Kit credits** — Still fires two independent API calls (15 + 15) rather than one atomic 30-credit ledger entry. If icon succeeds and banner fails, user is charged 15 instead of 30. Needs an atomic `brand_kit_generation` ledger entry.

3. **screenshot_jobs cleanup cron** — `screenshot_jobs` rows with `status = 'failed'` or `status = 'pending'` older than 24h should be purged. No cleanup job exists yet.

4. **sharp SVG rendering in Vercel edge** — `sharp` works in Node.js runtime but NOT in the Edge runtime. The generate route uses Node runtime (default for App Router route handlers) — this is fine. Do NOT convert this route to Edge runtime.

### 🟢 Backlog

5. **App selector search** — Plain `<select>` works for ≤10 apps; needs a searchable combobox for power users.

6. **Screenshot preview with text overlay** — The step 2 review screen shows raw FLUX backgrounds (no text/frame). Text + frame are baked at export. A lightweight canvas preview in-browser would close the "what will my export look like?" gap.

7. **Vault search + date filter** — Currently filter by asset type only.

8. **Google Play OAuth publish flow** — Routes exist but end-to-end flow needs QA.

9. **Phase 2: User UI screenshot upload** — Allow user to upload their own app screenshot; composite it inside the Pixel 9 Pro screen area (within the active display zone of the SVG frame). Zero Runware calls for this mode.
