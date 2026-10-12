# 在 macOS 上开发和部署

## 环境与依赖

使用 macOS 13.5 或更高版本；这是 [Cloudflare Wrangler 的系统要求](https://developers.cloudflare.com/workers/wrangler/install-and-update/)。Apple 芯片 Mac 选择 arm64，Intel Mac 选择 x64。

从 [Node.js 官方下载页](https://nodejs.org/en/download) 安装 Node.js 24 LTS。项目要求 Node.js 至少 22.13.0；使用 24 LTS 与本次 Windows 构建验证环境的主版本一致。

打开 Mac 的“终端”，检查版本并安装项目固定的 pnpm：

```bash
node --version
npm install --global pnpm@11.25.0
pnpm --version
```

pnpm 应显示 `11.25.0`。版本以 `package.json` 的 `packageManager` 为准；[pnpm 官方兼容表](https://pnpm.io/installation)确认 pnpm 11 支持 Node.js 22 和 24。如果全局安装出现 `EACCES`，可通过 Node.js 版本管理器安装到自己的用户目录；Wrangler 官方安装文档推荐这类方式。

在终端进入解压后的源码目录，然后安装依赖：

```bash
cd "$HOME/Downloads/启点-Mac迁移包/local/venture-mentor-team-test"
pnpm install --frozen-lockfile
```

按实际解压位置调整 `cd` 路径。Mac 需要重新安装自己的 `workerd`、`sharp` 等原生依赖，不能沿用 Windows 的 `node_modules`。保留现有锁文件与 `pnpm-workspace.yaml`。这里直接使用 `pnpm install`；`install:ci` 和部分 `scripts/*.sh` 是 Linux 托管环境的安装辅助脚本，依赖 GNU 工具，不适用于 Mac 的常规安装。

## 本地运行

当前支持邮箱和测试码共用入口。第一次使用邮箱功能前执行 `pnpm run build`、`pnpm run db:migrate:local`；完整步骤见 [邮箱与测试码登录.md](邮箱与测试码登录.md)。输入完整邮箱后才显示密码，输入测试码直接进入原项目。

本地配置与线上 Cloudflare Secret 分开保存。第一次运行时复制示例，然后用纯文本编辑器填写 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
```

如果 `.dev.vars` 已存在，直接编辑，不要重复复制。需要填写：

```dotenv
TAVILY_API_KEY="你的 Tavily API Key"
DEEPSEEK_API_KEY="你的 DeepSeek API Key"
SESSION_SECRET="至少24位随机字符串"
TEST_ACCESS_CODES='{"owner":"至少16位随机测试码"}'
```

可分别运行下面的命令生成会话密钥与测试码，两项使用不同的随机结果：

```bash
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

不使用联网搜索时可以暂时留空 `TAVILY_API_KEY`。导师回复需要有效的 `DEEPSEEK_API_KEY`。`.dev.vars` 已被 Git 忽略。Cloudflare 的本地配置方式见[环境变量和密钥文档](https://developers.cloudflare.com/workers/local-development/environment-variables/)。

先构建，生成 Wrangler 配置；仅在全新的本地数据库上执行一次建表：

```bash
pnpm run build
pnpm exec wrangler d1 execute venture-mentor-team-test --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_motionless_firebird.sql
pnpm run dev
```

每条命令成功后再运行下一条。打开 `http://localhost:5173`，输入 `.dev.vars` 中 `owner` 对应的测试码。停止服务使用 Control-C。之后启动只需 `pnpm run dev`；不要重复建表。

本地数据库保存到 `.wrangler/state/`，与现有线上数据库分开；这符合 [Cloudflare D1 本地开发方式](https://developers.cloudflare.com/d1/best-practices/local-development/)。本地页面初次运行看不到线上聊天与项目记录。查看既有线上数据可继续访问现有网站并使用原测试码。

## 检查源码

项目的 6 项现有检查都可以在终端运行，不消耗真实 DeepSeek 或 Tavily 额度：

```bash
pnpm run test:logic
pnpm run test:search
pnpm run test:materials
pnpm run test:records
pnpm run test:panel
pnpm run test:deploy-config
```

## 更新现有网站

首次在这台 Mac 上部署，登录拥有现有 Worker 与 D1 的同一个 Cloudflare 账号：

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

核对账号后运行 Mac 部署脚本：

```bash
bash deploy-and-smoke.sh
```

脚本从现有构建或 `config/deployment.json` 读取数据库 ID，依次运行 6 项测试、构建并核对数据库 ID，再部署到已有 Worker，最后检查配置中的公开网址。测试、构建或数据库核对失败时停止。Windows 继续使用原 `deploy-and-smoke.cmd`。

现有 Worker 的 DeepSeek、Tavily、会话及测试码 Secret 继续由 Cloudflare 保存。本次迁移无需重新创建 D1、执行远程建表或重新填写这些 Secret。部署后用原网址和测试码检查导师回复、确认保存与刷新后记录：

[启点团队测试网站](https://venture-mentor-team-test.jerry-mentor-test.workers.dev/)

## 继续使用 Git

如果还没有 Git，运行 `git --version`，按照 macOS 提示安装命令行工具。迁移包中已经保留提交历史，并清除了 Windows 专用 SSH 路径。检查：

```bash
git status
git remote -v
```

推送前设置自己的提交姓名与邮箱，并完成 GitHub 的 HTTPS 身份验证。源码仓库仍在项目目录内；上层 `资料/` 是单独迁移的原始文档。
