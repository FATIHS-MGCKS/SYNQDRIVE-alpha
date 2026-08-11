# Changes & Architektur — Public landing page on synqdrive.eu (2026-08-11)

## Changes

- **Added** `landingpage/content/site.mjs` — one content model per locale (de, en). All public
  copy, navigation, links and media references live here; both rendered pages read from it.
- **Added** `landingpage/src/sections.mjs` — one template function per section (hero, platform,
  vehicle intelligence, AI orchestration, workflow automation, communication, integrations,
  closing call to action, masthead, footer).
- **Added** `landingpage/src/primitives.mjs` — `productFrame`, `sectionHead`, `action`, `icon`
  and HTML escaping. `productFrame` emits a `<picture>` when the media carries a `mobile` variant.
- **Added** `landingpage/src/styles.css` — the design language: brand tokens, section rhythm,
  responsive rules from 320px to 1920px, reveal motion, reduced-motion handling.
- **Added** `landingpage/src/script.js` — progressive enhancement only (sticky masthead,
  dropdown, drawer, `IntersectionObserver` reveals). The page is complete without it.
- **Added** `landingpage/tools/build-site.mjs` — renders `dist/index.html`, `dist/en/index.html`,
  `robots.txt` and `sitemap.xml`; copies assets; injects metadata and structured data.
- **Added** `landingpage/tools/build-assets.mjs` — crops raw captures and encodes the shipped
  WebP variants plus the fixed 1200x630 JPEG social card via `ffmpeg`.
- **Added** `landingpage/tools/build-icons.mjs` + `landingpage/src/icons.generated.mjs` —
  extracts Lucide paths from the `lucide-react` dependency the product already uses, so the
  static page shares the product icon set without a React runtime.
- **Added** `landingpage/rollback/coming-soon-2026-08-11/` — the complete previous live site,
  captured from production immediately before the deploy.
- **Added** `frontend/e2e/landing-assets.capture.spec.ts` +
  `frontend/e2e/landing-demo-tenant.ts` + `frontend/e2e/playwright.landing-assets.config.ts` —
  captures the product visuals from the real frontend against a synthetic demo tenant.
- **Added** `frontend/e2e/landing-page-qa.spec.ts` +
  `frontend/e2e/playwright.landing-qa.config.ts` — the landing QA suite, retargetable at a
  deployed origin through `LANDING_QA_BASE_URL`.
- **Added** `frontend/package.json` scripts: `landing:capture`, `landing:assets`,
  `landing:icons`, `landing:build`, `landing:serve`, `landing:qa`.
- **Added** `docs/landing-page/LANDING_PAGE_IMPLEMENTATION_2026-08.md` — implementation report.
- `.gitignore` — ignores `landingpage/dist/` and `landingpage/qa/` (build and QA output).
- Copy correction after a capability audit: the voice assistant no longer appears beside
  WhatsApp, email and notifications as a generally available channel. Live PSTN is per-tenant
  flag-gated and staging-first (`docs/runbooks/voice-ai-production-release.md`), so both locales
  now state that it is being rolled out per organisation.
- `frontend/e2e/landing-page-qa.spec.ts` waits for every image to decode before screenshotting.
  Against a deployed origin a lazy image could still be in flight when the shutter fired, so the
  suite passed while emitting an artefact that showed an empty frame on a correct page.
- No product code changed. `git diff --name-only origin/main...HEAD -- frontend/src backend/`
  is empty: the product was opened for screenshots, never rebuilt for the landing page.

## Architektur (runtime / data-flow deltas)

- **Public marketing surface is a separate artefact.** `synqdrive.eu` serves static HTML, CSS and
  one 6 kB script built by `landingpage/tools/build-site.mjs`. It carries no framework runtime and
  makes no API call, so the public page cannot reach tenant data and cannot break the product.
- **Hosting boundary unchanged.** `synqdrive.eu` stays a Hostinger shared-hosting vhost
  (LiteSpeed, docroot `/home/u700268787/domains/synqdrive.eu/public_html`); `app.synqdrive.eu`
  stays the VPS product deploy. The VPS release path
  (`.cursor/scripts/cloud-agent-deploy.sh` → `vps-deploy-release.sh` → PM2) does **not** cover
  the marketing site and was not used. DNS, nameservers, the HTTP to HTTPS redirect and the
  Let's Encrypt certificate were untouched.
- **Marketing deploy path:** `build-assets.mjs` (only when re-cropping) → `build-site.mjs` →
  archive of `landingpage/dist` contents at top level → Hostinger static website deploy endpoint
  targeting the `synqdrive.eu` vhost. The deploy replaces the docroot rather than merging into it.
- **Rollback path:** archive `landingpage/rollback/coming-soon-2026-08-11/` and push it to the
  same vhost. Symmetric with the deploy; no DNS, certificate or proxy state to revert.
- **Locale routing:** German is canonical at `/`, English at `/en/`, with `hreflang` alternates
  and `x-default` on German. Both are rendered from one content model, so the locales cannot
  drift; there is no runtime locale negotiation on the public page.
- **Product visual pipeline:** `landing-demo-tenant.ts` installs route handlers over the existing
  e2e fixtures, so `landing-assets.capture.spec.ts` drives the real product UI against synthetic
  data. No production database, tenant or API is involved, which is what keeps personal data off
  the public page without pixel censorship. Raw captures land in `landingpage/assets-raw`
  (uncommitted); `build-assets.mjs` is the only step that writes shipped imagery.
- **Design system boundary:** the brand tokens and the Lucide icon set are shared with the
  product (icons generated from `lucide-react`), while layout primitives are local to
  `landingpage/src`. No second source of truth for brand colour or type.
- **Contact flow:** both calls to action open a prefilled mail draft to `info@synqdrive.eu`, the
  only contact channel the product exposes today. No new CRM or form backend was introduced.

## Notes

- External "Synqdrive Code → Changes / Architektur" workspace is outside this repo;
  this file is the in-repo record.
- Navigation deliberately ships fewer entries than the brief's target (Platform + Contact, no
  Pricing/Solutions/Resources) because no page exists behind those labels and the brief forbids
  dead links.
