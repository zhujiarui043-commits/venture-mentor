# 启点 · AI 创业导师

面向早期创业者的 AI 创业验证工作台。它把项目定义、用户研究、假设管理、竞品分析、创意诊断和商业模式梳理集中在一个可持续记录的工作空间里，帮助创业者把模糊想法逐步转化为可验证的行动。

## 主要功能

- **AI 创业导师**：基于当前项目状态进行连续对话，识别任务并生成结构化成果。
- **项目定义**：整理目标用户、问题、解决方案、替代方式、商业化方向和执行限制。
- **用户研究**：支持访谈、问卷和 MVP 测试材料的上传、解析、分析与 Word 导出。
- **假设与证据**：按材料原文评估假设，保存来源、版本、引用、限制和下一步验证行动。
- **八维创意诊断**：根据诊断标准生成 0–4 分维度评分、判断依据和优先级。
- **竞品洞察**：连接 Tavily 搜索，保存网页来源、摘录、比较结果和后续修订记录。
- **商业模式画布**：围绕客户、价值、渠道、关系、收入、资源、活动、伙伴和成本进行整理。
- **分析记录**：各模块独立编号，保留历史版本、来源和可追溯证据。
- **账号体系**：兼容测试码登录，也支持邮箱注册、恢复码找回和独立项目空间。

## 技术栈

Next.js、React、TypeScript、Vite/Vinext、Cloudflare Workers、Cloudflare D1、Drizzle ORM、Tailwind CSS、DeepSeek API、Tavily Search API。

## 本地运行

环境要求：Node.js 22.13.0 或更高版本，pnpm 11。

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm run build
pnpm run db:migrate:local
pnpm run dev
```

访问终端输出的本地地址。`.dev.vars` 只保存在本地，用于配置 `DEEPSEEK_API_KEY`、`TAVILY_API_KEY`、`SESSION_SECRET` 和测试码等变量，绝不要提交到 Git。

Mac 的完整安装和部署说明见 [docs/MACOS.md](docs/MACOS.md)，账号使用说明见 [docs/邮箱与测试码登录.md](docs/邮箱与测试码登录.md)。

## 常用命令

```bash
pnpm run dev                 # 本地开发
pnpm run build               # 构建
pnpm run lint                # 静态检查
pnpm run test:logic          # 核心逻辑回归
pnpm run test:search         # 竞品搜索回归
pnpm run test:diagnosis      # 创意诊断回归
pnpm run test:materials      # 材料解析回归
pnpm run test:records        # 分析记录回归
pnpm run test:word-export-ui # Word 导出回归
pnpm run db:migrate:local    # 本地数据库迁移
```

完整测试脚本见 [`package.json`](package.json)。

## 部署

项目面向 Cloudflare Workers 部署，并使用 Cloudflare D1 保存项目数据。确认本地构建和回归检查通过后，可运行：

```bash
bash deploy-and-smoke.sh
```

部署前请确认 Cloudflare 登录状态、D1 数据库配置和 Worker Secrets 已准备好。脚本会读取已有部署配置、构建项目并执行部署检查。Windows 用户可使用 `deploy-and-smoke.cmd`。

## 项目结构

```text
app/          页面、样式和 API 路由
components/   React 界面组件
lib/          AI 工作流、业务逻辑和材料处理
db/           数据库连接与结构
drizzle/      数据库迁移
knowledge/    创业方法与诊断规则
scripts/      构建、迁移和部署辅助脚本
tests/        逻辑、接口和浏览器回归测试
docs/         开发、部署和账号说明
```

## 数据与安全

项目记录保存在 D1 中，测试码和邮箱账号使用不同的项目归属方式。API 密钥只应存放在本地变量文件或 Cloudflare Worker Secrets 中。原始知识库、数据库、密钥、依赖目录和构建产物不属于公开源码的一部分。

## 状态

这是一个用于创业验证的功能测试版。AI 输出用于整理信息、提出假设和安排验证行动，不代表已经验证的市场结论，也不能替代真实用户研究、财务判断或专业意见。

## License

当前仓库未声明开源许可证，代码使用范围以仓库所有者的授权为准。
