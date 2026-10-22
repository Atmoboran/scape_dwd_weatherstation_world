import { hasTouch } from './player-controller.js';
import { theme } from './theme.js';

const el = (id) => document.getElementById(id);
const S = theme.strings;

const loadingEl = el('loading');
const startEl = el('start');
const barEl = el('loading-bar');
const loadingHintEl = el('loading-hint');
const labelEl = el('station-label');
const interactEl = el('interact');
const toastStack = el('toast-stack');
const panelEl = el('info-panel');
const foundCountEl = el('found-count');
const totalCountEl = el('total-count');
const pipsEl = el('pips');
const minimap = el('minimap');
const mmCtx = minimap.getContext('2d');
const settingsBtn = el('settings-btn');
const settingsPanel = el('settings-panel');
const weatherOptions = el('weather-options');

const MINIMAP_RANGE_M = 46; // world meters from centre to map edge

/** Writes the theme's static copy into the markup. Call once, before anything renders. */
export function initCopy() {
  el('found-label').textContent = S.foundLabel;
  el('weather-title').textContent = S.weatherTitle;
  el('start-headline').innerHTML = S.startHeadline.map((line) => `<div>${line}</div>`).join('');
  el('start-intro').textContent = S.startIntro;
  el('joystick-hint').textContent = S.controlsTouch[0][1];
  el('look-hint').textContent = S.controlsTouch[1][1];
  el('sprint-btn').textContent = S.controlsTouch[2][0];
  el('loading-hint').textContent = S.loadingPrep;
  settingsBtn.setAttribute('aria-label', S.weatherAria);
  startEl.querySelector('.go').textContent = S.startButton;
  interactEl.querySelector('.verb').textContent = S.interact;
  panelEl.querySelector('button').textContent = S.panelClose;
}

export function setLoadingProgress(loaded, total) {
  barEl.style.width = `${total > 0 ? Math.round((loaded / total) * 100) : 0}%`;
  loadingHintEl.textContent = S.loadingStations(loaded, total);
}

export function setLoadFailed() {
  loadingHintEl.textContent = S.loadFailed;
}

/** Swaps the loading screen for the start screen; resolves when the player enters. */
export function showStartScreen() {
  const controls = hasTouch ? S.controlsTouch : S.controlsDesktop;
  el('control-help').innerHTML = controls
    .map(([key, text]) => `<div class="row"><span class="k">${key}</span><span>${text}</span></div>`)
    .join('');

  loadingEl.classList.add('fade');
  setTimeout(() => loadingEl.classList.add('hidden'), 500);
  startEl.classList.remove('hidden');

  return new Promise((resolve) => {
    startEl.querySelector('.go').addEventListener('click', () => {
      startEl.classList.add('fade');
      setTimeout(() => startEl.classList.add('hidden'), 500);
      resolve();
    }, { once: true });
  });
}

export function initProgress(instruments) {
  totalCountEl.textContent = String(instruments.length);
  pipsEl.innerHTML = instruments
    .map((e) => `<span class="pip" data-id="${e.def.id}"></span>`)
    .join('');
}

export function updateProgress(instruments, foundCount) {
  foundCountEl.textContent = String(foundCount);
  for (const entry of instruments) {
    const pip = pipsEl.querySelector(`[data-id="${entry.def.id}"]`);
    if (pip) pip.style.background = entry.discovered ? entry.accent : '';
  }
}

export function setNearestLabel(entry, distance) {
  if (!entry) {
    labelEl.classList.remove('visible');
    return;
  }
  labelEl.querySelector('.name').textContent = entry.def.name;
  labelEl.querySelector('.dist').textContent =
    distance < 1 ? S.here : S.distance(distance.toFixed(0));
  labelEl.classList.add('visible');
}

export function setInteractPrompt(visible) {
  interactEl.classList.toggle('visible', visible);
  interactEl.querySelector('kbd').classList.toggle('hidden', hasTouch);
}

export function onInteract(handler) {
  interactEl.addEventListener('click', handler);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') handler();
  });
}

export function toast(title, sub, accent) {
  const node = document.createElement('div');
  node.className = 'toast';
  if (accent) node.style.borderLeftColor = accent;
  node.innerHTML = `<div>${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
  toastStack.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 400);
  }, 2600);
}

export function openPanel(entry) {
  const { def } = entry;
  panelEl.querySelector('.accent-bar').style.background = entry.accent;
  panelEl.querySelector('h2').textContent = def.name;
  panelEl.querySelector('.source').textContent = S.panelSource(def.sourceName);
  panelEl.querySelector('p').textContent = def.description || S.panelNoDescription;
  panelEl.querySelector('.chips').innerHTML = (def.measures || [])
    .map((m) => `<span class="chip">${m}</span>`)
    .join('');
  panelEl.querySelector('.stats').innerHTML = `
    <div>${S.statHeight}<b>${def.height.toFixed(1)} m</b></div>
    <div>${S.statFootprint}<b>${def.footprint[0].toFixed(1)} × ${def.footprint[1].toFixed(1)} m</b></div>`;
  panelEl.classList.add('open');
}

export function closePanel() {
  panelEl.classList.remove('open');
}

export function isPanelOpen() {
  return panelEl.classList.contains('open');
}

export function onPanelClose(handler) {
  panelEl.querySelector('button').addEventListener('click', () => {
    closePanel();
    handler?.();
  });
}

/** Builds the weather picker. `onSelect(id)` fires on every choice. */
export function initSettings(presets, currentId, onSelect, onOpen) {
  weatherOptions.innerHTML = presets
    .map(
      (p) =>
        `<button type="button" data-id="${p.id}" class="${p.id === currentId ? 'active' : ''}">
           <span>${p.icon}</span><span>${S.weatherLabels[p.id] ?? p.id}</span>
         </button>`
    )
    .join('');

  weatherOptions.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    for (const b of weatherOptions.querySelectorAll('button')) {
      b.classList.toggle('active', b === button);
    }
    onSelect(button.dataset.id);
  });

  const toggle = () => {
    const opening = !settingsPanel.classList.contains('open');
    settingsPanel.classList.toggle('open', opening);
    // Opening releases the pointer; while it's locked the browser sends every mouse
    // event to the canvas and the picker can't be clicked at all.
    if (opening) onOpen?.();
  };

  settingsBtn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') toggle();
  });

  // Tapping the world dismisses the panel.
  document.querySelector('#app').addEventListener('pointerdown', () => {
    settingsPanel.classList.remove('open');
  });
}

/** Reads a themed CSS custom property. */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Top-down radar, rotated so the player always faces "up". */
export function drawMinimap(instruments, playerPos, heading) {
  const size = minimap.width;
  const mid = size / 2;
  const pxPerM = mid / MINIMAP_RANGE_M;

  mmCtx.clearRect(0, 0, size, size);
  mmCtx.save();
  mmCtx.beginPath();
  mmCtx.arc(mid, mid, mid - 2, 0, Math.PI * 2);
  mmCtx.fillStyle = token('--minimap-bg');
  mmCtx.fill();
  mmCtx.clip();

  mmCtx.strokeStyle = token('--minimap-ring');
  mmCtx.lineWidth = 2;
  for (const r of [0.45, 0.85]) {
    mmCtx.beginPath();
    mmCtx.arc(mid, mid, mid * r, 0, Math.PI * 2);
    mmCtx.stroke();
  }

  for (const entry of instruments) {
    // Rotate world offsets into player-relative space (+heading so forward is up).
    const dx = entry.group.position.x - playerPos.x;
    const dz = entry.group.position.z - playerPos.z;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const mx = mid + (dx * cos - dz * sin) * pxPerM;
    const my = mid + (dx * sin + dz * cos) * pxPerM;

    mmCtx.beginPath();
    mmCtx.arc(mx, my, entry.discovered ? 6 : 5, 0, Math.PI * 2);
    if (entry.discovered) {
      mmCtx.fillStyle = entry.accent;
      mmCtx.fill();
    } else {
      mmCtx.strokeStyle = entry.accent;
      mmCtx.lineWidth = 2.5;
      mmCtx.stroke();
    }
  }

  // Player arrow, always pointing up.
  mmCtx.fillStyle = token('--minimap-player');
  mmCtx.beginPath();
  mmCtx.moveTo(mid, mid - 9);
  mmCtx.lineTo(mid + 6.5, mid + 7);
  mmCtx.lineTo(mid, mid + 3.5);
  mmCtx.lineTo(mid - 6.5, mid + 7);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}
