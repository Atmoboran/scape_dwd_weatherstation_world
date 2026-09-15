import { hasTouch } from './player-controller.js';

const el = (id) => document.getElementById(id);

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

const MINIMAP_RANGE_M = 42; // world meters from centre to map edge

export function setLoadingProgress(loaded, total) {
  barEl.style.width = `${total > 0 ? Math.round((loaded / total) * 100) : 0}%`;
  loadingHintEl.textContent = `loading stations… ${loaded}/${total}`;
}

/** Swaps the loading screen for the start screen; resolves when the player enters. */
export function showStartScreen() {
  el('control-help').innerHTML = hasTouch
    ? `<div class="row"><span class="k">Left</span> drag the stick to walk</div>
       <div class="row"><span class="k">Right</span> drag anywhere to look around</div>
       <div class="row"><span class="k">Run</span> tap to toggle sprint</div>
       <div class="row"><span class="k">Tap</span> the prompt to inspect a station</div>`
    : `<div class="row"><span class="k">W A S D</span> walk</div>
       <div class="row"><span class="k">Mouse</span> look around</div>
       <div class="row"><span class="k">Shift</span> run</div>
       <div class="row"><span class="k">E</span> inspect a station &nbsp;<span class="k">Esc</span> release cursor</div>`;

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
    if (pip) pip.style.background = entry.discovered ? entry.def.accent : 'rgba(255,255,255,0.18)';
  }
}

export function setNearestLabel(entry, distance) {
  if (!entry) {
    labelEl.classList.remove('visible');
    return;
  }
  labelEl.querySelector('.name').textContent = entry.def.name;
  labelEl.querySelector('.name').style.color = entry.discovered ? entry.def.accent : '';
  labelEl.querySelector('.dist').textContent =
    distance < 1 ? 'you are here' : `${distance.toFixed(0)} m away`;
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
  panelEl.querySelector('.accent-bar').style.background = def.accent;
  panelEl.querySelector('h2').textContent = def.name;
  panelEl.querySelector('.source').textContent = `Source model: ${def.sourceName}`;
  panelEl.querySelector('p').textContent = def.description || 'No description recorded yet.';
  panelEl.querySelector('.chips').innerHTML = (def.measures || [])
    .map((m) => `<span class="chip">${m}</span>`)
    .join('');
  panelEl.querySelector('.stats').innerHTML = `
    <div>Height<b>${def.height.toFixed(1)} m</b></div>
    <div>Footprint<b>${def.footprint[0].toFixed(1)} × ${def.footprint[1].toFixed(1)} m</b></div>`;
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

/** Top-down radar, rotated so the player always faces "up". */
export function drawMinimap(instruments, playerPos, heading) {
  const size = minimap.width;
  const mid = size / 2;
  const pxPerM = mid / MINIMAP_RANGE_M;

  mmCtx.clearRect(0, 0, size, size);
  mmCtx.save();
  mmCtx.beginPath();
  mmCtx.arc(mid, mid, mid - 2, 0, Math.PI * 2);
  mmCtx.fillStyle = 'rgba(10,16,24,0.75)';
  mmCtx.fill();
  mmCtx.clip();

  mmCtx.strokeStyle = 'rgba(255,255,255,0.12)';
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
      mmCtx.fillStyle = entry.def.accent;
      mmCtx.fill();
    } else {
      mmCtx.strokeStyle = entry.def.accent;
      mmCtx.lineWidth = 2.5;
      mmCtx.stroke();
    }
  }

  // Player arrow, always pointing up.
  mmCtx.fillStyle = '#ffffff';
  mmCtx.beginPath();
  mmCtx.moveTo(mid, mid - 9);
  mmCtx.lineTo(mid + 6.5, mid + 7);
  mmCtx.lineTo(mid, mid + 3.5);
  mmCtx.lineTo(mid - 6.5, mid + 7);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.restore();
}
