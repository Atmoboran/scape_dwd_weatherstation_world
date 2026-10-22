import scape from './themes/scape.js';
import plain from './themes/plain.js';

/**
 * The design layer. Every colour, font, string and decorative shape the app shows
 * lives in a theme module; nothing else in src/ hard-codes a colour or a label, so a
 * theme can be swapped without touching the game code.
 *
 * To add one: copy src/themes/plain.js (the smallest complete implementation of the
 * contract), register it below, and load the page with ?theme=<id>.
 */
const THEMES = { scape, plain };
const DEFAULT_THEME = 'scape';

function pick() {
  const requested = new URLSearchParams(location.search).get('theme');
  return THEMES[requested] ?? THEMES[DEFAULT_THEME];
}

export const theme = pick();

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderSvgLayer(host, elements, preserveAspectRatio) {
  if (!elements.length) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', preserveAspectRatio);
  for (const { tag, attrs } of elements) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  host.appendChild(svg);
}

/** Pushes the theme's tokens, fonts and decorative layers into the document. */
export function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--font', theme.fontStack);
  for (const [key, value] of Object.entries(theme.cssVars)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('lang', theme.lang);
  root.dataset.theme = theme.id;

  for (const host of document.querySelectorAll('[data-poster]')) {
    renderSvgLayer(host, theme.poster.fields, 'none');
    renderSvgLayer(host, theme.poster.shapes, 'xMidYMid slice');
  }

  const { wordmark, subtitle, shortMark, claim } = theme.brand;
  for (const node of document.querySelectorAll('[data-brand-wordmark]')) {
    node.textContent = wordmark;
  }
  for (const node of document.querySelectorAll('[data-brand-subtitle]')) {
    node.innerHTML = subtitle.map((word) => `<span>${word}</span>`).join('');
    node.classList.toggle('hidden', subtitle.length === 0);
  }
  for (const node of document.querySelectorAll('[data-brand-mark]')) {
    node.textContent = shortMark;
  }
  for (const node of document.querySelectorAll('[data-brand-claim]')) {
    node.textContent = claim;
    node.classList.toggle('hidden', !claim);
  }
}
