/**
 * Markup primitives shared by every landing page section.
 *
 * Kept deliberately small: the page ships as static HTML, so these are string
 * builders rather than components. Escaping is centralised here.
 */
import { icon } from './icons.generated.mjs';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes interpolated content. Applied to every value coming from content/. */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function iconMark(name) {
  return `<span class="icon-mark">${icon(name)}</span>`;
}

/**
 * Responsive product screenshot inside a bordered frame.
 *
 * Width and height are always emitted, on the source as well as the image, so
 * the browser reserves the correct box before the image arrives and CLS stays
 * at zero across the art-direction switch.
 *
 * `media.mobile` is optional and carries a tighter crop of the same capture for
 * narrow viewports, used where the wide crop would scale below legibility.
 */
export function productFrame({ media, alt, sizes, priority = false, frameClass = '' }) {
  const { file, width, height, mobile } = media;
  const loading = priority
    ? 'loading="eager" decoding="sync" fetchpriority="high"'
    : 'loading="lazy" decoding="async"';

  const classes = ['frame', frameClass].filter(Boolean).join(' ');

  const img = `<img
          src="/assets/${file}.webp"
          srcset="/assets/${file}-sm.webp ${Math.round(width / 2)}w, /assets/${file}.webp ${width}w"
          sizes="${sizes}"
          width="${width}"
          height="${height}"
          alt="${esc(alt)}"
          ${loading}
        />`;

  const picture = mobile
    ? `<picture>
        <source
          media="(max-width: 760px)"
          srcset="/assets/${mobile.file}.webp"
          width="${mobile.width}"
          height="${mobile.height}"
        />
        ${img}
      </picture>`
    : img;

  return `<div class="${classes}">
        ${picture}
      </div>`;
}

/**
 * Section header. Eyebrow use is rationed across the page, so it is opt-in.
 * Each child reveals on its own so enter motion is staggered rather than one
 * block sliding in.
 */
export function sectionHead({ eyebrow, title, body, id, level = 2, className = '' }) {
  const classes = ['section-head', className].filter(Boolean).join(' ');
  return `<div class="${classes}">
        ${eyebrow ? `<p class="eyebrow" data-reveal>${esc(eyebrow)}</p>` : ''}
        <h${level} class="section-title" id="${id}-title" data-reveal>${esc(title)}</h${level}>
        ${body ? `<p class="section-body" data-reveal>${esc(body)}</p>` : ''}
      </div>`;
}

export function action({ href, label, variant, external = false }) {
  const rel = external ? ' rel="noopener"' : '';
  const arrow = variant === 'secondary' ? `<span class="action__arrow">${icon('arrow-right')}</span>` : '';
  return `<a class="action action--${variant}" href="${href}"${rel}>${esc(label)}${arrow}</a>`;
}
