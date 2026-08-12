# SynqDrive Landing Page

The public marketing site for SynqDrive, live at **<https://synqdrive.eu>** (German) and
**<https://synqdrive.eu/en/>** (English).

Static HTML, CSS and one 6 kB progressive-enhancement script. No framework runtime, no API calls,
no tracking. The site cannot reach tenant data, which is why it is kept out of the product
repository and away from the product's deployment path.

## Quick start

```bash
npm install
npx playwright install chromium   # once, for the QA suite
npm run build      # renders dist/
npm run serve      # serves dist/ on http://127.0.0.1:4321
npm run qa         # 11 QA checks against the local build (needs serve running)
```

`npm run assets` additionally needs `ffmpeg` on the PATH. A plain build does not.

## Layout

```
content/site.mjs        One content model per locale. All copy, links and media references.
src/sections.mjs        One template function per section.
src/primitives.mjs      productFrame, sectionHead, action, icon, HTML escaping.
src/styles.css          Design language, responsive rules, motion.
src/script.js           Progressive enhancement only. The page is complete without it.
src/icons.generated.mjs Lucide paths, generated. Do not edit by hand.
tools/build-site.mjs    Renders dist/, robots.txt and sitemap.xml for both locales.
tools/build-assets.mjs  Crops assets-raw/ into the shipped WebP variants. Needs ffmpeg.
tools/build-icons.mjs   Regenerates src/icons.generated.mjs from lucide-react.
assets/                 Shipped imagery, fonts, favicon, logo.
rollback/               Snapshot of the previous live site.
e2e/                    Playwright QA suite for the built output.
docs/IMPLEMENTATION.md  Full implementation report.
```

Both locales render from the same templates and the same content model, so they cannot drift.
German is canonical at `/`, English at `/en/`, with `hreflang` alternates and `x-default` on
German.

## Product screenshots come from the product repository

This is the one seam worth understanding. Every product visual is the **real SynqDrive frontend**,
captured against a synthetic demo tenant so that no personal or customer data ever reaches the
public site. That capture needs the product app running, so it lives in the SynqDrive product
repository, not here:

| Step | Where | What |
|------|-------|------|
| 1. Capture | product repo | `npm run landing:capture` in `frontend/` drives the real app against `e2e/landing-demo-tenant.ts` and writes raw PNGs |
| 2. Hand over | — | copy those PNGs into `assets-raw/` in this repo |
| 3. Crop and encode | here | `npm run assets` cuts each capture to the width it is rendered at and writes `assets/` |

Only step 3 lives here. `assets/` is committed, so a normal build needs neither the product repo
nor `assets-raw/`. You only need steps 1 and 2 when a screenshot should be re-taken.

Never replace these with screenshots of production data: the site is public, and the synthetic
tenant is what keeps it free of names, phone numbers, addresses, bookings and identifiers.

### Phone crops

A phone renders these visuals in a 356px column, so every one of them also has a `mobile` crop of
a compact region of the same capture. Without it a 616px-wide desktop panel arrives at 58% scale
and its 13px product text at 7px, which passes every layout check and still says nothing. Keep the
crop width close to the rendered column: `content/site.mjs` documents the intent, and
`tools/build-assets.mjs` carries the coordinates and the reasoning per crop.

One capture is not a desktop view. `fleet-command-narrow.png` is the Fleet list rendered at 430px,
because its rows cannot be narrowed by cropping without losing the condition and status badges on
the right edge. The product has its own narrow layout below 1024px, and the harness in the product
repo captures that. Prefer this route whenever the product reflows; check the result first, though,
since a narrow layout is not automatically the better picture. The Bookings plan was rejected on
exactly that basis.

## Deploy

`synqdrive.eu` is a Hostinger shared-hosting vhost. It is **not** the VPS, and it has nothing to
do with the product release. Deploying this site must never touch the `app.synqdrive.eu` DNS
records, the VPS release or application routing.

```bash
npm run build
npm run package    # writes synqdrive-landing-page.tar.gz from dist/
```

Then deploy that archive to the vhost whose domain is exactly `synqdrive.eu`, using the Hostinger
static website deployment API (`hosting_deployStaticWebsite`).

The archive must hold the files at **top level**, not nested inside a `dist/` folder, because the
deploy extracts it straight into the docroot. `npm run package` already does this correctly.

### After deploying

```bash
npm run qa:prod
```

Runs the same 11 checks against the live site. Also confirm the product surface was untouched:
`https://app.synqdrive.eu/api/v1/health` should still report `{"status":"ok"}` with an uptime that
predates the deploy.

## Rollback

`rollback/coming-soon-2026-08-11/` holds the complete previous site. Restoring it is the same
operation as deploying: archive that directory with its files at top level and push it to the
same vhost. Nothing else changes, so no DNS, certificate or proxy state has to be reverted.

## What the QA suite covers

Per locale: metadata and canonical tags, heading order, alt text and intrinsic dimensions on every
image, internal anchors and external hosts, lazy images resolving rather than 404ing, no element
left at its pre-reveal opacity, console errors, failed requests, horizontal overflow at nine widths
from 320 to 1920px, and touch target sizes. Plus the dropdown by pointer and keyboard, the mobile
drawer, the locale switch and cumulative layout shift.

Set `LANDING_QA_BASE_URL` to point the suite at any origin, and `LANDING_QA_LABEL` to keep its
screenshots separate from a local run.

## Conventions

Content changes belong in `content/site.mjs`, never in the templates. Every capability claim on
the page must be backed by shipped product code; `docs/IMPLEMENTATION.md` carries the claim matrix
and records what is deliberately left off the page. No invented metric, customer name, logo or
testimonial.
