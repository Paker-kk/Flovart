// Flovart Background Service Worker — Context menus + message routing

// Register context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Right-click on images
  chrome.contextMenus.create({
    id: 'flovart-add-to-canvas',
    title: '📌 添加到 Flovart 画布',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'flovart-reverse-prompt',
    title: '✨ AI 反推 Prompt',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'flovart-separator',
    type: 'separator',
    contexts: ['image'],
  });

  chrome.contextMenus.create({
    id: 'flovart-open-canvas',
    title: '🎨 打开 Flovart 画布',
    contexts: ['page', 'selection'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'flovart-open-canvas') {
    const canvasUrl = chrome.runtime.getURL('app/index.html');
    chrome.tabs.create({ url: canvasUrl });
    return;
  }

  if (info.menuItemId === 'flovart-add-to-canvas') {
    const srcUrl = info.srcUrl;
    if (!srcUrl) return;

    try {
      // Fetch the image and convert to data URL for cross-origin safety
      const dataUrl = await fetchImageAsDataUrl(srcUrl);

      await chrome.storage.local.set({
        flovart_pending_image: {
          dataUrl,
          source: 'context-menu',
          sourceUrl: info.pageUrl,
          name: `Image from ${new URL(info.pageUrl || '').hostname}`,
          timestamp: Date.now(),
        },
      });

      // Open canvas
      const canvasUrl = chrome.runtime.getURL('app/index.html');
      chrome.tabs.create({ url: canvasUrl });
    } catch (err) {
      console.error('[Flovart] Failed to fetch image:', err);
    }
    return;
  }

  if (info.menuItemId === 'flovart-reverse-prompt') {
    const srcUrl = info.srcUrl;
    if (!srcUrl || !tab?.id) return;

    try {
      // Send message to content script to show the prompt panel
      chrome.tabs.sendMessage(tab.id, {
        type: 'FLOVART_REVERSE_PROMPT',
        imageUrl: srcUrl,
      });
    } catch (err) {
      console.error('[Flovart] Failed to send reverse prompt message:', err);
    }
    return;
  }
});

// Listen for messages from content script / popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FLOVART_GET_API_KEY') {
    // Content script needs an API key for reverse prompt (V2/V3 encrypted format)
    chrome.storage.local.get('flovart_api_keys_v2', async (result) => {
      try {
        const stored = result['flovart_api_keys_v2'];
        if (!stored?.d) { sendResponse({ keys: [] }); return; }
        // Decrypt keys (supports both V3 AES-GCM and V2 base64 fallback)
        const decoded = await decryptStoredKeys(stored.d);
        sendResponse({ keys: Array.isArray(decoded) ? decoded : [] });
      } catch {
        sendResponse({ keys: [] });
      }
    });
    return true; // async response
  }

  if (message.type === 'FLOVART_REVERSE_PROMPT_RESULT') {
    // Store the result for the canvas to pick up if needed
    chrome.storage.local.set({
      flovart_last_reverse_prompt: {
        prompt: message.prompt,
        imageUrl: message.imageUrl,
        timestamp: Date.now(),
      },
    });
  }

  // Runtime API: forward command to Flovart tab
  if (message.type === 'FLOVART_COMMAND') {
    forwardCommandToFlovart(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// ─── Runtime API: External message support (from web pages / other extensions) ───
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'FLOVART_COMMAND') {
    forwardCommandToFlovart(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'FLOVART_PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }
});

// Forward a FLOVART_COMMAND to the active Flovart tab's content script
async function forwardCommandToFlovart(message) {
  // Find a tab running Flovart (extension page or localhost dev)
  const tabs = await chrome.tabs.query({});
  const flovartTab = tabs.find(t =>
    t.url?.includes(chrome.runtime.id) ||
    t.url?.includes('localhost:') ||
    t.url?.includes('flovart')
  );
  if (!flovartTab?.id) throw new Error('No Flovart tab found. Open Flovart first.');
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(flovartTab.id, {
      type: 'FLOVART_COMMAND',
      id: message.id || crypto.randomUUID(),
      method: message.method,
      args: message.args,
    }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

// Helper: decrypt stored API keys (V3 AES-GCM or V2 base64 fallback)
async function decryptStoredKeys(encoded) {
  try {
    if (encoded && encoded.iv && encoded.ct) {
      // V3: AES-GCM encrypted
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(chrome.runtime.id), 'PBKDF2', false, ['deriveKey']
      );
      const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('flovart-ext-v3'), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
      );
      const iv = new Uint8Array(encoded.iv);
      const ct = new Uint8Array(encoded.ct);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    }
    if (typeof encoded === 'string') {
      // V2 fallback: base64
      const s = atob(encoded);
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: fetch an image URL and convert to base64 data URL
async function fetchImageAsDataUrl(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
