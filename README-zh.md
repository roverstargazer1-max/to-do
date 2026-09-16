<p align="center">
  <a href="https://kagelin.app">
    <img src="public/kagelin-icon.png" width="80" alt="Kagelin" />
  </a>
</p>

<div align="center">

# Kagelin

## 安静地工作，完整地拥有

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

## 立即使用

**[app.kagelin.app](https://app.kagelin.app)** —— 可作为 PWA 安装，访客模式下完全离线可用。无需注册账号。

_当前处于预览阶段 —— 请预期存在一些粗糙之处。_

</div>

## 界面截图

<p align="center">
  <img src="public/screenshots/board-view-desktop.webp" alt="看板视图" width="47%" />
  &nbsp;
  <img src="public/screenshots/habit-grid-desktop.webp" alt="习惯网格" width="47%" />
</p>
<p align="center">
  <img src="public/screenshots/timer-with-task.webp" alt="专注计时器" width="47%" />
  &nbsp;
  <img src="public/screenshots/calendar-monthly.webp" alt="日历月视图" width="47%" />
</p>
<p align="center">
  <img src="public/screenshots/command-pallete-desktop.webp" alt="命令面板" width="70%" /><br />
  <sub>命令面板（Ctrl/Cmd+K）</sub>
</p>

## 为什么选择 Kagelin

大多数效率应用在你还没写下第一条任务之前就先要你的邮箱，而且无论如何都把你的数据留在它们的服务器上。Kagelin 不这样。

- **无需注册。** 任务、习惯、专注、日历 —— 访客模式下全部离线可用。只有在你需要云同步时才需要账号。
- **你的数据，你的服务器。** 访客模式把所有数据留在你的设备上，并可备份到你自己的 Nextcloud、群晖或任意 WebDAV 服务器。没有中间商。
- **随时带走一切。** 加密 ZIP 导出、完整数据删除、标准 `.ics` 文件。离开永远是一个可选项。

## 功能特性

### 任务与组织

- **搜索**（`Ctrl/Cmd+K`）：跨任务、习惯与事件的即时搜索，并支持导航与操作。
- **任务视图**：看板视图与列表视图，支持二维键盘导航。
- **Vim 导航与任务操作**：`gg`/`G` 跳转，`yy` 复制，`p` 粘贴，`u` 撤销。
- **分栏视图**：桌面端列表会自动打开主从详情面板。
- **项目**：多级项目结构，支持归档与移动端抽屉。
- **分组与过滤**：按项目、优先级或截止日期分组，支持跨组拖拽。
- **重复任务**：按任务可设为严格模式（锚定于截止日期）或弹性模式（锚定于完成日期）。
- **笔记编辑器**：Markdown 格式工具栏，任务笔记实时预览。

### 工作台与可视化工作流

- **多工作台**：从侧边栏的“工作台”区域、命令面板或按 `W` 新建多个独立画布，并可分别重命名、更换颜色和删除。
- **实时引用**：把已有任务、习惯、日历事件和项目放到画布上。任务完成、习惯打卡和项目进度会跟随底层领域数据更新。移除卡片只会移除工作台节点，绝不会删除被引用的任务、习惯、事件或项目；日历事件卡片为只读展示。
- **原生规划卡片**：可添加 Markdown 文档、决策、步骤和专注卡片。文档支持编辑/预览与一键复制 Markdown；决策和步骤支持行内编辑；专注卡片控制全局共享的番茄钟。
- **分组与布局**：选择多个卡片后可按阶段或泳道打组，重命名、缩放和解散分组；也可以拖动、缩放卡片，平移/缩放画布并适应全图。节点位置和尺寸会持久化，视口会在当前设备恢复。
- **连线**：从节点右侧输出端连接到另一个节点左侧输入端，可添加/编辑标签，也可通过连线中点控件或 `Delete` 删除。连线只表示视觉布局关系，不会触发事件、安排工作、执行命令或传播运行时依赖。
- **安全降级**：如果被引用的领域实体在其他位置被删除，画布会保留节点位置并显示孤立占位卡片，移除占位不会影响其他数据。未知节点类型也会降级为可安全移除的占位卡片，以兼容未来版本。

完整的节点与拓扑规范见 [`docs/agents/workspace-node-specification.md`](docs/agents/workspace-node-specification.md)，面向用户的工作台示例见 [`docs/USER_WORKSPACE_GUIDE.md`](docs/USER_WORKSPACE_GUIDE.md)。

### 专注与习惯

- **专注计时器**：支持画中画的番茄钟引擎，可在设备间接力 —— 在一台设备上暂停，所有设备同步暂停。
- **推送通知**：由服务端派生的 Web Push 通知，用于计时完成与任务提醒（支持桌面端、Android，以及 iOS 独立 PWA）。
- **习惯追踪**：标准化追踪，含最长连续记录，支持导入 uhabits `.db` 文件。
- **紧凑习惯视图**：可点击的滚动 7 天条带，支持拖拽重排。
- **活动热力图**：可视化展示专注分钟数与习惯完成情况的时序分布。

### 日历

- **灵活视图**：月视图、桌面端 4 天视图、移动端周视图（带边缘分页保护），以及滚动 3 天视图。
- **事件创建**：快速创建事件，支持自然语言时间解析。
- **多提供方同步**：Google Calendar 与 Microsoft Outlook。
- **ICS 可移植性**：通用 `.ics`（RFC 5545）导入与导出。

### 数据主权

- **访客模式**：功能完整、零足迹的体验，数据存于 `localStorage` —— 无需账号。
- **账号与认证**：Google、GitHub 或经过泄露检测的邮箱密码登录，支持多提供方身份关联与密码重置。
- **WebDAV 备份**：把全部数据在你的自有服务器上保留一份副本（Nextcloud、群晖）。所有层级均可用，无论有无账号。注意这是备份而非同步：每次上传都会覆盖上一次。
- **备份与可移植性**：加密 `.zip` 导出/导入、访客备份提醒，以及云端数据一键清除。
- **离线优先 PWA**：通过 Service Worker 与 stale-while-revalidate 缓存策略提供完整的离线支持。
- **遥测**：对所有人（含访客模式）默认关闭。若你主动开启，我们仅采集匿名的产品用量计数（不含任务标题、习惯名称或任何内容），并绑定随机设备 ID，绝不与你的账号关联。

### 统计与洞察

- **统计页**：周期选择器，按项目与优先级拆解，时段热力图。
- **单项洞察**：每个习惯与每条重复任务的统计 —— 得分历史、连续记录、频率、准时率。
- **目标追踪**：习惯卡片上的进度环，全局专注与任务目标。
- **导出**：从统计与洞察面板导出 CSV 与 JSON 分析数据。

### 偏好设置

- **时间格式**：全系统统一的 12 小时/24 小时制切换，作用于所有时间显示。
- **键盘可达性**：Esc 关闭所有弹窗，完整的焦点陷阱与 `aria-modal` 合规。
- **触感反馈**：标准化的触感反馈调色板，为移动端提供精确反馈。

## 快捷键

| 快捷键              | 操作                                           |
| ------------------- | ---------------------------------------------- |
| `1–6`               | 快速导航（首页、习惯、日历、统计、专注、设置） |
| `Shift+1 / 2`       | 切换视图（看板 / 列表）                        |
| `gg / G`            | 跳转到任务列表或看板的顶部 / 底部              |
| `yy / p / u`        | 复制任务 / 粘贴任务 / 撤销操作                 |
| `Ctrl/Cmd+K`        | 打开命令面板                                   |
| `Ctrl/Cmd+B`        | 切换侧边栏                                     |
| `N / H / E / P / W` | 新建（任务、习惯、事件、项目、工作台）         |
| `Shift+H`           | 查看全部快捷键                                 |

## AI 工作台：MCP + Skill

Kagelin 将 AI 集成拆成两个层次：

- **MCP Server**（`mcp-server/`）提供能力与安全边界，固定暴露五个工具：`list_workspaces`、`inspect_app_context`、`get_workspace_blueprint`、`build_workspace` 和 `patch_workspace`。
- **Skill**（[`skills/kagelin-workspace-builder/SKILL.md`](skills/kagelin-workspace-builder/SKILL.md)）是可选的工作流编排层，负责决定何时检查上下文、复用已有实体、澄清需求、选择 Blueprint 或 Mermaid、请求确认、消费回执和验证结果；它不会直接写入数据。

当前 MCP 合约版本为 `1.1.0`，Skill 版本为 `1.0.0`。AI 合约 v1 支持 `doc`、`task`、`habit`、`project`、`focus`、`decision` 和 `step` 节点。原生工作台可以显示日历事件节点，但 MCP/Skill v1 有意拒绝 `event` 节点；连线始终是纯视觉关系，不承诺运行时自动化语义。

### 配置 MCP Server

1. 安装依赖并创建本地环境文件：

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. 配置 Supabase 项目和 MCP 进程使用的 Account 身份。独立运行的 stdio Server 必须使用宿主提供的带会话 Supabase Client，或者使用服务端密钥。对于本地 `npm run mcp:start`，配置：

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SECRET_KEY=<仅服务端使用的密钥>
   KAGELIN_MCP_USER_ID=<已认证账号的UUID>
   ```

   `KAGELIN_MCP_USER_ID` 用来明确 Account 作用域，不是密码。服务端密钥必须只保存在本地 Server 环境中，绝不能进入浏览器代码、提交到 Git 或部署到公开环境。即使使用该密钥，适配层仍会在变更前检查工作台、节点、连线及被引用领域实体的所有权。真实模式缺少明确身份时会 fail closed；`KAGELIN_MOCK_MODE=true` 仅用于测试和本地 fixture，不是认证替代品。

3. 启动一次 Server，确认 stdio 进程可用：

   ```bash
   npm run mcp:start
   ```

   MCP 客户端注册后会自行启动该进程。不要把它作为长驻 HTTP 服务运行；当前集成使用 stdio 传输。

#### stdio 客户端配置示例

在 Antigravity、Claude Desktop、Claude Code、Cursor 或其他支持 stdio 的客户端中，添加等价的 MCP Server 条目。将占位符替换为绝对路径和本地凭据：

```json
{
  "mcpServers": {
    "kagelin-workspace-builder": {
      "command": "node",
      "args": [
        "<path-to-kagelin>/node_modules/tsx/dist/cli.mjs",
        "--tsconfig",
        "<path-to-kagelin>/tsconfig.json",
        "<path-to-kagelin>/mcp-server/index.ts"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://<project>.supabase.co",
        "SUPABASE_SECRET_KEY": "<仅服务端使用的密钥>",
        "KAGELIN_MCP_USER_ID": "<已认证账号的UUID>"
      }
    }
  }
}
```

通过 `mcp-server/index.ts` 启动时，Server 也会自动加载仓库根目录的 `.env.local`，因此可以把密钥留在那里，避免在客户端配置文件中重复保存。客户端专属模板见 [`mcp-server/README.md`](mcp-server/README.md)，完整工具合约见 [`mcp-server/instructions.md`](mcp-server/instructions.md)。

### 配置和使用 Skill

1. 在支持 Skill 的客户端中，将规范文件 [`skills/kagelin-workspace-builder/SKILL.md`](skills/kagelin-workspace-builder/SKILL.md) 以 `kagelin-workspace-builder` 的名称安装或映射到客户端的 Skill 目录。项目不维护按客户端复制的版本，请保持该文件与 MCP 合约版本同步。
2. 将同一个客户端连接到上面的 MCP Server。Skill 负责时序和对话编排；MCP Server 仍负责校验、Account 隔离、破坏性操作门禁、回执、重试和数据完整性。
3. 创建新画布时，描述目标、阶段、卡片和它们的关系。例如：“创建一个名为 Release flow 的工作台，分为 Prepare、Build、Verify 三个阶段；复用我已有的发布任务，并从左到右连接各阶段。” Skill 可以先检查相关项目、习惯和任务，然后调用 `build_workspace` 并返回操作回执。
4. 修改已有画布时，明确工作台目标和局部变更。例如：“在 Release flow 工作台的 Build 分组里增加一个 Verify 步骤，保持已有卡片位置不变。” Skill 会先列出工作台、读取目标快照，再调用 `patch_workspace`；拓扑或删除操作后会重新读取验证，绝不会把局部修改改写成全量重建。
5. 对破坏性变更明确确认。删除节点/连线或提交大批量 patch 时，MCP 边界要求 `destructiveConfirmation: true`，只在提示词中说“确认”并不能绕过服务端门禁。客户端可能重试时，请使用稳定的 `requestId`：相同输入会安全重放，复用同一 ID 但输入不同则返回冲突。

如果客户端无法加载 Skill，可以请求 MCP 命名 Prompt `workspace_builder_workflow`，按照其 inspect → resolve → build/patch → receipt → verify 流程执行。通用 MCP 客户端应先用 `list_workspaces` 解析已有目标；需要复用实时实体时调用 `inspect_app_context`；修改已有工作台前先调用 `get_workspace_blueprint`，再按场景选择 `build_workspace` 或 `patch_workspace`。

<details>
<summary><strong>技术栈</strong></summary>

- **Next.js 16.2.10**（App Router）+ **React 19.2.7**（React Compiler）
- **Supabase**（Postgres、Auth、Realtime）
- **TanStack Query v5**（IndexedDB 持久化）+ **Zustand v5**
- **Tailwind CSS v4** + **Shadcn UI**（Radix）
- **Framer Motion** + **@dnd-kit**（扁平 DOM 拖拽）
- **Serwist**（类型化的 Service Worker，离线优先 PWA）
- **tsdav**（CalDAV，目前暂缓）+ **ical.js**（ICS 导入/导出）

</details>

## 本地搭建

**前置条件**：Node.js 20+，以及一个已执行 `supabase/schema.sql` 与 `supabase/migrations` 中相关迁移的 Supabase 项目。

```bash
git clone https://github.com/roverstargazer1-max/to-do.git
npm install
cp .env.example .env.local   # 填入相关密钥
npm run dev
```

### 环境变量说明

`.env.example` 中的绝大多数变量都是可选的。最小可运行配置取决于你要使用的功能：

| 变量                                                                   | 必需性              | 说明                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                             | 云端功能必需        | Supabase 项目 URL。纯访客模式离线使用时可留空。                                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                        | 云端功能必需        | Supabase 匿名（publishable）密钥。                                                                                               |
| `SUPABASE_SECRET_KEY`                                                  | 日历 OAuth 必需     | 服务端专用，`sb_secret_…` 开头。绕过 RLS，**绝不可暴露给客户端**。旧的 service_role key 同样可用。                               |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 可选                | Web Push 推送。用 `npx web-push generate-vapid-keys` 生成。                                                                      |
| `CALENDAR_TOKEN_ENC_KEY`                                               | 日历同步必需        | 用于加密存储日历 OAuth token。                                                                                                   |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                            | Google 日历同步必需 | Google OAuth 凭据。                                                                                                              |
| `NEXT_PUBLIC_APP_URL`                                                  | 建议设置            | 本地开发填 `http://localhost:3000`。                                                                                             |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`                  | 可选                | 限流服务。                                                                                                                       |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                                       | 可选                | Cloudflare Turnstile 验证码。当 Supabase 控制台开启「Bot and Abuse Protection」后必需，否则 `signInWithOtp` 会因验证码校验失败。 |
| `NEXT_PUBLIC_RELEASE_CHANNEL`                                          | 可选                | `preview`（默认，显示全部更新日志）或 `stable`（仅显示稳定版，最多 3 条）。同时作为 Sentry 的 environment 标签。                 |
| `NEXT_PUBLIC_SENTRY_DSN` 等 Sentry 变量                                | 可选                | 错误监控。留空则完全禁用（no-op）。`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` 仅在 CI 上传 source map 时需要。            |

### 常用脚本

| 命令                  | 说明                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | 启动开发服务器（Turbopack）。                                                                              |
| `npm run dev:pwa`     | 以 Webpack 启动开发服务器 —— **本地调试 Service Worker / PWA 时用这个**，Turbopack 模式下 Serwist 不生效。 |
| `npm run build`       | 生产构建（Webpack，`prebuild` 会自动复制 `sql-wasm.wasm` 到 `public/`）。                                  |
| `npm run typecheck`   | TypeScript 类型检查。                                                                                      |
| `npm run lint:strict` | ESLint 严格模式（当前告警上限 13）。                                                                       |
| `npm test`            | Vitest 单元测试。                                                                                          |
| `npm run validate`    | 并行执行格式检查、严格 lint、类型检查与测试。                                                              |
| `npm run e2e`         | Playwright 端到端测试。                                                                                    |

> **注意**：`npm install` 会触发 `prepare` 钩子执行 `husky` 与 `copy-wasm`。后者会把 `node_modules/sql.js/dist/sql-wasm.wasm` 复制到 `public/sql-wasm.wasm`，这是 uhabits `.db` 导入功能所必需的。

## 贡献与反馈

Bug 报告与功能请求请提交至 [GitHub Issues](../../issues)。提问与讨论请使用 [GitHub Discussions](../../discussions)。

## 许可证

[AGPL-3.0](LICENSE)
