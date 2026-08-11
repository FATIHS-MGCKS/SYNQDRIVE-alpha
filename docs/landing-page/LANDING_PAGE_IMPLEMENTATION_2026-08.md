# Public landing page — production implementation

**Date:** 2026-08-11
**Production URL:** <https://synqdrive.eu> (German), <https://synqdrive.eu/en/> (English)
**Branch:** `cursor/synqdrive-landing-page-c50c`

## Starting point

`synqdrive.eu` served a single-page German "coming soon" placeholder from Hostinger shared
hosting: `index.html`, `styles.css`, `script.js` and two images, 88 kB in total, with no source
in this repository. `app.synqdrive.eu` is a separate host (the VPS) and was not touched.

The product frontend (`frontend/`) is an authenticated Vite + React SPA served from
`backend/public`. It has no public marketing route, so the marketing surface was built as its
own artefact rather than bolted onto the product app.

## References and skills

- Seven reference images supplied with the brief, used for structure, information hierarchy,
  copy-to-visual ratio and section rhythm. Their placeholder dashboards were not used as assets.
- SynqDrive Books I to IV plus the modules in `backend/src/modules` and `frontend/src/rental`
  as the factual source for every capability claim.
- `.agents/skills/design-taste-frontend`, `.agents/skills/image-to-code`,
  `.agents/skills/minimalist-ui`, `.agents/skills/make-interfaces-feel-better`.
  Dials: design variance 4, motion intensity 3, visual density 3.
- Where `minimalist-ui` conflicted with the brand and the reference images (editorial serif,
  warm monochrome palette) the brand won. Its structural rules were kept: hairline 1px borders,
  near-zero shadows, black primary action, macro whitespace, reveal on scroll.

## Architecture

```
landingpage/
  content/site.mjs        one content model per locale, all copy and media references
  src/sections.mjs        section templates, one function per section
  src/primitives.mjs      productFrame, sectionHead, action, escaping
  src/styles.css          design language, responsive rules, motion
  src/script.js           progressive enhancement only
  src/icons.generated.mjs Lucide paths inlined by tools/build-icons.mjs
  tools/build-site.mjs    renders dist/index.html and dist/en/index.html
  tools/build-assets.mjs  crops and encodes the product screenshots
  assets/                 shipped WebP, fonts, favicon, logo
  rollback/               snapshot of the previous live site
```

The shipped artefact is static HTML, CSS and one 6 kB script. Both locales render from the same
templates and the same content model, so they cannot drift. The page carries no framework
runtime, which is why the product's React components could not be reused directly; the visual
language, the brand tokens and the icon set are shared instead, and the icons are extracted from
the `lucide-react` dependency the product already uses.

### Sections

| # | Section | Composition | Product visual |
|---|---------|-------------|----------------|
| 01 | Hero | Text column beside an upright frame | Operations dashboard |
| 02 | One system for the entire operation | Header beside a 2x2 capability grid, full width frame below | Booking plan across the fleet |
| 03 | Connected vehicle intelligence | One composed panel holding frame and notes | Fleet list with condition and telemetry freshness |
| 04 | AI orchestration | Mirrored split, flow rail under the text | Assistant answers with named sources |
| 05 | Workflow automation | Stacked, chain band above a full width frame | Active automations with trigger, risk class, last run |
| 06 | Connected customer communication | Text column with notes beside a frame | Conversation beside its operational context |
| 07 | Integration and extension | Centred capability hub diagram | Hub diagram, no provider wall |

A closing call to action and a compact footer follow. Every composition differs on purpose, so
the page does not read as six repeated text-beside-screenshot rows.

### Navigation

Platform (dropdown: Overview, Connected vehicle intelligence, AI and automation, Integrations),
Contact, then the locale switch, Log in and Book a demo. Pricing, Solutions and Resources were
left out because no page behind them exists yet and the brief forbids dead links; the four
Platform entries are the four anchors that do exist. Mobile uses a drawer.

### Language

The product ships German and English, and the previous public site was German only, so German
stays at `/` as the canonical root and English is served from `/en/`, with `hreflang` alternates
and `x-default` pointing at German. No hardcoded second implementation: both pages are rendered
from `content/site.mjs`.

## Screenshot sources and privacy

Every product visual is the real SynqDrive frontend, captured by
`frontend/e2e/landing-assets.capture.spec.ts` at device scale factor 2 against one synthetic
demo tenant defined in `frontend/e2e/landing-demo-tenant.ts`.

No production database, tenant or API was involved, so no name, phone number, email address,
address, booking, invoice or identifier visible on the page belongs to a real person or
organisation. Nothing is pixel-censored, because the data never existed outside the fixture.

`tools/build-assets.mjs` crops each capture against the width it is actually rendered at, so the
type stays legible rather than being scaled into noise:

| Asset | Crop intent |
|-------|-------------|
| `landing-hero-operations` | Sidebar plus station summary, upright for the hero split |
| `landing-unified-operations` | The plan card only, without the empty filter row |
| `landing-connected-vehicle` | Vehicle list ending on a row boundary, all four condition states |
| `landing-ai-orchestration` | Two exchanges without the assistant sidebar |
| `landing-workflow-automation` | Workflow overview with counts and run results |
| `landing-communications` | Thread plus operational context, without the inbox list |
| `landing-social-card` | Fixed 1200x630 JPEG for sharing platforms |

The fleet plan and the workflow list are the two captures that cannot survive a phone column.
Below 760px they switch through a `<picture>` element to `*-mobile.webp`, a tighter crop of the
same screenshot. Width and height are emitted on the `<source>` as well as the `<img>`, so the
art-direction switch does not cost layout stability.

## Responsive

Verified at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920px in both locales: no horizontal
overflow, no clipped panels, headlines wrap cleanly, and every product visual stays readable.

Notable adjustments: the section 02 fleet plan runs full width rather than in a split; the
vehicle panel is never CSS-clipped because the asset already ends on a row boundary; the primary
action leaves the masthead below 480px, where it is still reachable in the drawer, the hero and
the closing section; section titles use a `clamp` low bound that fits German compound words such
as "Kundenkommunikation" at 320px.

## Accessibility

Semantic sectioning with one `h1` and no skipped heading level, skip link, visible focus states,
`aria-expanded` on the dropdown and drawer triggers, alt text on every image, touch targets at
32px or larger at 375px, and `prefers-reduced-motion` handled with a specificity that outweighs
the reveal state so the enter transform never applies at all. The page is fully readable with
JavaScript disabled: the reveal styles are scoped to a `.js` class set inline in the head, with a
timer that removes it again if `script.js` never arrives.

## Performance

984 kB total for the whole site, of which 640 kB is imagery across nine WebP files plus one
JPEG. No framework, no animation library, one 6 kB script. The hero image is preloaded and
eagerly decoded, everything below the fold is lazy. Fonts are self-hosted WebFont subsets and
preloaded. Cumulative layout shift measured under 0.1 because every image carries intrinsic
dimensions.

## SEO

Title, description, canonical, `hreflang` for both locales plus `x-default`, OpenGraph and
Twitter card with a fixed 1200x630 JPEG, favicon and apple touch icon, `robots.txt`,
`sitemap.xml` with locale alternates, and `Organization` structured data. No aggregate rating,
offer or review markup, because there is no verifiable public source for any of it. No invented
metric, customer name, logo or testimonial appears anywhere on the page.

## Tests

| Gate | Result |
|------|--------|
| `npx tsc -b` (frontend) | pass |
| `eslint` on the landing files | pass |
| `npm run lint` (frontend) | 16 pre-existing errors, all in `legal-documents` and `document-upload` files this branch does not touch |
| `npm test` (frontend) | 2235 pass, 7 pre-existing failures in `fleet-health-service`, unchanged by this branch |
| `npm run build` (frontend) | pass |
| `npm run landing:qa` | 11 pass, locally and against production |

The pre-existing failures are in files that are byte-identical to `main` on this branch
(`git diff --name-only origin/main...HEAD -- frontend/src` is empty), so they are not caused by
this work and are not masked by it.

`frontend/e2e/landing-page-qa.spec.ts` covers, per locale: metadata and canonical tags, heading
order, alt text and intrinsic dimensions on every image, internal anchors and external hosts,
lazy images resolving rather than 404ing, no element left at its pre-reveal opacity, console
errors, failed requests, horizontal overflow at nine widths, and touch target sizes. Plus the
dropdown by pointer and keyboard, the mobile drawer, the locale switch and cumulative layout
shift.

## Deployment

`synqdrive.eu` is a main vhost on Hostinger shared hosting (LiteSpeed, hPanel), docroot
`/home/u700268787/domains/synqdrive.eu/public_html`. It is not on the VPS, so the VPS release
script in `.cursor/scripts/cloud-agent-deploy.sh` does not apply and was not used.

```bash
node landingpage/tools/build-assets.mjs   # only when re-cropping captures
node landingpage/tools/build-site.mjs     # writes landingpage/dist
# archive the contents of landingpage/dist at top level, then deploy it to the
# synqdrive.eu vhost with the Hostinger static website deploy endpoint
```

DNS, nameservers, the HTTP to HTTPS redirect and the Let's Encrypt certificate were left
untouched. The deploy replaces the docroot: the two placeholder images now return 404, which
confirms it is a replacement rather than a merge.

`www.synqdrive.eu` still answers 200 from the same docroot rather than redirecting to the apex.
That behaviour predates this work; duplicate content is handled by the canonical tag. Adding a
redirect would mean changing working hosting configuration and was left alone.

## Rollback

`landingpage/rollback/coming-soon-2026-08-11/` holds the complete previous site, captured from
production immediately before the deploy. Restoring it is the same operation as deploying:
archive that directory and push it to the `synqdrive.eu` vhost. Nothing else changed, so no DNS,
certificate or proxy state has to be reverted.

Commit deployed: `6a094128`.

## Acceptance

Checked live on <https://synqdrive.eu>: 200 on the apex and on `/en/`, `/en` redirecting to
`/en/`, HTTP redirecting to HTTPS, a valid certificate, `robots.txt` and `sitemap.xml` served
with the right content types, and every asset returning 200 with the correct MIME type including
WebP, WOFF2 and JPEG.

The QA suite was then run against `https://synqdrive.eu` and passed all 11 tests, so the live
site has no console errors, no failed requests, no image 404s, no horizontal overflow at any of
the nine widths and cumulative layout shift under 0.1. The production desktop and mobile
screenshots are byte-identical to the locally approved build.

## Known remaining points

- Pricing, Solutions and Resources navigation entries are deferred until pages exist behind them.
- Both calls to action open a prefilled mail draft to `info@synqdrive.eu`, which is the only
  contact channel the product exposes today. A demo request form would be a separate change.
- `www.synqdrive.eu` does not redirect to the apex, as above.
- The seven WebP assets are regenerated from `landingpage/assets-raw`, which is not committed.
  Re-run `npm run landing:capture` in `frontend/` to recreate the raw captures.
