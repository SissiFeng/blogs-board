# 博间 · 独立博客阅读室

为个人阅读设计的中文博客聚合网站。来源为 [timqian/chinese-independent-blogs](https://github.com/timqian/chinese-independent-blogs)，初始目录含 1,550 个真实博客。首页采用响应式卡片布局，支持明暗主题、主题过滤、关键词搜索（标题、博客名、主题与摘要）、收藏、已读和站内纯文字阅读。

源码仓库：[SissiFeng/blogs-board](https://github.com/SissiFeng/blogs-board)。初始数据仅有真实博客目录；首次提交抓取程序时会自动运行更新，之后每 6 小时检查一次。Cloudflare Pages 是否已上线，以控制台部署状态为准。RSS/Atom 解析和断网保留数据的测试已通过。

## 方案与费用

GitHub Actions 每 6 小时从上游 CSV 同步目录，并抓取所有提供 RSS 的博客；更新静态 JSON 后提交到你的仓库，由 Cloudflare Pages 的 Git 集成自动部署。无需数据库、服务器、Cloudflare API Token 或付费 AI。

- 使用 **Cloudflare Pages Free** 和免费的 `*.pages.dev` 域名。每天 4 次更新约每月 120–124 次部署；当前免费额度为每月 500 次构建。见 [Cloudflare Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)。你账号其他 Pages 项目也会使用额度。
- 采用公开 GitHub 仓库可使用标准托管 runner 的公共仓库免费配额。私有仓库受你的 GitHub Actions 分钟数配额约束；抓取 1,550 个博客的用时取决于超时站点数，因此不能保证私人仓库的分钟数够用。见 [GitHub Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。不需要开通任何付费产品。
- 内容每 6 小时检查，不是实时推送，GitHub 调度可能延迟。前台“重新载入”仅重新获取已生成的数据，不触发抓取。
- 默认保留按发布时间排序最近 3,000 篇在架文章，每篇正文至多 16,000 字符。较早文章会移出列表，避免无限占用空间。已打开后收藏的文章含正文，会保存在当前浏览器。
- 摘要直接提取 RSS 内容，不做 AI 改写。源只提供摘要时，需要打开原文阅读全文。无 RSS 的博客保留在目录中；失效 RSS 不会导致其他来源停止更新。

## 当前部署：Cloudflare Workers 静态网站

本仓库的 `wrangler.toml` 已配置 Workers Static Assets，适配控制台创建的 `blogs-board` Worker：

- 构建命令：留空（若必须填写，用 `exit 0`）。
- 部署命令：`npx wrangler deploy`。
- 根目录：仓库根目录。
- 生产分支：`main`。
- 静态目录：`public`，由 `[assets]` 声明，无需 Worker 脚本入口或数据库。

Git 更新后由已连接的 Workers Builds 自动部署，首次失败后请确认新构建使用最新提交。保留 Workers Free 方案即可；静态资源的费用与限制参见 [官方说明](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。GitHub Actions 抓取方案与阅读功能不变。

### 如需改用 Pages

下面是另一种部署方式。当前项目已使用 Workers，不必重新创建 Pages。若以后迁移，请先把 `wrangler.toml` 的 `[assets]` 两行删除，改为顶层 `pages_build_output_dir = "public"` 后再按下列步骤操作。

## 部署到 Cloudflare Pages（替代方案）

1. 源码已准备提交到 `SissiFeng/blogs-board` 的 `main` 分支，包含 `.github` 定时更新配置。
2. 打开仓库的 **Actions → Update reading library → Run workflow**，在默认分支运行第一次更新。等待任务完成，确认提交出现，且 `public/data/index.json` 的 `articles` 不再为空。有些站点可能失效，目录会显示状态。
3. 在 [Cloudflare 控制台](https://dash.cloudflare.com/) 进入 **Workers & Pages → Create application → Pages → Connect to Git**，连接刚才的仓库。
4. 构建配置：Framework preset 选 **None**；Build command 填 `exit 0`；Build output directory 填 **public**；Root directory 保持仓库根目录。生产分支选择仓库默认分支。`wrangler.toml` 同样声明了输出目录，不需要安装 Node 依赖。
5. 点击部署，访问 Cloudflare 返回的真实 `https://项目名.pages.dev` 地址。之后 Actions 的更新提交会触发自动部署。

如果通过 Git 命令上传，在此项目目录执行，并把下方示例 URL 换成你的真实空仓库：

```sh
git init -b main
git add .
git commit -m "Create Blog Harbor reader"
git remote add origin https://github.com/SissiFeng/blogs-board.git
git push -u origin main
```

如果仓库禁用了工作流写权限，在 **Settings → Actions → General → Workflow permissions** 允许 Read and write permissions。工作流中已声明 `contents: write`。

GitHub 公共仓库的计划任务可能因长期没有活动而暂停；若停止更新，在 Actions 重新启用工作流并手动运行。见 [定时事件说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

## 关于“自己看”

收藏与已读只存在你当前浏览器的 localStorage，抓取程序不会上传你的阅读行为。换设备、清理浏览器数据或更换域名后不会自动同步；可用侧栏的导出/导入迁移 JSON 备份。

静态网站默认可被知道网址的人访问；`robots.txt` 仅请求搜索引擎不收录，并不构成访问控制。如果要求“只有自己能访问”，需在 Cloudflare Access 中对实际访问域名配置仅允许自己邮箱的策略，并检查生产地址、预览地址、`/data/index.json` 和 `/data/articles/*` 均被保护，不能只保护首页或只开启预览部署保护。如果使用自定义域名，还要避免公开的 `pages.dev` 地址绕过。见 [Cloudflare Access 应用配置](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) 与 [Pages 预览部署访问控制](https://developers.cloudflare.com/pages/configuration/preview-deployments/)。

公开 GitHub 仓库中的抓取数据仍是公开的；如需将聚合数据本身也保密，使用私有仓库并关注 Actions 免费分钟数。请勿在仓库或聊天中粘贴任何 API Token。

## 本地运行与检查

修改抓取程序、测试或更新工作流并推送到 main 时，也会自动更新；纯数据提交不重复触发抓取。

只需要 Python 3.12+；前端是原生 HTML/CSS/JS，没有 npm 依赖。

```sh
python3 -m unittest discover -s tests -v
node --check public/app.js
python3 scripts/update.py
python3 -m http.server 8000 --directory public
```

打开 `http://localhost:8000`。不要用 `file://` 打开首页，浏览器会拦截本地 JSON 请求。

抓取程序使用标准库解析 RSS 2.0、RSS 1.0 和 Atom，拒绝 DTD/实体声明，输出转为纯文字，前端额外转义所有外部数据。每次并发抓取 16 个站点，单次请求超时 10 秒，单个 RSS 限制 2MB；使用 ETag / Last-Modified 节约流量。抓取失败会保留已有文章和最后成功时间，并更新来源错误状态。上游目录异常时继续使用原目录。

## 文件

- `public/`：可直接部署的静态网站。
- `scripts/update.py`：上游目录同步与 RSS/Atom 抓取。
- `scripts/catalog.csv`：交付时从上游获得的真实目录快照，留作核对；日常更新直接读取上游，不读此快照。
- `.github/workflows/update.yml`：6 小时更新任务，可手动触发。
- `tests/test_update.py`：解析、过滤、稳定 ID、正文截断与断网数据保留测试。

文章版权属于原作者；网站始终保留原文链接与博客来源。
