/**
 * Progressive enhancement for the public SynqDrive landing page.
 *
 * No framework and no dependencies. Everything here is optional: the page reads
 * and navigates fully without JavaScript, so this file only adds the platform
 * dropdown, the mobile drawer, the sticky masthead hairline and one reveal pass.
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Sticky masthead hairline ─────────────────────────────────────────── */

  var masthead = document.querySelector('[data-masthead]');

  if (masthead) {
    var setStuck = function () {
      masthead.dataset.stuck = window.scrollY > 8 ? 'true' : 'false';
    };
    setStuck();
    window.addEventListener('scroll', setStuck, { passive: true });
  }

  /* ── Platform dropdown ────────────────────────────────────────────────── */

  var dropdowns = Array.prototype.slice.call(document.querySelectorAll('[data-dropdown]'));

  function closeDropdown(group) {
    group.dataset.open = 'false';
    var trigger = group.querySelector('[data-dropdown-trigger]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openDropdown(group) {
    dropdowns.forEach(function (other) {
      if (other !== group) closeDropdown(other);
    });
    group.dataset.open = 'true';
    var trigger = group.querySelector('[data-dropdown-trigger]');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  dropdowns.forEach(function (group) {
    var trigger = group.querySelector('[data-dropdown-trigger]');
    var menu = group.querySelector('[data-dropdown-menu]');
    if (!trigger || !menu) return;

    closeDropdown(group);

    // Click only. Hover-to-open would make the trigger's own state ambiguous,
    // because entering the trigger to click it would already have opened the menu.
    trigger.addEventListener('click', function () {
      if (group.dataset.open === 'true') closeDropdown(group);
      else openDropdown(group);
    });

    // Leaving the group by keyboard closes it, staying inside does not.
    group.addEventListener('focusout', function (event) {
      if (!group.contains(event.relatedTarget)) closeDropdown(group);
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeDropdown(group);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    dropdowns.forEach(function (group) {
      if (group.dataset.open !== 'true') return;
      closeDropdown(group);
      var trigger = group.querySelector('[data-dropdown-trigger]');
      if (trigger) trigger.focus();
    });
    if (masthead && masthead.dataset.navOpen === 'true') closeDrawer(true);
  });

  document.addEventListener('click', function (event) {
    dropdowns.forEach(function (group) {
      if (!group.contains(event.target)) closeDropdown(group);
    });
  });

  /* ── Mobile drawer ────────────────────────────────────────────────────── */

  var navToggle = document.querySelector('[data-nav-toggle]');
  var navPanel = document.querySelector('[data-nav-panel]');

  function closeDrawer(returnFocus) {
    if (!masthead || !navToggle || !navPanel) return;
    masthead.dataset.navOpen = 'false';
    navPanel.hidden = true;
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', navToggle.dataset.labelOpen);
    if (returnFocus) navToggle.focus();
  }

  if (masthead && navToggle && navPanel) {
    closeDrawer(false);

    navToggle.addEventListener('click', function () {
      var open = masthead.dataset.navOpen === 'true';
      if (open) {
        closeDrawer(false);
        return;
      }
      masthead.dataset.navOpen = 'true';
      navPanel.hidden = false;
      navToggle.setAttribute('aria-expanded', 'true');
      navToggle.setAttribute('aria-label', navToggle.dataset.labelClose);
    });

    navPanel.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeDrawer(false);
    });

    // The drawer only exists below the desktop breakpoint.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024 && masthead.dataset.navOpen === 'true') closeDrawer(false);
    });
  }

  /* ── Reveal pass ──────────────────────────────────────────────────────── */

  // Tells the inline safety net in <head> that the reveal pass is running, so it
  // leaves the initial hidden state in place.
  document.documentElement.dataset.reveal = 'ready';

  var revealables = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  if (!revealables.length) return;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealables.forEach(function (node) {
      node.classList.add('is-revealed');
    });
    return;
  }

  // Siblings enter in sequence rather than as one block.
  var seen = new Map();
  revealables.forEach(function (node) {
    var parent = node.parentElement;
    var index = seen.get(parent) || 0;
    seen.set(parent, index + 1);
    if (index > 0) node.style.transitionDelay = Math.min(index * 80, 240) + 'ms';
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );

  revealables.forEach(function (node) {
    observer.observe(node);
  });
})();
