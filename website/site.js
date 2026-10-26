'use strict';

// Presentation only: no inventory, storage, analytics or product API access.
function initMenu(document, window) {
  const header = document.querySelector('#site-header');
  const button = document.querySelector('#menu-toggle');
  const label = document.querySelector('#menu-label');
  const nav = document.querySelector('#site-nav');
  if (!header || !button || !nav || !window.matchMedia) return;
  const mobile = window.matchMedia('(max-width: 899px)');
  const setOpen = open => {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    if (label) label.textContent = open ? '閉じる' : 'メニュー';
    button.querySelector('.icon')?.classList.toggle('icon-x', open);
    button.querySelector('.icon')?.classList.toggle('icon-menu', !open);
    nav.hidden = mobile.matches && !open;
  };
  const resize = () => {
    // Without JavaScript, the same navigation stays visible on small screens.
    header.classList.add('menu-ready');
    button.hidden = !mobile.matches;
    setOpen(false);
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  for (const link of nav.querySelectorAll('a')) link.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target) && button.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
  mobile.addEventListener('change', resize);
  resize();
}

function getGalleryState({ scrollLeft, clientWidth, scrollWidth, slides }) {
  const left = Math.max(0, scrollLeft);
  const right = left + clientWidth;
  const visible = slides.map((slide, index) => ({ ...slide, index }))
    .filter(slide => slide.left >= left - 2 && slide.left + slide.width <= right + 2);
  // A partially visible card still has an understandable position at high zoom.
  if (!visible.length && slides.length) {
    const nearest = slides.reduce((best, slide, index) => Math.abs(slide.left - left) < best.distance
      ? { index, distance: Math.abs(slide.left - left) } : best, { index: 0, distance: Infinity });
    visible.push({ index: nearest.index });
  }
  const start = visible.length ? visible[0].index + 1 : 0;
  const end = visible.length ? visible[visible.length - 1].index + 1 : 0;
  return { previousDisabled: left <= 2, nextDisabled: right >= scrollWidth - 2,
    label: `${start === end ? start : `${start}〜${end}`} / ${slides.length}` };
}

function initGallery(document, window) {
  const track = document.querySelector('#gallery-track');
  const navigation = document.querySelector('#gallery-navigation');
  const previous = document.querySelector('#gallery-prev');
  const next = document.querySelector('#gallery-next');
  const status = document.querySelector('#gallery-status');
  if (!track || !navigation || !previous || !next || !status) return;
  const slides = [...track.querySelectorAll('.gallery-slide')];
  if (!slides.length) return;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const geometry = () => {
    const bounds = track.getBoundingClientRect();
    return slides.map(slide => {
      const rect = slide.getBoundingClientRect();
      return { left: rect.left - bounds.left + track.scrollLeft, width: rect.width };
    });
  };
  const update = () => {
    const state = getGalleryState({ scrollLeft: track.scrollLeft, clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth, slides: geometry() });
    previous.disabled = state.previousDisabled;
    next.disabled = state.nextDisabled;
    if (status.textContent !== state.label) status.textContent = state.label;
  };
  const move = direction => {
    const positions = geometry();
    const step = positions.length > 1 ? positions[1].left - positions[0].left : positions[0].width;
    track.scrollTo({ left: Math.max(0, Math.min(track.scrollWidth - track.clientWidth,
      track.scrollLeft + direction * step)), behavior: reducedMotion?.matches ? 'auto' : 'smooth' });
  };
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  });
  // Throttle measurements to one per animation frame, including touch scrolling.
  let queued = false;
  track.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; update(); });
  }, { passive: true });
  if (window.ResizeObserver) new window.ResizeObserver(update).observe(track);
  else window.addEventListener('resize', update);
  navigation.hidden = false;
  update();
}

function initReveal(document, window) {
  const elements = [...document.querySelectorAll('[data-reveal]')];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  // Content remains visible if motion is reduced, JS is disabled, or the
  // observer API is unavailable. There is no dependency on a network resource.
  if (!window.IntersectionObserver || reducedMotion?.matches || !elements.length) return;
  const observer = new window.IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.remove('is-pending');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  for (const element of elements) { element.classList.add('is-pending'); observer.observe(element); }
  document.documentElement.classList.add('reveal-ready');
  reducedMotion?.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    for (const element of elements) element.classList.remove('is-pending');
  });
}

function initSite(document, window) {
  initMenu(document, window);
  initGallery(document, window);
  initReveal(document, window);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') initSite(document, window);
if (typeof module !== 'undefined' && module.exports) module.exports = { getGalleryState, initMenu, initGallery, initReveal, initSite };
