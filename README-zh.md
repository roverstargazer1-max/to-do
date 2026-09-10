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

| 快捷键          | 操作                                           |
| --------------- | ---------------------------------------------- |
| `1–6`           | 快速导航（首页、习惯、日历、统计、专注、设置） |
| `Shift+1 / 2`   | 切换视图（看板 / 列表）                        |
| `gg / G`        | 跳转到任务列表或看板的顶部 / 底部              |
| `yy / p / u`    | 复制任务 / 粘贴任务 / 撤销操作                 |
| `Ctrl/Cmd+K`    | 打开命令面板                                   |
| `Ctrl/Cmd+B`    | 切换侧边栏                                     |
| `N / H / E / P` | 新建（任务、习惯、事件、项目）                 |
| `Shift+H`       | 查看全部快捷键                                 |

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
