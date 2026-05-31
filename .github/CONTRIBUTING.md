# 贡献指南 | Contributing Guide

[English](#english) | [中文](#中文)

---

## 中文

感谢你有兴趣为 **Making** 做出贡献！这是一个类 Lovart 的画面白板工具，我们欢迎所有形式的贡献。

### 🌟 如何贡献

#### 1. 报告 Bug

如果你发现了 Bug，请：
- 在 [Issues](../../issues) 中搜索，确保该问题尚未被报告
- 创建新 Issue，使用 Bug 报告模板
- 提供详细信息：
  - 复现步骤
  - 预期行为 vs 实际行为
  - 浏览器和操作系统版本
  - 截图或错误日志（如果适用）

#### 2. 提出新功能

想要新功能？我们很乐意听取你的想法！
- 创建一个 Feature Request Issue
- 描述功能的使用场景和预期效果
- 如果可以，提供设计稿或参考案例

#### 3. 提交代码

我们欢迎 Pull Request！请遵循以下流程：

**步骤：**

1. **Fork 本仓库**
   ```bash
   # 点击页面右上角的 "Fork" 按钮
   ```

2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/your-username/Making.git
   cd Making
   ```

3. **创建特性分支**
   ```bash
   git checkout -b feature/amazing-feature
   # 或者 fix/bug-name
   ```

4. **安装依赖**
   ```bash
   npm install
   ```

5. **进行修改**
   - 遵循现有代码风格
   - 确保代码通过 ESLint 检查
   - 如果添加新功能，请更新文档

6. **测试你的修改**
   ```bash
   npm run dev       # 启动开发服务器测试
   npm run lint      # 检查代码规范
   npm run build     # 确保能正常构建
   ```

7. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加某某功能"
   # 或 "fix: 修复某某问题"
   ```

   **提交信息规范：**
   - `feat:` 新功能
   - `fix:` Bug 修复
   - `docs:` 文档更新
   - `style:` 代码格式调整（不影响功能）
   - `refactor:` 代码重构
   - `perf:` 性能优化
   - `test:` 测试相关
   - `chore:` 构建/工具配置

8. **推送到你的 Fork**
   ```bash
   git push origin feature/amazing-feature
   ```

9. **创建 Pull Request**
   - 访问你的 Fork 页面
   - 点击 "New Pull Request"
   - 填写 PR 描述，说明改动内容
   - 等待 Review

### 📝 代码规范

- 使用 **TypeScript** 编写代码
- 遵循 **ESLint** 配置的代码风格
- 组件使用 **函数式组件** + **Hooks**
- 保持代码简洁、注释清晰
- 变量命名使用 camelCase（驼峰）
- 组件命名使用 PascalCase（帕斯卡）

### 🎯 开发建议

#### 项目核心功能区域

1. **灵感库系统** (`components/InspirationPanel.tsx`, `utils/assetStorage.ts`)
   - 这是项目的核心特色功能
   - 任何改进或优化都非常欢迎

2. **AI 集成** (`services/geminiService.ts`)
   - 基于 Gemini API
   - 欢迎优化提示词或添加新的 AI 功能

3. **画布系统** (基于 BananaPod / Nano Banana)
   - 无限画布的核心功能
   - 建议熟悉 BananaPod 和 Nano Banana 的设计模式

4. **UI 组件** (`components/`)
   - 类 Lovart 的设计风格
   - 保持简洁、优雅的视觉效果

#### 本地开发

```bash
# 启动开发服务器（热重载）
npm run dev

# 代码检查
npm run lint

# 类型检查
npm run type-check

# 构建生产版本
npm run build
```

### 🔑 API Key 说明

开发时如果需要测试 AI 功能：
- 创建 `.env.local` 文件
- 添加你自己的 Gemini API Key
- 从 [Google AI Studio](https://ai.google.dev/) 免费获取

```env
GEMINI_API_KEY=你的API密钥
```

### 🤝 社区准则

请阅读我们的 [行为准则](CODE_OF_CONDUCT.md)，确保友好、尊重的交流环境。

### 📜 许可证

提交贡献即表示你同意你的代码将以 [AGPL-3.0-only](LICENSE) 发布。

### 💬 需要帮助？

- 查看 [README.md](README.md) 了解项目详情
- 查看 [Issues](../../issues) 寻找现有讨论
- 创建新 Issue 提问
- 联系维护者

---

## English

Thank you for your interest in contributing to **Making**! This is a Lovart-style canvas whiteboard tool, and we welcome all forms of contributions.

### 🌟 How to Contribute

#### 1. Report Bugs

If you find a bug:
- Search [Issues](../../issues) to ensure it hasn't been reported
- Create a new Issue using the Bug Report template
- Provide detailed information:
  - Steps to reproduce
  - Expected vs actual behavior
  - Browser and OS version
  - Screenshots or error logs (if applicable)

#### 2. Suggest Features

Have ideas for new features? We'd love to hear them!
- Create a Feature Request Issue
- Describe use cases and expected outcomes
- Provide mockups or reference examples if possible

#### 3. Submit Code

We welcome Pull Requests! Please follow this workflow:

**Steps:**

1. **Fork the repository**
   ```bash
   # Click the "Fork" button at the top right
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/Making.git
   cd Making
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   # or fix/bug-name
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Make your changes**
   - Follow existing code style
   - Ensure code passes ESLint checks
   - Update documentation if adding features

6. **Test your changes**
   ```bash
   npm run dev       # Start dev server for testing
   npm run lint      # Check code style
   npm run build     # Ensure it builds successfully
   ```

7. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add some feature"
   # or "fix: fix some bug"
   ```

   **Commit message conventions:**
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation updates
   - `style:` Code formatting (no functional changes)
   - `refactor:` Code refactoring
   - `perf:` Performance improvements
   - `test:` Testing related
   - `chore:` Build/tool configuration

8. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

9. **Create a Pull Request**
   - Visit your fork's page
   - Click "New Pull Request"
   - Fill in PR description explaining changes
   - Wait for review

### 📝 Code Standards

- Write code in **TypeScript**
- Follow **ESLint** configuration
- Use **functional components** + **Hooks**
- Keep code clean with clear comments
- Use camelCase for variables
- Use PascalCase for components

### 🎯 Development Tips

#### Core Feature Areas

1. **Inspiration Library System** (`components/InspirationPanel.tsx`, `utils/assetStorage.ts`)
   - Core feature of this project
   - Improvements and optimizations welcome

2. **AI Integration** (`services/geminiService.ts`)
   - Based on Gemini API
   - Welcome prompt optimizations or new AI features

3. **Canvas System** (Based on BananaPod / Nano Banana)
   - Core infinite canvas functionality
   - Suggest familiarizing with BananaPod and Nano Banana's design patterns

4. **UI Components** (`components/`)
   - Lovart-inspired design style
   - Maintain clean, elegant visual effects

#### Local Development

```bash
# Start dev server (hot reload)
npm run dev

# Code linting
npm run lint

# Type checking
npm run type-check

# Build for production
npm run build
```

### 🔑 API Key Notes

For testing AI features during development:
- Create `.env.local` file
- Add your own Gemini API Key
- Get it free from [Google AI Studio](https://ai.google.dev/)

```env
GEMINI_API_KEY=your-api-key
```

### 🤝 Community Guidelines

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a friendly, respectful environment.

### 📜 License

By submitting contributions, you agree your code will be released under the [AGPL-3.0-only](LICENSE).

### 💬 Need Help?

- Check [README.md](README.md) for project details
- Browse [Issues](../../issues) for existing discussions
- Create a new Issue to ask questions
- Contact maintainers

---

<div align="center">

**Thank you for contributing to Making! 🎨**

Made with ❤️ by the community

</div>

