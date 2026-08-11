/**
 * Builds the static public site into landingpage/dist.
 *
 * The shipped artefact stays plain HTML, CSS and JavaScript with no runtime
 * framework. This script exists only so the German and English pages can be
 * rendered from one set of templates and one content model instead of being
 * maintained as two hand-written documents.
 *
 * Output:
 *   dist/index.html      German, root locale (matches the current public site)
 *   dist/en/index.html   English
 *   dist/styles.css, dist/script.js, dist/assets/**
 *   dist/robots.txt, dist/sitemap.xml
 *
 * Usage: node landingpage/tools/build-site.mjs
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE, locales } from '../content/site.mjs';
import {
  ai,
  communication,
  finalCta,
  footer,
  header,
  hero,
  integrations,
  unified,
  vehicle,
  workflow,
} from '../src/sections.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const HERO_IMAGE = 'landing-hero-operations';
const OG_IMAGE = `${SITE.origin}/assets/${HERO_IMAGE}.webp`;

/** Both locales plus x-default, emitted identically on every page. */
function hreflangTags() {
  return [
    ...locales.map(
      (locale) =>
        `<link rel="alternate" hreflang="${locale.htmlLang}" href="${SITE.origin}${locale.dir}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${SITE.origin}/" />`,
  ];
}

/**
 * Organization data only. No aggregate ratings, offers or review markup, since
 * there is no verifiable public source for any of them.
 */
function structuredData(locale) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.brand,
    url: `${SITE.origin}${locale.dir}`,
    logo: `${SITE.origin}/assets/synqdrive-logo.png`,
    email: SITE.links.email,
    description: locale.meta.description,
  });
}

function document(locale) {
  const other = locales.find((candidate) => candidate.locale !== locale.locale);
  const canonical = `${SITE.origin}${locale.dir}`;

  const body = [
    header(locale, other),
    `<main id="main">`,
    hero(locale),
    unified(locale),
    vehicle(locale),
    ai(locale),
    workflow(locale),
    communication(locale),
    integrations(locale),
    finalCta(locale),
    `</main>`,
    footer(locale, SITE),
  ].join('\n    ');

  return `<!doctype html>
<html lang="${locale.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${locale.meta.title}</title>
    <meta name="description" content="${locale.meta.description}" />
    <meta name="theme-color" content="#ffffff" />
    <link rel="canonical" href="${canonical}" />
    ${hreflangTags().join('\n    ')}
    <link rel="icon" type="image/png" href="/assets/favicon.png" />
    <link rel="apple-touch-icon" href="/assets/favicon.png" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE.brand}" />
    <meta property="og:locale" content="${locale.ogLocale}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${locale.meta.ogTitle}" />
    <meta property="og:description" content="${locale.meta.ogDescription}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="2200" />
    <meta property="og:image:height" content="978" />
    <meta property="og:image:alt" content="${locale.hero.mediaAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${locale.meta.ogTitle}" />
    <meta name="twitter:description" content="${locale.meta.ogDescription}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />

    <link rel="preload" href="/assets/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link
      rel="preload"
      as="image"
      href="/assets/${HERO_IMAGE}.webp"
      imagesrcset="/assets/${HERO_IMAGE}-sm.webp 1100w, /assets/${HERO_IMAGE}.webp 2200w"
      imagesizes="(max-width: 900px) 92vw, 52vw"
      fetchpriority="high"
    />
    <link rel="stylesheet" href="/styles.css" />
    <script>
      /* Reveal styles apply only when scripting is available, so the page never
         stays blank without JavaScript. Setting the class here rather than in
         script.js avoids a flash of already-revealed content. The timer is the
         safety net for the one remaining case, script.js failing to arrive. */
      document.documentElement.classList.add('js');
      setTimeout(function () {
        if (document.documentElement.dataset.reveal === 'ready') return;
        document.documentElement.classList.remove('js');
      }, 2500);
    </script>
    <script type="application/ld+json">
      ${structuredData(locale)}
    </script>
  </head>
  <body>
    <a class="skip-link" href="#main">${locale.meta.skipLink}</a>
    ${body}
    <script src="/script.js" defer></script>
  </body>
</html>
`;
}

function robots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE.origin}/sitemap.xml
`;
}

function sitemap() {
  const urls = locales
    .map(
      (locale) => `  <url>
    <loc>${SITE.origin}${locale.dir}</loc>
    ${locales
      .map(
        (alt) =>
          `<xhtml:link rel="alternate" hreflang="${alt.htmlLang}" href="${SITE.origin}${alt.dir}" />`,
      )
      .join('\n    ')}
    <changefreq>monthly</changefreq>
    <priority>${locale.dir === '/' ? '1.0' : '0.8'}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const locale of locales) {
    const target = path.join(DIST, locale.dir, 'index.html');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, document(locale), 'utf8');
  }

  await cp(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
  await cp(path.join(SRC, 'script.js'), path.join(DIST, 'script.js'));
  await cp(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  await writeFile(path.join(DIST, 'robots.txt'), robots(), 'utf8');
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(), 'utf8');

  for (const locale of locales) {
    const html = await readFile(path.join(DIST, locale.dir, 'index.html'), 'utf8');
    const forbidden = html.match(/[\u2014\u2013]/g);
    if (forbidden) {
      throw new Error(`${locale.locale}: em dash or en dash found in output (${forbidden.length})`);
    }
    console.log(`${locale.locale.padEnd(3)} ${(html.length / 1024).toFixed(1)} kB html`);
  }
}

await main();
