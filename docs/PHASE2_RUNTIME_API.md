# Phase 2: Flovart Runtime API — 架构设计

> 让 AI Agent 实时操控运行中的 Flovart 画布（Web + 浏览器扩展模式）

## 目标

类似 libtv-skills 的 `create_session → send_message → query_progress` 模式，但适配 Flovart 的纯前端架构。Agent 通过脚本发送命令，Flovart 在浏览器中实时执行。

## 架构总览

```
┌─────────────────────────────────────────────────┐
│  AI Agent (Copilot / Claude Code / Cursor)      │
│                                                 │
│  调用 skills/flovart/scripts/ 下的脚本          │
└──────────────┬──────────────────────────────────┘
               │ HTTP POST localhost:17230
               ▼
┌─────────────────────────────────────────────────┐
│  Chrome Extension (background/service-worker.js)│
│                                                 │
│  - 监听 HTTP (chrome.runtime.onMessageExternal) │
│  - 或 Native Messaging (chrome.runtime.connect) │
│  - 转发命令到 content.js                         │
└──────────────┬──────────────────────────────────┘
               │ content script message
               ▼
┌─────────────────────────────────────────────────┐
│  Flovart Web App (window.__flovartAPI)          │
│                                                 │
│  暴露 API:                                      │
│  - canvas.addElement(element)                   │
│  - canvas.getElements()                         │
│  - canvas.removeElement(id)                     │
│  - generate.image(prompt, model)                │
│  - generate.video(prompt, model)                │
│  - agent.startSession(task)                     │
│  - agent.getStatus()                            │
│  - workflow.run(templateName)                   │
│  - config.getProviders()                        │
│  - config.getApiKeys()                          │
└─────────────────────────────────────────────────┘
```

## 通信方案：Extension Bridge

### 为什么选扩展？

| 方案 | 优点 | 缺点 |
|------|------|------|
| WebSocket (Tauri) | 双向实时 | 仅桌面版 |
| CDP | 强大 | 需要 --remote-debugging，用户体验差 |
| **Extension Bridge** | **Web版可用，用户已有扩展** | 需要扩展运行 |
| Vite dev API | 简单 | 仅开发模式 |

### 扩展 Bridge 实现

**1. content.js 注入 `window.__flovartAPI`**

```javascript
// content/content.js — 监听来自 background 的命令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FLOVART_COMMAND') {
    // 注入到页面上下文执行
    const script = document.createElement('script');
    script.textContent = `
      (async () => {
        try {
          const result = await window.__flovartAPI.${msg.method}(${JSON.stringify(msg.args)});
          document.dispatchEvent(new CustomEvent('__flovart_result', { detail: { id: '${msg.id}', result } }));
        } catch (e) {
          document.dispatchEvent(new CustomEvent('__flovart_result', { detail: { id: '${msg.id}', error: e.message } }));
        }
      })();
    `;
    document.head.appendChild(script);
    script.remove();

    // 监听结果
    const handler = (e) => {
      if (e.detail.id === msg.id) {
        sendResponse(e.detail);
        document.removeEventListener('__flovart_result', handler);
      }
    };
    document.addEventListener('__flovart_result', handler);
    return true; // async sendResponse
  }
});
```

**2. Flovart App 暴露 `window.__flovartAPI`**

在 `App.tsx` 中，通过 `useEffect` 注册全局 API：

```typescript
useEffect(() => {
  (window as any).__flovartAPI = {
    canvas: {
      addElement: (el: Partial<Element>) => { /* commitAction */ },
      getElements: () => elements,
      removeElement: (id: string) => { /* filter + commitAction */ },
      clear: () => { /* commitAction([]) */ },
    },
    generate: {
      image: async (prompt: string, model?: string) => { /* handleGenerate */ },
      video: async (prompt: string, model?: string) => { /* handleGenerate video mode */ },
    },
    agent: {
      start: async (task: string) => { /* trigger agent session */ },
      getStatus: () => ({ /* session status */ }),
    },
    workflow: {
      run: async (templateName: string) => { /* run workflow */ },
    },
    config: {
      getProviders: () => Object.keys(DEFAULT_PROVIDER_MODELS),
      getModels: (provider: string) => DEFAULT_PROVIDER_MODELS[provider],
    },
  };
  return () => { delete (window as any).__flovartAPI; };
}, [elements, /* other deps */]);
```

**3. background/service-worker.js HTTP 监听**

```javascript
// 方案A: 使用 chrome.runtime.onMessageExternal (推荐)
// 需要在 manifest.json 中配置 externally_connectable

// 方案B: 启动一个极简 HTTP server (仅限 MV3 with offscreen)
// 脚本 POST http://localhost:17230/api/command
```

## 脚本 API 设计

### scripts/flovart-client.js — 通用客户端

```javascript
// 使用 Chrome DevTools Protocol 或 Extension messaging
class FlovartClient {
  async connect() { /* find Flovart tab, establish connection */ }
  async execute(method, args) { /* send command, wait for result */ }
  async addImage(opts) { return this.execute('canvas.addElement', { type: 'image', ...opts }); }
  async generate(prompt, model) { return this.execute('generate.image', { prompt, model }); }
  async startAgent(task) { return this.execute('agent.start', { task }); }
  async getCanvas() { return this.execute('canvas.getElements', {}); }
}
```

### scripts/generate-image.js

```bash
node skills/flovart/scripts/generate-image.js --prompt "a cat" --model "imagen-4.0-generate-001"
```

### scripts/run-agent.js

```bash
node skills/flovart/scripts/run-agent.js --task "设计一张科技感海报"
```

### scripts/batch-generate.js

```bash
node skills/flovart/scripts/batch-generate.js --input prompts.csv --model "gpt-image-1"
```

## 实施步骤

### Step 1: `window.__flovartAPI` 注册
- 在 App.tsx 添加 useEffect 暴露 API
- 最小化暴露面：只暴露必要的读/写操作
- 安全性：API 仅在 localhost 或已知 extension origin 调用时响应

### Step 2: content.js 升级
- 添加命令转发逻辑
- 结果回传机制

### Step 3: 客户端脚本
- `flovart-client.js` — 通用连接层
- 各功能脚本基于 client 封装

### Step 4: 安全加固
- Origin 白名单
- 速率限制（防止恶意扩展滥用）
- 敏感操作（删除全部元素）需要确认

## 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| 恶意扩展调用 API | `window.__flovartAPI` 检查调用者 origin |
| XSS 通过命令注入 | 所有参数经 JSON schema 验证 |
| API Key 泄露 | `config.getApiKeys()` 永远不返回明文 key |
| 画布数据泄露 | `getElements()` 不返回 base64 图片数据，只返回元数据 |

## 与 Phase 1 的关系

Phase 1 (已完成): 源码级脚本 — Agent 修改 Flovart 代码文件
Phase 2 (本文档): 运行时脚本 — Agent 操控运行中的 Flovart 实例

两者互补：Phase 1 用于开发扩展功能，Phase 2 用于创作内容。
