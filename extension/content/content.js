// Flovart Content Script — Right-click AI reverse prompt with animated panel + Runtime API bridge
(() => {
  let panel = null;
  let currentImageUrl = null;

  // ─── Runtime API Bridge: forward commands from background → page ───
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FLOVART_COMMAND') {
      // Forward command to page via postMessage, listen for result
      const callId = message.id || crypto.randomUUID();
      const handler = (e) => {
        if (e.data?.type === '__flovart_result' && e.data.id === callId) {
          window.removeEventListener('message', handler);
          sendResponse(e.data.error ? { error: e.data.error } : { result: e.data.result });
        }
      };
      window.addEventListener('message', handler);
      // Timeout after 30s
      setTimeout(() => { window.removeEventListener('message', handler); sendResponse({ error: 'timeout' }); }, 30000);
      window.postMessage({ type: '__flovart_command', id: callId, method: message.method, args: message.args }, '*');
      return true; // async sendResponse
    }
    if (message.type === 'FLOVART_REVERSE_PROMPT') {
      currentImageUrl = message.imageUrl;
      showReversePromptPanel(message.imageUrl);
    }
  });

  function showReversePromptPanel(imageUrl) {
    // Remove existing panel
    removePanel();

    // Create panel
    panel = document.createElement('div');
    panel.id = 'flovart-panel';
    panel.innerHTML = `
      <div class="flovart-panel-backdrop"></div>
      <div class="flovart-panel-card">
        <div class="flovart-panel-header">
          <div class="flovart-panel-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#fg1)" />
              <path d="M7 12l3 3 7-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              <defs><linearGradient id="fg1" x1="2" y1="2" x2="22" y2="22"><stop stop-color="#DC2626"/><stop offset="1" stop-color="#F43F5E"/></linearGradient></defs>
            </svg>
            <span>AI 反推 Prompt</span>
          </div>
          <button class="flovart-panel-close" id="flovart-close">&times;</button>
        </div>
        <div class="flovart-panel-preview">
          <img src="${escapeHtml(imageUrl)}" alt="Selected image" />
        </div>
        <div class="flovart-panel-content">
          <div class="flovart-panel-loading" id="flovart-loading">
            <div class="flovart-spinner"></div>
            <span>正在分析图片...</span>
          </div>
          <div class="flovart-panel-result" id="flovart-result" style="display:none">
            <div class="flovart-prompt-text" id="flovart-prompt-text"></div>
            <div class="flovart-panel-actions">
              <button class="flovart-btn flovart-btn-copy" id="flovart-copy">📋 复制 Prompt</button>
              <button class="flovart-btn flovart-btn-canvas" id="flovart-to-canvas">🎨 在画布中使用</button>
            </div>
          </div>
          <div class="flovart-panel-error" id="flovart-error" style="display:none">
            <span id="flovart-error-text"></span>
            <button class="flovart-btn flovart-btn-retry" id="flovart-retry">重试</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      panel.classList.add('flovart-panel-visible');
    });

    // Bind events
    panel.querySelector('#flovart-close')?.addEventListener('click', removePanel);
    panel.querySelector('.flovart-panel-backdrop')?.addEventListener('click', removePanel);
    panel.querySelector('#flovart-copy')?.addEventListener('click', handleCopy);
    panel.querySelector('#flovart-to-canvas')?.addEventListener('click', handleToCanvas);
    panel.querySelector('#flovart-retry')?.addEventListener('click', () => reversePrompt(imageUrl));

    // Start AI analysis
    reversePrompt(imageUrl);
  }

  // ─── Unified Storage V2 helpers (must match popup.js) ───
  const STORAGE_KEY_V2 = 'flovart_api_keys_v2';
  const STORAGE_KEY_OLD = 'flovart_user_api_keys';

  function decodeKeysV2(encoded) {
    try {
      const s = atob(encoded);
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  async function loadApiKeys() {
    const result = await chrome.storage.local.get([STORAGE_KEY_V2, STORAGE_KEY_OLD]);
    // V2 优先
    if (result[STORAGE_KEY_V2]?.d) {
      const decoded = decodeKeysV2(result[STORAGE_KEY_V2].d);
      if (Array.isArray(decoded)) return decoded;
    }
    // Fallback 旧格式
    return result[STORAGE_KEY_OLD] || [];
  }

  async function reversePrompt(imageUrl) {
    const loadingEl = document.getElementById('flovart-loading');
    const resultEl = document.getElementById('flovart-result');
    const errorEl = document.getElementById('flovart-error');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (resultEl) resultEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    try {
      // Get API keys from unified V2 storage
      const keys = await loadApiKeys();
      
      if (!keys || keys.length === 0) {
        showError('未配置 API Key。请先在 Flovart 画布中配置你的 API Key。');
        return;
      }

      // Find a vision-capable key (prefer Google, then OpenAI, then any)
      const visionKey = keys.find(k => k.provider === 'google')
        || keys.find(k => k.provider === 'openai')
        || keys.find(k => k.provider === 'anthropic')
        || keys.find(k => k.capabilities?.includes('text'))
        || keys[0];

      if (!visionKey) {
        showError('未找到支持图片识别的 API Key。');
        return;
      }

      const prompt = await callVisionAPI(visionKey, imageUrl);
      showResult(prompt);
    } catch (err) {
      showError(err.message || '分析失败，请重试。');
    }
  }

  async function callVisionAPI(keyConfig, imageUrl) {
    const provider = keyConfig.provider;
    const apiKey = keyConfig.key;

    if (provider === 'google') {
      // Gemini Vision API
      const model = 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{
          parts: [
            { text: 'Analyze this image and generate a detailed prompt that could be used to recreate it with an AI image generator. Include style, composition, colors, mood, subject details. Output only the prompt text, in English.' },
            { inlineData: { mimeType: 'image/jpeg', data: await fetchImageAsBase64(imageUrl) } },
          ],
        }],
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(`Google API error: ${resp.status}`);
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No prompt generated.';
    }

    // OpenAI-compatible (OpenAI, DeepSeek, etc.)
    const baseUrls = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.openai.com/v1', // fallback
      deepseek: 'https://api.deepseek.com/v1',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      minimax: 'https://api.minimax.chat/v1',
      volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
    };

    const baseUrl = keyConfig.baseUrl || baseUrls[provider] || 'https://api.openai.com/v1';
    const model = provider === 'openai' ? 'gpt-4o-mini' : (keyConfig.models?.[0] || 'gpt-4o-mini');

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image and generate a detailed prompt that could be used to recreate it with an AI image generator. Include style, composition, colors, mood, subject details. Output only the prompt text, in English.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        }],
        max_tokens: 500,
      }),
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || 'No prompt generated.';
  }

  async function fetchImageAsBase64(url) {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function showResult(prompt) {
    const loadingEl = document.getElementById('flovart-loading');
    const resultEl = document.getElementById('flovart-result');
    const promptText = document.getElementById('flovart-prompt-text');

    if (loadingEl) loadingEl.style.display = 'none';
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.classList.add('flovart-fade-in');
    }
    if (promptText) promptText.textContent = prompt;

    // Send result back to background
    chrome.runtime.sendMessage({
      type: 'FLOVART_REVERSE_PROMPT_RESULT',
      prompt,
      imageUrl: currentImageUrl,
    });
  }

  function showError(text) {
    const loadingEl = document.getElementById('flovart-loading');
    const errorEl = document.getElementById('flovart-error');
    const errorText = document.getElementById('flovart-error-text');

    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'flex';
    if (errorText) errorText.textContent = text;
  }

  function handleCopy() {
    const promptText = document.getElementById('flovart-prompt-text')?.textContent;
    if (promptText) {
      navigator.clipboard.writeText(promptText).then(() => {
        const copyBtn = document.getElementById('flovart-copy');
        if (copyBtn) {
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✅ 已复制';
          setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        }
      });
    }
  }

  function handleToCanvas() {
    const promptText = document.getElementById('flovart-prompt-text')?.textContent;
    if (promptText) {
      chrome.storage.local.set({
        flovart_pending_prompt: {
          prompt: promptText,
          imageUrl: currentImageUrl,
          timestamp: Date.now(),
        },
      });
      const canvasUrl = chrome.runtime.getURL('app/index.html');
      window.open(canvasUrl, '_blank');
    }
    removePanel();
  }

  function removePanel() {
    if (panel) {
      panel.classList.remove('flovart-panel-visible');
      panel.classList.add('flovart-panel-exit');
      setTimeout(() => {
        panel?.remove();
        panel = null;
      }, 280);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
