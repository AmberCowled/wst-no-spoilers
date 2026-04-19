'use strict';

importScripts('constants.js');

const STORAGE_KEY = WST_NS_STORAGE_KEY;

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? '#2f6b2f' : '#6b2f2f',
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  updateBadge(data[STORAGE_KEY] !== false);
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  updateBadge(data[STORAGE_KEY] !== false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
  updateBadge(changes[STORAGE_KEY].newValue !== false);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-protection') return;
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  const enabled = data[STORAGE_KEY] !== false;
  await chrome.storage.sync.set({ [STORAGE_KEY]: !enabled });
});
