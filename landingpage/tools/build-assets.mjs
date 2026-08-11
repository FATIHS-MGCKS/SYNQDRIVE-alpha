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
 */
const TARGETS = [
  {
    source: 'operations-dashboard.png',
    out: 'landing-hero-operations.webp',
    crop: [0, 0, 1440, 640],
    width: 2200,
    quality: 88,
  },
  {
    source: 'bookings-timeline.png',
    out: 'landing-unified-operations.webp',
    crop: [98, 170, 984, 785],
    width: 1900,
    quality: 86,
  },
  {
    source: 'fleet-command.png',
    out: 'landing-connected-vehicle.webp',
    crop: [592, 130, 490, 648],
    width: 980,
    quality: 90,
  },
  {
    source: 'ai-assistant.png',
    out: 'landing-ai-orchestration.webp',
    crop: [0, 52, 1180, 768],
    width: 1900,
    quality: 86,
  },
  {
    source: 'workflow-automation.png',
    out: 'landing-workflow-automation.webp',
    crop: [88, 140, 1006, 638],
    width: 1900,
    quality: 86,
  },
  {
    source: 'customer-communication-inbox.png',
    out: 'landing-communications.webp',
    crop: [355, 178, 990, 715],
    width: 1900,
    quality: 86,
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
    const variants = [
      { width: target.width, out: target.out },
      { width: Math.round(target.width / 2), out: target.out.replace('.webp', '-sm.webp') },
    ];

    for (const variant of variants) {
      const outPath = path.join(OUT, variant.out);
      await run('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        path.join(RAW, target.source),
        '-vf',
        `crop=${w}:${h}:${x}:${y},scale=${variant.width}:-1:flags=lanczos`,
        '-quality',
        String(target.quality),
        '-compression_level',
        '6',
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
