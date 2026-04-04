<p align="center">
  <img src="displayphoto1.png" alt="Flovart" width="100%" />
</p>

<h1 align="center">🔴 Flovart</h1>

<p align="center">
  <strong>开源版 Lovart — 自带 Key，接入所有模型，在无限画布上创作</strong>
</p>

<p align="center">
  <a href="https://paker-kk.github.io/Flovart/" target="_blank"><strong>👉 在线体验 Demo</strong></a>
</p>

<p align="center">
  <a href="https://paker-kk.github.io/Flovart/">在线体验</a> •
  <a href="#-开始使用">开始使用</a> •
  <a href="#-功能一览">功能一览</a> •
  <a href="#-开发计划">开发计划</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache_2.0-E8453C" alt="Apache 2.0 License" />
  <img src="https://img.shields.io/badge/React-19-E8453C?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-E8453C?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-E8453C?logo=vite&logoColor=white" alt="Vite 6" />
</p>

---

## 这是什么？

Flovart 是一个**开源的 AI 图片/视频设计工具**。你用自己的 API Key（Google Gemini、OpenAI、DeepSeek 等），在无限画布上生成图片、编辑图片、生成视频、让 AI Agent 帮你做设计。

**所有数据存在你本地，不经过任何中间服务器。**

<p align="center">
  <a href="https://paker-kk.github.io/Flovart/" target="_blank">
    <img src="https://img.shields.io/badge/🌐_在线体验_Demo-点击打开-E8453C?style=for-the-badge" alt="Demo" />
  </a>
</p>

---

## 🚀 开始使用

三种方式，选适合你的：

### 方式一：本地运行

```bash
git clone https://github.com/Paker-kk/Flovart.git
cd Flovart
npm install
npm run dev
```

打开 http://localhost:3000，在设置中填入你的 API Key 即可。

> 推荐 [Google AI Studio](https://aistudio.google.com/apikey) 免费获取 Gemini API Key。

### 方式二：Docker

```bash
git clone https://github.com/Paker-kk/Flovart.git
cd Flovart
docker-compose up -d
```

访问 http://localhost:3000。

### 方式三：浏览器扩展

> 🔜 **正在准备上架 Chrome / Edge 商店，Coming Soon。**
>
> 当前可通过开发者模式加载：

```bash
npm run ext:build
```

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启「开发人员模式」
3. 点击「加载已解压的扩展程序」→ 选择 `dist-extension/` 目录

---

## 🎯 功能一览

| 功能 | 说明 |
|------|------|
| **无限画布** | 缩放平移、画笔、形状、文字、箭头、图层管理、智能对齐 |
| **AI 文生图** | 输入提示词生成图片，支持 Gemini / DALL-E / SDXL 等 |
| **AI 图片编辑** | 选中图片 + 提示词 → 局部重绘、去背景、超分辨率 |
| **AI 扩图** | 选择方向自动扩展画面内容 |
| **AI 文生视频** | Veo / Sora 文字生成视频，支持多宽高比 |
| **AI Agent** | 多角色 Agent 群聊协作（创意总监、提示词工程师、风格大师等），讨论后自动出图 |
| **滤镜/调色** | 亮度、对比度、饱和度、色调、模糊、复古等实时调节 |
| **图层蒙版** | 非破坏性遮罩，画笔擦除/恢复 |
| **批量生成** | 一次生成 2/4 张方案，对比选择 |
| **提示词润色** | 一键 LLM 自动优化提示词 |
| **@引用** | 输入框 `@` 引用画布元素作为参考图 |
| **角色锁定** | 锁定角色外观，后续生成保持一致 |
| **素材库** | 角色/场景/道具分类管理，拖入画布复用 |
| **多 Provider** | Google、OpenAI、DeepSeek、MiniMax、火山引擎、Qwen 等 12+ Provider |
| **Key 自动识别** | 粘贴 API Key 自动识别 Provider + 拉取可用模型 |
| **A/B 对比** | 拖拽滑块对比两张图片 |
| **中英双语** | 界面中文 / English 自由切换 |
| **亮暗主题** | 亮色 / 暗色主题自适应 |

---

## 📋 开发计划

### 已完成 ✅
- [x] 无限画布 + 基础设计工具
- [x] 多 Provider BYOK 系统（12+ Provider）
- [x] AI 文生图 / 图生图 / 文生视频
- [x] Multi-Agent 协作群聊
- [x] 滤镜/调色/图层蒙版
- [x] AI 局部重绘 / 扩图
- [x] 用量监控 + Key 批量管理
- [x] 浏览器扩展 MVP
- [x] Docker 部署

### 进行中 🚧
- [ ] App.tsx 模块化拆分（hooks 抽离：useCanvas / useGeneration / useElements / useMask）
- [ ] Chrome / Edge 商店上架
- [ ] 扩展端 API Key 加密存储 + 删除同步
- [ ] ComfyUI / RunningHub 集成（本地模型）

### 规划中 📝
- [ ] LangGraph.js Agent 编排 + 自定义 Skills（类 GPTs）
- [ ] Agent 工作流可视化编排
- [ ] Canvas 2D / WebGL 画布迁移（Konva.js / PixiJS）
- [ ] 多页面/画板导航
- [ ] AI 短剧一键生图流水线
- [ ] 实时协作（多人编辑）
- [ ] 移动端适配
- [ ] 插件市场

---

## 🤝 参与贡献

1. Fork 本仓库
2. 创建分支 `git checkout -b feature/xxx`
3. 提交更改 `git commit -m 'Add xxx'`
4. 推送 `git push origin feature/xxx`
5. 提交 Pull Request

> [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

---

## ⭐ Star

如果 Flovart 对你有帮助，给个 Star ⭐ 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=Paker-kk/Flovart&type=Date)](https://star-history.com/#Paker-kk/Flovart&Date)

---

## 📄 协议

本项目基于 [Apache License 2.0](./LICENSE) 开源。

使用本产品即表示同意 [使用条款](./TERMS_OF_SERVICE.md) 和 [隐私政策](./PRIVACY_POLICY.md)。
