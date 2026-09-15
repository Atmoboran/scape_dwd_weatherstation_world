const loadingEl = document.getElementById('loading');
const barEl = document.getElementById('loading-bar');
const hintEl = document.getElementById('loading-hint');
const labelEl = document.getElementById('label');

export function setLoadingProgress(loaded, total) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  barEl.style.width = `${pct}%`;
  hintEl.textContent = `loading instruments… (${loaded}/${total})`;
}

export function hideLoadingScreen() {
  loadingEl.classList.add('hidden');
}

export function setLabel(text) {
  if (!text) {
    labelEl.classList.remove('visible');
    return;
  }
  labelEl.textContent = text;
  labelEl.classList.add('visible');
}
