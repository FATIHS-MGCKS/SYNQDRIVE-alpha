/**
 * Crops and encodes the raw product screenshots (landingpage/assets-raw) into the
 * WebP assets the landing page ships (landingpage/assets).
 *
 * Raw captures come from e2e/landing-assets.capture.spec.ts, rendered with
 * deviceScaleFactor 2, so every crop below is expressed in CSS pixels of the
 * captured viewport and doubled here.
 *
 * Usage: node landingpage/tools/build-assets.mjs
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'assets-raw');
const OUT = path.join(ROOT, 'assets');
const SCALE = 2;

/**
 * `crop` is in CSS pixels of the captured viewport: [x, y, width, height].
 * `width` is the final encoded pixel width (2x the rendered CSS width).
 * `pad` letterboxes the result onto a fixed canvas, used for the social card.
 * `variants` defaults to a full size plus a half size referenced through srcset.
 */
const TARGETS = [
  {
    // Sidebar plus the station summary. The notification column to the right is
    // left out on purpose: the hero places this beside a text column, where an
    // upright frame reads as a product surface and a letterbox strip does not.
    source: 'operations-dashboard.png',
    out: 'landing-hero-operations.webp',
    crop: [0, 64, 850, 596],
    width: 1700,
    quality: 90,
  },
  {
    // The plan card only. The filter row above it sits directly on top but has
    // empty date inputs, which reads as an unfinished form rather than a product.
    source: 'bookings-timeline.png',
    out: 'landing-unified-operations.webp',
    crop: [98, 221, 984, 729],
    width: 1968,
    quality: 88,
  },
  {
    // Phone crop of the same plan: the vehicle column, three days including the
    // current-day marker, and six rows. Cropping rather than scaling keeps the
    // plate and booking reference readable in a 350px column.
    source: 'bookings-timeline.png',
    out: 'landing-unified-operations-mobile.webp',
    crop: [98, 221, 478, 362],
    width: 956,
    quality: 90,
    variants: 'single',
  },
  {
    // The vehicle list panel only. Cropping to a single panel keeps the type
    // large enough to read where the page renders this beside a text column.
    // The height ends on a row boundary so the panel is never cut mid record,
    // and it covers all four condition states plus the filter counts.
    source: 'fleet-command.png',
    out: 'landing-connected-vehicle.webp',
    crop: [728, 126, 642, 496],
    width: 1284,
    quality: 90,
  },
  {
    // The two exchanges, without the assistant's left sidebar. The structured
    // answers and their source lines are the point of this section.
    source: 'ai-assistant.png',
    out: 'landing-ai-orchestration.webp',
    crop: [378, 118, 684, 722],
    width: 1368,
    quality: 90,
  },
  {
    source: 'workflow-automation.png',
    out: 'landing-workflow-automation.webp',
    crop: [88, 140, 1006, 638],
    width: 1900,
    quality: 86,
  },
  {
    // Phone crop of the same capture. The wide overview scaled to a 350px column
    // renders its labels at roughly 5px, so below 760px the page shows three
    // automations at legible size instead of the whole list unreadably small.
    source: 'workflow-automation.png',
    out: 'landing-workflow-automation-mobile.webp',
    crop: [88, 358, 452, 404],
    width: 904,
    quality: 90,
    variants: 'single',
  },
  {
    // Thread plus the operational context column, without the inbox list, so the
    // link between a message and its booking, vehicle, station and payment reads.
    source: 'customer-communication-inbox.png',
    out: 'landing-communications.webp',
    crop: [644, 245, 695, 655],
    width: 1390,
    quality: 90,
  },
  {
    // Social card. Fixed 1200x630 because that is what the sharing platforms
    // crop to, and JPEG because a few of them still do not decode WebP.
    source: 'operations-dashboard.png',
    out: 'landing-social-card.jpg',
    crop: [0, 64, 1400, 596],
    width: 1200,
    pad: [1200, 630],
    quality: 4,
    variants: 'single',
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const available = new Set(await readdir(RAW));

  for (const target of TARGETS) {
    if (!available.has(target.source)) {
      throw new Error(`missing raw capture: ${target.source}`);
    }
    const [x, y, w, h] = target.crop.map((value) => value * SCALE);
    // Narrow variant keeps phone payloads small; both are referenced via srcset.
    const variants =
      target.variants === 'single'
        ? [{ width: target.width, out: target.out }]
        : [
            { width: target.width, out: target.out },
            { width: Math.round(target.width / 2), out: target.out.replace('.webp', '-sm.webp') },
          ];
    const jpeg = target.out.endsWith('.jpg');

    for (const variant of variants) {
      const outPath = path.join(OUT, variant.out);
      const filters = [`crop=${w}:${h}:${x}:${y}`, `scale=${variant.width}:-1:flags=lanczos`];
      if (target.pad) {
        const [pw, ph] = target.pad;
        filters.push(`pad=${pw}:${ph}:(ow-iw)/2:(oh-ih)/2:white`);
      }

      await run('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        path.join(RAW, target.source),
        '-vf',
        filters.join(','),
        ...(jpeg
          ? ['-q:v', String(target.quality)]
          : ['-quality', String(target.quality), '-compression_level', '6']),
        outPath,
      ]);
      const { size } = await stat(outPath);
      const { stdout } = await run('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        outPath,
      ]);
      console.log(`${variant.out.padEnd(42)} ${stdout.trim().padEnd(12)} ${(size / 1024).toFixed(0)} kB`);
    }
  }
}

await main();
