'use strict';

// STORAGE_KEY is provided by constants.js (loaded before this script)
const STORAGE_KEY = WST_NS_STORAGE_KEY;

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

  // Auto-reload open wst.tv tabs so masking takes effect immediately
  const tabs = await chrome.tabs.query({ url: 'https://*.wst.tv/*' });
  for (const tab of tabs) {
    chrome.tabs.reload(tab.id);
  }
});

loadState().catch(() => {
  enabledEl.checked = true;
  syncLabel(true);
});
