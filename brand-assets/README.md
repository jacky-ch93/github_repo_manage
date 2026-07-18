# Repo Index 品牌资产

Repo Index 的视觉系统面向代码仓库管理、开发者工具和内部资产页面。核心原则是数据优先、结构清晰、状态可辨。

## 目录

- `logos/repo-index-mark.svg`：默认彩色标志，用于浅色背景和 favicon
- `logos/repo-index-mark-mono.svg`：单色标志，用于深色或单色场景
- `icons/search.svg`：Lucide 风格搜索图标，用于表单控件
- `colors.json`：供设计工具、脚本和其他技术栈读取的品牌配色
- `tokens.css`：颜色、字体、圆角、阴影和动效 Token
- `components.css`：基础排版和通用界面组件，内部自动引入 `tokens.css`

## 在其他页面中复用

直接引入组件基础样式，再引入页面自己的样式：

```html
<link rel="stylesheet" href="./brand-assets/components.css" />
<link rel="stylesheet" href="./your-page.css" />
```

只需要 Token 时，可以单独引入：

```css
@import "./brand-assets/tokens.css";
```

基础层提供以下稳定接口：

- 颜色与尺寸 token：所有 `--ri-*` CSS 变量
- 品牌组合：`.brand-lockup`、`.brand-mark`、`.brand-name`、`.brand-product`
- 按钮：`.ri-button`，以及 `.primary` 变体
- 表单：`.ri-field`
- 状态标签：`.ri-badge`，以及 `.success`、`.info`、`.warning`、`.danger`
- 章节标签：`.ri-kicker`
- 无障碍隐藏文本：`.ri-visually-hidden`

业务页面应优先使用 token，不直接复制色值。新增语义色时，应同时提供默认色与浅色背景色。

## 视觉规则

- 工作台页面使用暖灰画布和白色数据表面，主要操作使用 Index Blue。
- 数据状态使用绿色，私有或敏感状态使用琥珀或珊瑚色。
- 卡片圆角不超过 `7px`，避免装饰性大圆角。
- 中文正文使用系统无衬线字体，数据、时间和英文微标签使用等宽字体。
- 大字号只用于页面级标题，面板与卡片标题保持紧凑。
- 动效仅用于反馈，不改变布局；遵循 `prefers-reduced-motion`。
