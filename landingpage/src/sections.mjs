/**
 * Section templates for the public SynqDrive landing page.
 *
 * Seven content sections plus a closing call to action, in the order the page
 * renders them. Each section deliberately uses a different composition so the
 * page does not read as six repeated text-beside-screenshot rows:
 *
 *   hero            text column beside a wide product frame that bleeds right
 *   unified         text plus a 2x2 capability grid beside a product frame
 *   vehicle         one composed panel holding the product frame and its notes
 *   ai              mirrored split, product frame first, flow rail under text
 *   workflow        stacked, full width chain band above a full width frame
 *   communication   text column with notes beside a product frame
 *   integrations    centred capability hub
 */
import { icon } from './icons.generated.mjs';
import { action, esc, iconMark, productFrame, sectionHead } from './primitives.mjs';

export function header(c, other) {
  const platformItems = c.nav.platformItems
    .map((item) => `<li><a href="${item.href}">${esc(item.label)}</a></li>`)
    .join('');

  return `<header class="masthead" data-masthead>
      <div class="masthead__inner">
        <a class="brand" href="${c.dir}" aria-label="${esc(c.nav.home)}">
          <img src="/assets/synqdrive-logo.png" width="1024" height="216" alt="SynqDrive" />
        </a>

        <nav class="mainnav" aria-label="${esc(c.nav.platform)}">
          <div class="mainnav__group" data-dropdown>
            <button
              type="button"
              class="mainnav__trigger"
              aria-expanded="false"
              aria-controls="platform-menu"
              data-dropdown-trigger
            >
              ${esc(c.nav.platform)}
              <span class="mainnav__chevron">${icon('chevron-down')}</span>
            </button>
            <ul class="mainnav__menu" id="platform-menu" data-dropdown-menu>
              ${platformItems}
            </ul>
          </div>
          <a class="mainnav__link" href="${c.nav.contactHref}">${esc(c.nav.contact)}</a>
        </nav>

        <div class="masthead__actions">
          <a
            class="locale-switch"
            href="${other.dir}"
            hreflang="${other.htmlLang}"
            lang="${other.htmlLang}"
            aria-label="${esc(c.meta.localeSwitchLabel)}: ${esc(other.meta.localeName)}"
          >
            ${icon('globe')}<span>${esc(other.htmlLang.toUpperCase())}</span>
          </a>
          <a class="masthead__login" href="https://app.synqdrive.eu" rel="noopener">${esc(c.nav.login)}</a>
          ${action({ href: 'mailto:info@synqdrive.eu?subject=SynqDrive%20demo%20request', label: c.nav.demo, variant: 'primary' })}
          <button
            type="button"
            class="masthead__toggle"
            aria-expanded="false"
            aria-controls="mobile-nav"
            data-nav-toggle
            data-label-open="${esc(c.nav.openMenu)}"
            data-label-close="${esc(c.nav.closeMenu)}"
            aria-label="${esc(c.nav.openMenu)}"
          >
            <span class="masthead__toggle-open">${icon('menu')}</span>
            <span class="masthead__toggle-close">${icon('x')}</span>
          </button>
        </div>
      </div>

      <div class="drawer" id="mobile-nav" data-nav-panel hidden>
        <ul class="drawer__list">
          ${platformItems}
          <li><a href="${c.nav.contactHref}">${esc(c.nav.contact)}</a></li>
        </ul>
        <div class="drawer__actions">
          <a class="action action--ghost" href="https://app.synqdrive.eu" rel="noopener">${esc(c.nav.login)}</a>
          ${action({ href: 'mailto:info@synqdrive.eu?subject=SynqDrive%20demo%20request', label: c.nav.demo, variant: 'primary' })}
          <a class="drawer__locale" href="${other.dir}" hreflang="${other.htmlLang}" lang="${other.htmlLang}">
            ${icon('globe')}<span>${esc(other.meta.localeName)}</span>
          </a>
        </div>
      </div>
    </header>`;
}

export function hero(c) {
  const h = c.hero;
  return `<section class="hero" aria-labelledby="hero-title">
      <div class="hero__copy">
        <p class="eyebrow" data-reveal>${esc(h.eyebrow)}</p>
        <h1 id="hero-title" data-reveal>${esc(h.title)}</h1>
        <p class="hero__body" data-reveal>${esc(h.body)}</p>
        <div class="hero__actions" data-reveal>
          ${action({ href: 'mailto:info@synqdrive.eu?subject=SynqDrive%20demo%20request', label: h.primary, variant: 'primary' })}
          ${action({ href: `#${c.unified.id}`, label: h.secondary, variant: 'secondary' })}
        </div>
      </div>
      <div class="hero__media" data-reveal>
        ${productFrame({
          media: h.media,
          alt: h.mediaAlt,
          priority: true,
          sizes: '(max-width: 900px) 92vw, 52vw',
        })}
      </div>
    </section>`;
}

export function unified(c) {
  const s = c.unified;
  const cards = s.cards
    .map(
      (card) => `<li class="capability" data-reveal>
            ${iconMark(card.icon)}
            <h3>${esc(card.title)}</h3>
            <p>${esc(card.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section split" id="${s.id}" aria-labelledby="${s.id}-title">
      <div class="split__copy">
        ${sectionHead({ eyebrow: s.eyebrow, title: s.title, body: s.body, id: s.id })}
        <ul class="capability-grid">${cards}</ul>
      </div>
      <div class="split__media" data-reveal>
        ${productFrame({ media: s.media, alt: s.mediaAlt, sizes: '(max-width: 900px) 92vw, 46vw' })}
      </div>
    </section>`;
}

export function vehicle(c) {
  const s = c.vehicle;
  const notes = s.points
    .map(
      (point) => `<li>
            <h3>${esc(point.title)}</h3>
            <p>${esc(point.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section stage" id="${s.id}" aria-labelledby="${s.id}-title">
      ${sectionHead({
        eyebrow: s.eyebrow,
        title: s.title,
        body: s.body,
        id: s.id,
        className: 'section-head--centered',
      })}
      <div class="stage__panel" data-reveal>
        <div class="stage__media">
          ${productFrame({
            media: s.media,
            alt: s.mediaAlt,
            sizes: '(max-width: 900px) 88vw, 38vw',
            frameClass: 'frame--flush',
          })}
        </div>
        <ul class="stage__notes">${notes}</ul>
      </div>
    </section>`;
}

export function ai(c) {
  const s = c.ai;
  const steps = s.flow
    .map(
      (step) => `<li class="flow__step">
            <h3>${esc(step.title)}</h3>
            <p>${esc(step.body)}</p>
          </li>`,
    )
    .join('');
  const governance = s.governance
    .map(
      (item) => `<li>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section split split--mirror" id="${s.id}" aria-labelledby="${s.id}-title">
      <div class="split__media" data-reveal>
        ${productFrame({ media: s.media, alt: s.mediaAlt, sizes: '(max-width: 900px) 92vw, 48vw' })}
      </div>
      <div class="split__copy">
        ${sectionHead({ eyebrow: s.eyebrow, title: s.title, body: s.body, id: s.id })}
        <div class="flow" data-reveal>
          <p class="flow__label">${esc(s.flowLabel)}</p>
          <ol class="flow__list">${steps}</ol>
        </div>
        <ul class="notes" data-reveal>${governance}</ul>
      </div>
    </section>`;
}

export function workflow(c) {
  const s = c.workflow;
  const chain = s.chain
    .map(
      (link) => `<li class="chain__link" data-reveal>
            <h3>${esc(link.title)}</h3>
            <p>${esc(link.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section stack" id="${s.id}" aria-labelledby="${s.id}-title">
      ${sectionHead({ eyebrow: s.eyebrow, title: s.title, body: s.body, id: s.id })}
      <div class="chain">
        <p class="chain__label">${esc(s.chainLabel)}</p>
        <ol class="chain__list">${chain}</ol>
      </div>
      <div class="stack__media" data-reveal>
        ${productFrame({ media: s.media, alt: s.mediaAlt, sizes: '(max-width: 900px) 92vw, 88vw' })}
      </div>
    </section>`;
}

export function communication(c) {
  const s = c.communication;
  const points = s.points
    .map(
      (point) => `<li>
            <h3>${esc(point.title)}</h3>
            <p>${esc(point.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section split" id="${s.id}" aria-labelledby="${s.id}-title">
      <div class="split__copy">
        ${sectionHead({ eyebrow: s.eyebrow, title: s.title, body: s.body, id: s.id })}
        <ul class="notes notes--divided" data-reveal>${points}</ul>
      </div>
      <div class="split__media" data-reveal>
        ${productFrame({ media: s.media, alt: s.mediaAlt, sizes: '(max-width: 900px) 92vw, 48vw' })}
      </div>
    </section>`;
}

export function integrations(c) {
  const s = c.integrations;
  const tiles = s.tiles
    .map(
      (tile) => `<li class="hub__tile" data-reveal>
            ${iconMark(tile.icon)}
            <h3>${esc(tile.title)}</h3>
            <p>${esc(tile.body)}</p>
          </li>`,
    )
    .join('');

  return `<section class="section hub" id="${s.id}" aria-labelledby="${s.id}-title">
      ${sectionHead({
        eyebrow: s.eyebrow,
        title: s.title,
        body: s.body,
        id: s.id,
        className: 'section-head--centered',
      })}
      <div class="hub__grid">
        <ul class="hub__tiles">${tiles}</ul>
        <p class="hub__core" aria-hidden="true"><span>SynqDrive</span></p>
      </div>
      <p class="hub__note">${esc(s.note)}</p>
    </section>`;
}

export function finalCta(c) {
  const s = c.cta;
  return `<section class="closing" id="${s.id}" aria-labelledby="${s.id}-title">
      <div class="closing__inner" data-reveal>
        <h2 id="${s.id}-title">${esc(s.title)}</h2>
        <p>${esc(s.body)}</p>
        <div class="closing__actions">
          ${action({ href: 'mailto:info@synqdrive.eu?subject=SynqDrive%20demo%20request', label: s.primary, variant: 'primary' })}
          <a class="action action--ghost" href="https://app.synqdrive.eu" rel="noopener">${esc(s.secondary)}</a>
        </div>
      </div>
    </section>`;
}

export function footer(c, site) {
  const column = (title, links) => `<div>
          <h2>${esc(title)}</h2>
          <ul>
            ${links.map((link) => `<li><a href="${link.href}">${esc(link.label)}</a></li>`).join('')}
          </ul>
        </div>`;

  return `<footer class="sitefooter">
      <div class="sitefooter__inner">
        <div class="sitefooter__brand">
          <img src="/assets/synqdrive-logo.png" width="1024" height="216" alt="SynqDrive" />
          <p>${esc(c.footer.tagline)}</p>
        </div>
        <nav class="sitefooter__columns" aria-label="${esc(c.footer.columnsLabel)}">
          ${column(c.footer.platform, c.footer.links.platform)}
          ${column(c.footer.company, c.footer.links.company)}
        </nav>
      </div>
      <div class="sitefooter__legal">
        <p>&copy; ${site.year} ${esc(site.brand)}. ${esc(c.footer.rights)}</p>
        <a href="mailto:${site.links.email}">${esc(site.links.email)}</a>
      </div>
    </footer>`;
}
