# Flovart Logo — Midjourney 提示词方案

> 生成于 2026-04-16 | Skills 联动: flovart + midjourney-prompt
> 风格要求: 黑白极简・猫+苹果・品牌LOGO

---

## 变体 1: 负空间（推荐）

```
Minimalist logo mark, a sleek cat silhouette sitting inside the outline of an apple, 
negative space design where the cat's body forms the apple's inner void, 
single weight black ink on pure white background, 
inspired by Paul Rand and Saul Bass logo design philosophy, 
clean vector aesthetic, no gradients, no shading, 
geometric precision with organic curves, 
perfectly balanced visual weight, professional brandmark quality
--ar 1:1 --v 8.1 --s 50 --raw --no text watermark gradient color shading realistic
```

## 变体 2: 一笔画

```
Single continuous line logo, one unbroken stroke forming both a sitting cat 
and an apple simultaneously, minimalist monoline design, 
the cat's ears become the apple's leaf, the tail curves into the apple's stem, 
black line on white background, uniform stroke width, 
screen-printed aesthetic on cotton paper with slight fiber texture, 
elegant simplicity, modern tech brand identity
--ar 1:1 --v 8.1 --s 30 --raw --no text watermark gradient color shading realistic
```

## 变体 3: 几何双关

```
Geometric minimalist logo, clever visual pun where a cat face and an apple 
share the same circular form, two pointed ears that double as leaves, 
whiskers that suggest the apple's calyx, matte black solid shape on white, 
Swiss Style graphic design, grid-based construction, 
Dieter Rams less-is-more philosophy, flat vector brandmark, 
corporate identity quality
--ar 1:1 --v 8.1 --s 40 --raw --no text watermark gradient color shading realistic
```

## 变体 4: 圆形印章

```
Circular stamp logo, a cat curled around an apple in a round seal composition, 
sumi-e ink wash influence with modern minimalism, 
high contrast black on white, cat's tail wraps protectively around the fruit, 
Japanese mon (家紋) inspired symmetry, 
risograph print texture with slight grain, 
timeless emblem design suitable for app icon
--ar 1:1 --v 8.1 --s 60 --raw --no text watermark gradient color realistic
```

## 变体 5: 咬痕错觉（最具创意）

```
Ultra-minimalist logo, solid black apple silhouette with a bite taken out, 
the bite mark reveals the profile of a cat's face in negative space, 
one ear, one eye, whiskers visible in the missing piece, 
stark black and white contrast, no gradients, 
influenced by Noma Bar illustration style, optical illusion design, 
letterpress printed on heavy stock paper, 
subtle deboss texture, professional identity mark
--ar 1:1 --v 8.1 --s 50 --raw --no text watermark gradient color shading realistic
```

---

## 使用说明

### 方式 A: MJ Discord / Alpha 网站
直接复制任一变体的提示词到 Midjourney。

### 方式 B: 通过 RunningHub API
如果已配置 RunningHub API Key（支持 MJ 节点），可通过 `runninghub-api` skill 或 Flovart 内的 RunningHub service 提交。

### 方式 C: 通过 Flovart Canvas
1. 打开 Flovart Canvas
2. 在 PromptBar 粘贴提示词
3. 选择 RunningHub 中的 Midjourney 模型
4. 点击生成

### 建议工作流
1. 先跑变体 1 和变体 5（最可能出好效果的两个）
2. 选最好的一张做 `--v 8.1 --q 4`（超高质量重跑）
3. 用 Flovart 的 upscale 功能放大到需要的分辨率
4. 导出为 SVG（如需矢量化，用 Vectorizer.AI 或 Adobe Trace）

### 参数说明
- `--s 30~60`: 低风格化，让 MJ 更忠实执行（LOGO 不需要创意发散）
- `--raw`: 关闭默认美化，产出更"设计感"而非"AI美图"
- `--no text watermark gradient color shading realistic`: 强力排除彩色/写实/文字干扰
