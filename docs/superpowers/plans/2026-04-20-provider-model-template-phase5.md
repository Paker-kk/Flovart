# Provider + Model Template System Phase 5 Plan

> 目标：在 Phase 1（App Shell）、Phase 2（Workflow 产品化）、Phase 3（Storyboard + VideoEdit MVP）、Phase 4（Motion + Interaction Polish）之后，补齐“多第三方 API / 多模型 / 每节点参数模板 / 能力矩阵 / 模型配置导入导出”这条主线，把产品真正升级为可扩展的多 provider 创作平台。
>
> 本阶段只做规划，不写代码。

---

## 0. 先说结论

你现在已经有：
- Provider 默认模型表：[services/aiGateway.ts:10-82](services/aiGateway.ts#L10-L82)
- API Key 验证：[services/aiGateway.ts:95-178](services/aiGateway.ts#L95-L178)
- 模型拉取：`fetchModelsForProvider`（已被 settings / aiGateway 使用）
- 动态模型选项：[hooks/useApiKeys.ts:145-182](hooks/useApiKeys.ts#L145-L182)
- Key 的 `customModels / defaultModel / models / extraConfig` 存储能力：[types.ts:184-203](types.ts#L184-L203)
- Settings UI 已经能拉模型、改默认模型、改能力：[components/CanvasSettings.tsx](components/CanvasSettings.tsx)

### 但问题在于
这些能力现在还是：

> **“以 API Key 为中心的模型管理”**

而不是：

> **“以 Provider + Model Template 为中心的运行时系统”**

这会导致：
1. 节点工作流里的 provider/model/params 还不够产品化
2. 每家 provider 的参数规则散落在代码中
3. custom provider 虽然能接，但缺乏“模板层”和 schema 层，越接越乱
4. 用户对“这个模型支持哪些能力、哪些参数、怎么配”没有统一认知

所以 P5 的核心目标不是“再接几个 provider”，而是：

> **建立统一的 Provider / Model Template System，让多 provider、多模型、多参数真正成为平台能力。**

---

## 1. P5 的目标边界

P5 完成后，产品应该具备：

1. 有统一的 **Provider Registry**
2. 有统一的 **Model Template** 数据结构
3. 每个 template 都能声明：
   - provider
   - model id
   - capability
   - 参数 schema
   - 默认参数
   - 可选参数
   - 请求模板/路由提示
4. Canvas / Workflow / Storyboard 都能复用同一套模型模板
5. Node Inspector 能根据 template 自动渲染参数表单
6. custom / third-party provider 不再只是“裸 baseUrl + model 名”，而能沉淀为模板
7. 能做模型模板导入/导出
8. 能做 provider capability matrix

### 本阶段不做
- 真正的远程模板市场
- 在线模板共享平台
- 云端同步
- 全自动从任意 provider API 推断完整 schema

---

## 2. 现有代码的核心问题诊断

## 2.1 `DEFAULT_PROVIDER_MODELS` 只适合做基础兜底
当前 [services/aiGateway.ts:10-82](services/aiGateway.ts#L10-L82) 的 `DEFAULT_PROVIDER_MODELS` 很有用，但它只表达了：
- provider 下有哪些默认 text/image/video/agent 模型

### 它没有表达：
- 每个模型支持哪些细粒度编辑能力
- 参数 schema
- 默认参数
- provider 专属字段
- 请求模板差异
- 哪些模型适用于 workflow / storyboard / video edit

### 结论
它必须保留，但不能继续充当“模型系统本体”。

---

## 2.2 `dynamicModelOptions` 是 UI 选项，不是模板系统
当前 [hooks/useApiKeys.ts:145-182](hooks/useApiKeys.ts#L145-L182) 会基于 key 和 provider 算出：
- `text`
- `image`
- `video`
可选模型列表

### 问题
这很好，但它解决的是：
- 下拉框里有哪些模型

而没有解决：
- 这个模型有哪些参数
- 这个模型支持 reference edit 吗
- 这个模型是否支持 mask edit
- 这个模型适合 story/video/workflow 哪种场景
- 这个模型的 provider-specific 参数表单是什么

### 结论
P5 必须把“选项列表”升级成“模板对象列表”。

---

## 2.3 CanvasSettings 已经有管理能力，但信息组织仍偏散
当前 [components/CanvasSettings.tsx](components/CanvasSettings.tsx) 已经做了很多：
- 验证 key
- 拉取模型
- 编辑模型列表
- 设默认模型
- 存储 `extraConfig`

### 但问题是
它仍然是围绕：
- provider
- api key
- model list

而不是围绕：
- template
- parameter schema
- capability matrix
- runtime intent

### 结论
Settings 是个很好入口，但 P5 需要把它升级成“模型模板配置中心”。

---

## 2.4 Workflow 侧缺少 schema 驱动参数层
P2 已经规划过：
- Workflow 节点需要 Inspector
- 每节点需要 provider/model/params

### 如果没有 P5
你后面会遇到：
- imageGen 节点一套 params
- videoGen 节点一套 params
- custom provider 再来一套 params
- runningHub 再来一套 params

最后所有参数 UI 都会硬编码在节点组件里。

### 结论
P5 是 P2 的真正后盾。

---

## 3. P5 的总体设计

P5 应该引入三层：

```text
Provider Registry
    ↓
Model Template Registry
    ↓
Runtime Consumers
(Canvas / Workflow / Storyboard / Settings)
```

### Provider Registry
定义：
- provider label
- baseUrl normalize rules
- capability defaults
- endpoint flavor
- auth mode

### Model Template Registry
定义：
- model identity
- capability
- params schema
- default params
- routing hint
- provider-specific behavior

### Runtime Consumers
复用这些 template：
- PromptBar
- CanvasSettings
- Workflow Inspector
- Storyboard Shot detail

---

## 4. 推荐新增的数据模型

建议在 `types.ts` 或新文件 `types/modelTemplates.ts` 中新增：

```ts
export type ModelCapability = 'text' | 'image' | 'video' | 'agent' | 'videoEdit';

export type ParamFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'json'
  | 'imageRef'
  | 'videoRef';

export interface ModelParamOption {
  label: string;
  value: string | number;
}

export interface ModelParamSchemaField {
  key: string;
  label: string;
  type: ParamFieldType;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: ModelParamOption[];
  group?: 'basic' | 'advanced' | 'provider';
}

export interface ModelTemplate {
  id: string;
  provider: AIProvider;
  model: string;
  displayName: string;
  capability: ModelCapability;

  tags?: string[];
  description?: string;

  supportsReferenceImage?: boolean;
  supportsMaskEdit?: boolean;
  supportsVideoExtend?: boolean;
  supportsVideoRestyle?: boolean;

  endpointFlavor?: 'google' | 'openai-compatible' | 'openrouter-compatible' | 'provider-native';
  paramsSchema: ModelParamSchemaField[];
  defaultParams?: Record<string, unknown>;

  requestHints?: {
    imageResponseFormat?: 'url' | 'b64_json';
    pollStrategy?: 'sync' | 'async-task';
  };
}
```

### 为什么这层重要
因为它会变成整个平台统一的“模型语义层”。

---

## 5. Provider Registry 规划

建议新增：

```text
services/providerRegistry.ts
```

定义：

```ts
export interface ProviderDefinition {
  id: AIProvider;
  label: string;
  defaultBaseUrl: string;
  endpointFlavor: 'google' | 'openai-compatible' | 'openrouter-compatible' | 'provider-native';
  defaultCapabilities: AICapability[];
  authMode: 'bearer' | 'x-api-key' | 'query-key' | 'custom';
}
```

### 它负责
- 从 `aiGateway.ts` 中收走 Provider 元信息
- 给模板系统提供 provider 语义
- 给 Settings / Workflow / Storyboard 共享 provider 标签和默认逻辑

### 你现在哪些东西适合迁进去
- `DEFAULT_BASE_URLS`，见 [services/aiGateway.ts:180-196](services/aiGateway.ts#L180-L196)
- `PROVIDER_LABELS`，见 [services/aiGateway.ts:229-246](services/aiGateway.ts#L229-L246)
- `inferCapabilitiesByProvider()` 的默认语义，见 [services/aiGateway.ts:218-227](services/aiGateway.ts#L218-L227)

---

## 6. Model Template Registry 规划

建议新增：

```text
services/modelTemplateRegistry.ts
```

### 它负责
- 内置官方模板
- 读取用户自定义模板
- 根据 capability/provider 过滤模板
- 给 UI 返回可消费的 template 列表

### 内置模板来源
第一版可以从现有：
- `DEFAULT_PROVIDER_MODELS`
- `supportsReferenceImageEditing()`
- `supportsMaskImageEditing()`
- 你已有的 provider-specific 路由逻辑

组合生成。

### 后续用户模板来源
从用户 `UserApiKey` 里的：
- `models`
- `customModels`
- `defaultModel`
- `extraConfig`
沉淀为用户模板。

---

## 7. CanvasSettings 在 P5 里的新角色

当前 [components/CanvasSettings.tsx](components/CanvasSettings.tsx) 是“API Key 管理中心”。

P5 后它要变成：

> **API Key + Provider + Model Templates 配置中心**

### 建议新增区域

#### 区块 1：Provider Keys
保留现有能力。

#### 区块 2：Model Templates
- 当前 provider 下有哪些模板
- 哪些是系统模板
- 哪些是用户模板
- 可编辑 displayName / default params / tags

#### 区块 3：Capability Matrix
- text / image / video / agent / videoEdit
- 当前 provider 和当前模板支持哪些能力

#### 区块 4：Import / Export
- 导出模板 JSON
- 导入模板 JSON

---

## 8. Workflow Inspector 在 P5 中的升级方式

P2 已规划 `NodeInspector`。

P5 后，它不应该再直接手写每种 provider 参数，而应该：

1. 先选 provider
2. 再选 template/model
3. 根据 `paramsSchema` 自动渲染字段

### 好处
- imageGen / videoGen / videoEdit 节点都能统一处理
- custom provider 也能通过 template 接入
- 以后加模型不会继续把 Inspector 写炸

### 推荐新增组件

```text
components/nodeflow/
  ModelTemplateSelect.tsx
  ModelParamSchemaForm.tsx
```

---

## 9. Storyboard 在 P5 中怎么用模板系统

Storyboard ShotDetail 在 P3 会有：
- prompt
- refs
- aspect ratio
- duration

P5 后应该进一步支持：
- 选择视频模板
- 选择图片模板
- 选择视频编辑模板
- 保存 shot 级默认模板

### 为什么有必要
因为镜头层和 workflow 层最好共享同一个模型语义系统。

否则会出现：
- Workflow 里一个模型名
- Storyboard 里另一个模型名
- PromptBar 又是一套 model options

最终会把用户搞乱。

---

## 10. 推荐的模板层级

建议做三层模板：

### 1. System Template
内置模板，不可删，可更新。

### 2. Provider Template
按 provider 归档的模板集合。

### 3. User Template
用户自定义模板：
- 自定义模型
- 自定义参数 schema
- 自定义 default params
- 自定义 display name

### 为什么需要三层
因为你未来会有：
- 官方模型
- 第三方 provider 聚合模型
- 用户自定义 one-api / proxy / runningHub / 自有 endpoint

---

## 11. custom provider 的正确升级方向

现在 custom 的逻辑主要是：
- 允许用户填 baseUrl + key + model
- 大概率走 openai-compatible

### 这不够产品化
因为用户还是要自己记：
- 这个模型支持什么
- 这个模型参数是什么
- 用哪个 response_format
- 是同步还是异步

### P5 之后应该这样
custom provider 也可以定义成模板：

```json
{
  "id": "my-oneapi-flux-dev",
  "provider": "custom",
  "model": "flux-dev",
  "displayName": "My OneAPI Flux Dev",
  "capability": "image",
  "endpointFlavor": "openai-compatible",
  "paramsSchema": [...],
  "defaultParams": {...}
}
```

### 结果
custom 就不再是“裸接口”，而是平台里的一等能力。

---

## 12. 推荐文件结构

### 新增

```text
services/providerRegistry.ts
services/modelTemplateRegistry.ts
utils/modelTemplateStore.ts
components/settings/ModelTemplateManager.tsx
components/settings/CapabilityMatrix.tsx
components/nodeflow/ModelTemplateSelect.tsx
components/nodeflow/ModelParamSchemaForm.tsx
components/storyboard/ShotTemplatePicker.tsx
types/modelTemplates.ts
```

### 修改

```text
services/aiGateway.ts
hooks/useApiKeys.ts
components/CanvasSettings.tsx
components/PromptBar.tsx
components/NodeWorkflowPanel.tsx
components/nodeflow/types.ts
services/workflowEngine.ts
types.ts
```

---

## 13. 迁移顺序建议

### Step 1：先抽 Provider Registry
把 provider label/baseUrl/default capability 收口。

### Step 2：再抽 Model Template 类型和 Registry
让系统模板先跑起来。

### Step 3：CanvasSettings 接模板管理
让用户真正能看见模板。

### Step 4：Workflow Inspector 改 schema 驱动参数
把节点参数从硬编码改成 template-driven。

### Step 5：Storyboard / PromptBar 复用模板系统
形成全产品统一模型层。

### Step 6：最后加导入导出
实现模板可携带、可分享、可备份。

---

## 14. 验证标准

P5 做完后，至少应该做到：

1. 同一个模型模板可以在 Canvas / Workflow / Storyboard 复用
2. custom provider 不再只是 baseUrl + model 字符串
3. Workflow 节点参数表单能根据模板自动生成
4. Settings 里能看到 capability matrix
5. 用户可以导入/导出模型模板
6. 新增 provider / 新增 model 的成本显著降低

---

## 15. 风险点

### 风险 1：模板和真实 provider 行为漂移
解决：
- 把 template 视为“配置层”，不是事实来源
- 真正 capability 仍以运行时验证为准

### 风险 2：把模板系统做得过重
解决：
- 第一版只做必要字段
- 不做全能 schema 平台

### 风险 3：继续和现有 `DEFAULT_PROVIDER_MODELS` 双轨失控
解决：
- `DEFAULT_PROVIDER_MODELS` 只做 bootstrap/fallback
- 最终 UI 层都读 `ModelTemplateRegistry`

---

## 16. 最后的建议

P5 的价值非常大，因为它会把你整个产品从：

> “能接很多模型”

升级成：

> “能稳定管理、表达、复用很多模型”

这是平台能力的分水岭。

如果 P1~P5 都按这条链走完，你这个产品就不再只是一个 AI 白板，而会非常接近：

- 创作工作台
- 节点工作流平台
- 镜头规划系统
- 多 provider 运行平台

这就是完整闭环。

---

## 17. 推荐的下一个规划主题

如果你还要继续往下补，最自然的 P6 是：

### P6：Execution Trace + Observability
重点做：
- workflow run trace
- provider 请求日志
- 节点级耗时 / 失败 / 重试视图
- shot / output / model 的生产追踪

因为当 provider / model template 系统起来之后，下一步一定是“可观测性”。