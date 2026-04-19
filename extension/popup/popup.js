'use strict';

const STORAGE_KEY = 'wstNsEnabled';

const enabledEl = document.getElementById('enabled');
const toggleLabel = document.getElementById('toggleLabel');
const hintEl = document.getElementById('hint');

async function loadState() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  const enabled = data[STORAGE_KEY] !== false;
  enabledEl.checked = enabled;
  syncLabel(enabled);
}

function syncLabel(enabled) {
  toggleLabel.textContent = enabled ? 'Spoiler protection on' : 'Spoiler protection off';
  hintEl.hidden = enabled;
}

enabledEl.addEventListener('change', async () => {
  const enabled = enabledEl.checked;
  await chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
  syncLabel(enabled);
});

loadState().catch(() => {
  enabledEl.checked = true;
  syncLabel(true);
});
