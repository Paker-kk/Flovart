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

    // Store only URL reference (NOT base64) — avoids memory bomb
    // Web App will request the actual blob via FLOVART_FETCH_IMAGE message
    await chrome.storage.local.set({
      flovart_pending_image: {
        sourceUrl: srcUrl,
        source: 'context-menu',
        sourcePage: info.pageUrl,
        name: `Image from ${new URL(info.pageUrl || '').hostname}`,
        timestamp: Date.now(),
      },
    });

    // Open canvas
    const canvasUrl = chrome.runtime.getURL('app/index.html');
    chrome.tabs.create({ url: canvasUrl });
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

  // ─── API Gateway: Generate Image ───
  if (message.type === 'FLOVART_GENERATE_IMAGE') {
    handleGenerateImage(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // ─── API Gateway: Generate Video ───
  if (message.type === 'FLOVART_GENERATE_VIDEO') {
    handleGenerateVideo(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // ─── API Gateway: Generate Text / Enhance Prompt ───
  if (message.type === 'FLOVART_GENERATE_TEXT') {
    handleGenerateText(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // ─── Binary Fetch: fetch image as Blob (structured clone transfer) ───
  if (message.type === 'FLOVART_FETCH_IMAGE') {
    fetchImageAsBlob(message.url)
      .then(blob => sendResponse({ ok: true, blob }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
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

// ─── API Gateway Handlers ───

// Get the appropriate API key for a provider from extension storage
async function getKeyForProvider(provider) {
  return new Promise((resolve) => {
    chrome.storage.local.get('flovart_api_keys_v2', async (result) => {
      try {
        const stored = result['flovart_api_keys_v2'];
        if (!stored?.d) { resolve(null); return; }
        const keys = await decryptStoredKeys(stored.d);
        if (!Array.isArray(keys)) { resolve(null); return; }
        // Find first key matching the requested provider
        const match = keys.find(k => k.provider === provider && k.key);
        resolve(match || null);
      } catch {
        resolve(null);
      }
    });
  });
}

function requireKey(keyConfig) {
  if (!keyConfig?.key) throw new Error(`No API key configured for this provider. Open the Flovart extension popup to add one.`);
  return keyConfig.key;
}

function normalizeBaseUrl(provider, baseUrl) {
  const DEFAULTS = {
    google: 'https://generativelanguage.googleapis.com/v1beta',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    minimax: 'https://api.minimax.chat/v1',
    keling: 'https://api.klingai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  };
  const trimmed = (baseUrl || DEFAULTS[provider] || '').replace(/\/+$/, '');
  // Auto-detect API root for google
  if (provider === 'google' && trimmed && !trimmed.includes('generativelanguage') && !trimmed.includes('googleapis')) {
    try {
      const u = new URL(trimmed);
      return `${u.origin}/v1beta`;
    } catch { return trimmed; }
  }
  return trimmed;
}

async function handleGenerateImage(message) {
  const { provider, model, prompt, count, aspectRatio, keyId } = message;
  const keyConfig = keyId
    ? await getKeyById(keyId)
    : await getKeyForProvider(provider || inferProviderFromModelName(model));
  requireKey(keyConfig);

  const resolvedProvider = provider || keyConfig.provider || 'openai';

  if (resolvedProvider === 'google') {
    const baseUrl = normalizeBaseUrl('google', keyConfig.baseUrl);
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyConfig.key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Google generation failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const images = [];
    for (const part of parts) {
      if (part.inlineData) {
        images.push({ base64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'image/png' });
      }
    }
    return { ok: true, images };
  }

  // OpenAI-compatible path
  const baseUrl = normalizeBaseUrl(resolvedProvider, keyConfig.baseUrl);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${keyConfig.key}` };
  if (resolvedProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://flovart.app';
    headers['X-OpenRouter-Title'] = 'Flovart';
  }

  if (resolvedProvider === 'anthropic') {
    headers['x-api-key'] = keyConfig.key;
    headers['anthropic-version'] = '2023-06-01';
    delete headers.Authorization;
  }

  // Try /images/generations first, then fallback to chat/completions
  let res = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, prompt, n: count || 1, size: '1024x1024', response_format: 'b64_json' }),
  });
  if (!res.ok) {
    // Fallback: chat/completions
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
    });
    if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const dataUrl = json?.data?.[0]?.b64_json;
  const imgUrl = json?.data?.[0]?.url || json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (dataUrl) {
    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return { ok: true, images: [{ base64: match[2], mimeType: match[1] }] };
    }
    return { ok: true, images: [{ base64: dataUrl, mimeType: 'image/png' }] };
  }
  if (imgUrl) {
    const imgRes = await fetch(imgUrl);
    const blob = await imgRes.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { ok: true, images: [{ base64: btoa(binary), mimeType: blob.type || 'image/png' }] };
  }
  throw new Error('No image data in response');
}

async function handleGenerateVideo(message) {
  const { provider, model, prompt, aspectRatio, image, keyId } = message;
  const keyConfig = keyId
    ? await getKeyById(keyId)
    : await getKeyForProvider(provider || 'google');
  requireKey(keyConfig);

  const resolvedProvider = provider || keyConfig.provider || 'google';

  if (resolvedProvider === 'google') {
    const baseUrl = normalizeBaseUrl('google', keyConfig.baseUrl);
    // Submit video generation
    const submitBody = { prompt, aspectRatio: aspectRatio || '16:9' };
    if (image) submitBody.image = { bytesBase64Encoded: image.split(',')[1] || image };
    const submitRes = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(keyConfig.key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitBody),
    });
    if (!submitRes.ok) throw new Error(`Video submit failed (${submitRes.status})`);
    const submitJson = await submitRes.json();
    const operationName = submitJson?.name; // long-running operation
    if (!operationName) throw new Error('No operation name returned');

    // Poll for completion
    let attempts = 0;
    const MAX_ATTEMPTS = 120;
    while (attempts < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(`${baseUrl}/${operationName}?key=${encodeURIComponent(keyConfig.key)}`);
      if (!pollRes.ok) throw new Error(`Poll failed (${pollRes.status})`);
      const pollJson = await pollRes.json();
      if (pollJson.done) {
        const videoData = pollJson.response?.raiesVideo?.video?.encodedVideo;
        return { ok: true, videoBase64: videoData, mimeType: 'video/mp4' };
      }
      attempts++;
    }
    throw new Error('Video generation timed out (10 min)');
  }

  // OpenAI-compatible / custom unified video API
  const baseUrl = normalizeBaseUrl(resolvedProvider, keyConfig.baseUrl);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${keyConfig.key}` };

  // Submit job
  const submitBody = { model, prompt, aspect_ratio: aspectRatio || '16:9' };
  if (image) submitBody.image_url = image;
  const submitRes = await fetch(`${baseUrl}/videos/generations`, {
    method: 'POST', headers, body: JSON.stringify(submitBody),
  });
  if (!submitRes.ok) throw new Error(`Video submit failed (${submitRes.status})`);
  const submitJson = await submitRes.json();
  const jobId = submitJson?.job_id || submitJson?.id || submitJson?.task_id || submitJson?.data?.task_id;
  if (!jobId) throw new Error('No job_id returned');

  // Poll
  let attempts = 0;
  const MAX_ATTEMPTS = 120;
  while (attempts < MAX_ATTEMPTS) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`${baseUrl}/videos/generations/${encodeURIComponent(jobId)}`, { headers });
    if (!pollRes.ok) throw new Error(`Poll failed (${pollRes.status})`);
    const pollJson = await pollRes.json();
    const status = (pollJson?.status || pollJson?.data?.status || '').toLowerCase();
    if (status === 'completed' || status === 'success' || status === 'succeed') {
      const videoUrl = pollJson?.output || pollJson?.data?.output || pollJson?.video_url || pollJson?.data?.video_url;
      if (videoUrl) {
        const vidRes = await fetch(videoUrl);
        const blob = await vidRes.blob();
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { ok: true, videoBase64: btoa(binary), mimeType: blob.type || 'video/mp4' };
      }
    }
    if (status === 'failed' || status === 'failure' || status === 'error') {
      throw new Error(`Video generation failed: ${pollJson?.error || pollJson?.message || 'unknown'}`);
    }
    attempts++;
  }
  throw new Error('Video generation timed out (10 min)');
}

async function handleGenerateText(message) {
  const { provider, model, prompt, systemPrompt, keyId } = message;
  const keyConfig = keyId
    ? await getKeyById(keyId)
    : await getKeyForProvider(provider || 'openai');
  requireKey(keyConfig);

  const resolvedProvider = provider || keyConfig.provider || 'openai';

  if (resolvedProvider === 'google') {
    const baseUrl = normalizeBaseUrl('google', keyConfig.baseUrl);
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
    const res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyConfig.key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Text generation failed (${res.status})`);
    const json = await res.json();
    return { ok: true, text: json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '' };
  }

  const baseUrl = normalizeBaseUrl(resolvedProvider, keyConfig.baseUrl);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${keyConfig.key}` };
  if (resolvedProvider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://flovart.app';
    headers['X-OpenRouter-Title'] = 'Flovart';
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
  });
  if (!res.ok) throw new Error(`Text generation failed (${res.status})`);
  const json = await res.json();
  return { ok: true, text: json?.choices?.[0]?.message?.content?.trim() || '' };
}

function inferProviderFromModelName(model) {
  if (!model) return 'openai';
  if (/^(gemini|imagen|veo)/.test(model)) return 'google';
  if (/^claude/i.test(model)) return 'anthropic';
  if (/^dall-e|gpt-image|gpt-|o\d/.test(model)) return 'openai';
  if (/^deepseek/i.test(model)) return 'deepseek';
  if (/^qwen/i.test(model)) return 'qwen';
  if (/^(minimax|abab|video-01)/.test(model)) return 'minimax';
  return 'openai';
}

async function getKeyById(keyId) {
  return getKeyForProvider(null); // simplified — scan all keys for match
}

// ─── Binary Blob Transfer (Phase 1B) ───

// Fetches an image URL as a Blob (NOT base64), preserving binary format
// The Blob will be transferred via structured clone when sent to the Web App
async function fetchImageAsBlob(url) {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return await response.blob();
}

// Kept for backward compatibility, but new code should use fetchImageAsBlob
async function fetchImageAsDataUrl(url) {
  const blob = await fetchImageAsBlob(url);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── PRD 7.1 Context Menu ───
chrome.contextMenus?.removeAll(() => {
  chrome.contextMenus?.create({
    id: 'flovart_add_to_canvas',
    title: '📌 Add to Flovart Canvas',
    contexts: ['image', 'video'],
  });
  chrome.contextMenus?.create({
    id: 'flovart_reverse_prompt',
    title: '✨ AI Reverse Prompt',
    contexts: ['image'],
  });
  chrome.contextMenus?.create({
    id: 'flovart_add_and_reverse',
    title: '🎬 Add + Reverse Prompt to Flovart',
    contexts: ['image'],
  });
});

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'flovart_add_to_canvas') {
    const mediaUrl = info.srcUrl;
    const isVideo = info.mediaType === 'video';
    chrome.storage.local.set({
      flovart_pending_asset: {
        url: mediaUrl,
        type: isVideo ? 'video' : 'image',
        name: mediaUrl?.split('/').pop() || 'Captured Asset',
        timestamp: Date.now(),
      },
    });
    // Open Flovart to receive the asset
    chrome.tabs.query({ url: '*://localhost:*/*' }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
        chrome.tabs.reload(tabs[0].id);
      }
    });
  } else if (info.menuItemId === 'flovart_reverse_prompt') {
    chrome.tabs.sendMessage(tab.id, { type: 'FLOVART_REVERSE_PROMPT' }, (result) => {
      if (result?.prompt) {
        chrome.storage.local.set({
          flovart_pending_prompt: {
            prompt: result.prompt,
            sourceUrl: info.srcUrl,
            timestamp: Date.now(),
          },
        });
      }
    });
  } else if (info.menuItemId === 'flovart_add_and_reverse') {
    chrome.storage.local.set({
      flovart_pending_asset: {
        url: info.srcUrl,
        type: 'image',
        name: info.srcUrl?.split('/').pop() || 'Captured Image',
        timestamp: Date.now(),
        needsReversePrompt: true,
      },
    });
  }
});

// Handle reverse prompt request from content script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FLOVART_REVERSE_PROMPT_REQUEST') {
    handleReversePrompt(msg.imageUrl, msg.alt)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  // ...existing handlers...
});

async function handleReversePrompt(imageUrl, alt) {
  // Fetch the image and convert to base64
  const resp = await fetch(imageUrl);
  const blob = await resp.blob();
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Get API keys from extension storage
  const { flovart_keys } = await chrome.storage.local.get('flovart_keys');
  const keys = flovart_keys || [];
  const textKey = keys.find(k => k.capabilities?.includes('text'));
  if (!textKey) return { ok: false, error: 'No text-capable API key configured' };

  // Call AI to reverse-engineer the prompt
  const prompt = alt || 'Describe this image in a detailed AI art prompt style.';
  try {
    const aiResp = await fetch(textKey.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + textKey.key,
      },
      body: JSON.stringify({
        model: textKey.defaultModel || 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: base64 } },
            { type: 'text', text: 'Analyze this image and write a detailed AI art generation prompt that would reproduce it. Focus on: art style, lighting, composition, subject, color palette, mood. Output only the prompt text, no explanation.' },
          ],
        }],
        max_tokens: 300,
      }),
    });
    const data = await aiResp.json();
    const generatedPrompt = data.choices?.[0]?.message?.content || '';
    return { ok: true, prompt: generatedPrompt };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
