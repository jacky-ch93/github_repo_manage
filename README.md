# GitHub Repo Manage

一个用于 GitHub Pages 的静态仪表盘，用来统计账号下代码仓的学术领域、大小、可见性、语言、归档状态、fork 状态，以及默认分支中可检测到的 Git LFS 指针文件体积。

## 功能

- 顶部总览：仓库总数、Public 数、Private 数、总仓库大小、默认分支 LFS 指针体积
- 学术分类：根据仓库描述、README、topic、语言和文件结构自动生成最多 3 个领域标签
- 仓库列表：搜索，并按可见性、仓库来源、语言和学术领域筛选
- 仓库排序：按更新时间、仓库大小、LFS 体积或名称排序
- 自动更新：GitHub Actions 支持手动触发和每日定时刷新

## 本地生成数据

需要先登录 GitHub CLI，或提供 token：

```bash
export GITHUB_TOKEN=ghp_xxx
export GITHUB_OWNER=your-github-login
node scripts/fetch-github-repos.mjs
```

生成结果会写入 `data/repos.json`。

## 学术领域分类

分类器读取仓库名、描述、topic、README、主语言和默认分支文件路径，并对命中信号加权。每个仓库按得分最多保留 3 个学术领域；没有达到最低置信度时归入“其他计算领域”。

分类体系定义在 `config/academic-taxonomy.json`。每个领域可以配置 topic、仓库名、强关键词、一般关键词、文件路径和语言信号：

```json
{
  "name": "计算机视觉",
  "minScore": 4,
  "match": {
    "topics": ["computer-vision", "object-detection"],
    "names": ["vision", "detect", "pose"],
    "strongKeywords": ["computer vision", "计算机视觉", "目标检测"],
    "keywords": ["opencv", "image processing"],
    "files": ["(^|/)vision/", "opencv"]
  }
}
```

权重从高到低依次为 topic、仓库名、描述、文件路径和 README。语言只作为弱信号，不会单独决定分类。

## GitHub Pages 部署

1. 把本仓库推到 GitHub。
2. 在仓库 Settings -> Secrets and variables -> Actions 中添加 `REPO_STATS_TOKEN`。
3. token 权限建议：
   - fine-grained token：选择目标账号/组织下的仓库，开启 Metadata read-only、Contents read-only
   - 如果需要 private 仓库统计，token 必须能读取 private repo metadata/content
4. 在 Actions 页面手动运行 `Update repository stats`，或等待每日自动更新。
5. 在 Settings -> Pages 中选择 `GitHub Actions` 作为发布来源。

## CI 数据刷新

`.github/workflows/update-data.yml` 会在 CI 中执行完整扫描：

- `workflow_dispatch`：手动触发，可选择是否扫描 LFS，以及每个仓库最多检查多少个 LFS pointer 候选文件；学术分类始终读取 README 和文件树
- `schedule`：每天 UTC 02:18 自动刷新
- `push`：只部署仓库里已提交的 `data/repos.json`，不重新扫描 GitHub API
- 生成 `data/repos.json` 后，如果数据变化，CI 会自动提交并部署 GitHub Pages
- CI job 设置了 30 分钟超时，避免大仓库或 API 变慢时长期挂起

如果只想快速刷新仓库数量、public/private、语言和大小，手动运行时把 `scan_lfs` 设为 `false`。
关闭 LFS 扫描时会保留已有 LFS 统计，不会清零历史结果。

## 关于 LFS 统计

GitHub API 不直接提供每个仓库的完整 LFS 存储用量。本项目默认统计的是默认分支文件树中能识别到的 Git LFS pointer 文件，并把 pointer 内记录的真实文件大小累加。

这意味着：

- 能反映当前默认分支引用的 LFS 文件体积
- 不等同于 GitHub 账单中的完整 LFS 存储量
- 不包含历史版本、其他分支、已删除但仍占用存储的 LFS 对象
- 默认每个仓库最多检查 120 个候选 pointer，可通过 `LFS_POINTER_SCAN_LIMIT` 调整
- CI 手动运行时可把 `scan_lfs` 设为 `false`，跳过 LFS 扫描
