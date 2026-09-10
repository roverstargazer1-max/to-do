# Kagelin（Kanso）架构普查报告

> **普查日期**：2026-09-08
> **普查性质**：只读架构普查（未修改任何代码、未安装依赖、未运行迁移或构建）
> **普查方式**：4 个并行探索子代理覆盖 8 项研究清单 + 人工抽查验证关键结论（mutation 收敛点、QueryProvider 配置、realtime 覆盖面、侧边栏插入点等均经直接读文件复核）
> **引用约定**：所有引用为相对 Kagelin 项目根的 `路径:行号`。普查时项目位于 `references/kagelin`，后续移动到 `d:\Projects\to-do\kagelin` 后引用依然有效
> **背景目的**：为 KRNL0 风格 Workspace（无限画布 + Node 编排层）的 Command Layer / Event Bus / 投影层设计提供架构依据。Workspace 只是 View / Projection / Orchestration Layer，业务数据唯一真实来源仍是 Kagelin

---

## 0. 执行摘要

Kagelin（代号 Kanso）是一个 **Next.js 16 App Router 单体应用**（非 monorepo），Supabase（Postgres + Auth + RLS + Realtime）为云端后端，定位"离线优先 PWA 生产力套件"（AGPL-3.0，v1.42.0）。

核心架构事实（后续各节展开）：

1. **目录契约**：`app/` 只放路由（薄壳）；`src/components/` 按领域分组做展示；`src/lib/{hooks,mutations,store}/` 是逻辑三层——hooks（React Query 读取 + 乐观更新 mutation hooks）、mutations（纯 service 函数）、store（Zustand 临时态）。见 [AGENTS.md](../../AGENTS.md)。
2. **状态按性质分流**（AGENTS.md 原则）：服务端镜像数据（tasks/habits/events…）全部住在 **TanStack Query**（IndexedDB 持久化 + offlineFirst 可恢复 mutation）；临时 UI 态与 focus 计时器住在 **Zustand**（localStorage 持久化）。
3. **Guest/Cloud 双轨**：无统一 repository 抽象——每个 queryFn/mutationFn 内部 `if (isGuestMode)` 分流到 mockStore（localStorage 单 key JSON）或 supabase-js，queryKey 内嵌 `isGuestMode` 防缓存互窜。
4. **Mutation 已基本收敛**：交互式 CRUD 全部走 `src/lib/mutations/` 六个 service 文件（组件零直写，仅 2 处只读例外），但存在 5 类客户端绕过路径（迁移、备份导入、uhabits 导入、profile 更新、日历同步引擎）+ 服务端写路径（SQL 触发器、edge functions、API routes、RPC）。
5. **Realtime 仅一张表**：`user_timer_state`（timer handoff，ADR 0002）；tasks/habits/events 无实时订阅（Premium 的 realtime mirroring 是未建功能），数据新鲜度依赖 invalidate + refetchOnWindowFocus。
6. **通知全部服务器派生**：DB 触发器写 `notification_queue` → cron 每分钟调 process-queue Edge Function → Web Push。

---

## 1. 整体结构

### 1.1 目录树概览

```
kagelin/
├── app/                    # App Router 路由层（仅路由/布局/API routes，薄壳）
│   ├── page.tsx            # / = Tasks 首页（Server + Suspense）
│   ├── layout.tsx          # 根布局（Server，读 guest cookie 防水合）
│   ├── template.tsx        # 页面过渡（client，仅 opacity 淡入）
│   ├── sw.ts               # Serwist service worker 源码
│   ├── habits|calendar|focus|stats|settings|…/page.tsx
│   ├── api/                # calendar / push / telemetry / webdav / health
│   └── auth/               # callback / email-confirmed / update-password
├── src/
│   ├── components/         # 按领域分组：tasks/ habits/ calendar/ stats/ home/
│   │   │                    #   projects/ settings/ auth/ admin/ layout/ shared/
│   │   │                    #   telemetry/ insights/
│   │   ├── ui/             # shadcn/Radix 原语（45 个文件，kebab-case）
│   │   ├── QueryProvider.tsx / AuthProvider.tsx / TimerProvider.tsx / ThemeProvider.tsx
│   │   └── providers/PiPProvider.tsx
│   └── lib/
│       ├── hooks/          # React Query 数据 hooks + useXxxMutations 乐观更新
│       ├── mutations/      # 纯 service 函数（task/habit/project/calendar-event/focus/importSource）
│       ├── store/          # Zustand: timerStore / uiStore / focusHistoryStore / locationHistoryStore
│       │                   #   + serverClock / deviceId（模块单例）
│       ├── mock/           # guest 伪后端 mockStore（localStorage）
│       ├── types/          # 领域类型（= DB row 形状，snake_case）
│       ├── schemas/        # Zod（表单校验）
│       ├── supabase/       # client / server 创建 + fetchAllRows 分页
│       ├── sync/           # 外部日历双向同步引擎（Google/MS/CalDAV）
│       ├── caldav/ calendar-oauth/ webdav/ import/ backup/ admin/ telemetry/ api/ auth/ constants/ utils/
├── supabase/
│   ├── schema.sql          # DB 真相源（但滞后于部分 migrations，见 §3.4）
│   ├── migrations/         # 44 个增量迁移
│   └── functions/          # edge functions: process-queue / daily-briefing / caldav-sync
├── tests/                  # unit（镜像 src 结构）+ e2e（Playwright）
└── docs/adr/               # 15 篇架构决策记录
```

关键架构文档：[AGENTS.md](../../AGENTS.md)（架构总纲）、[CONTEXT.md](../../CONTEXT.md)（领域词汇表——"Habit vs Entry"、"Streak vs Score"、sync 四义等，命名前必读）、`docs/adr/`（15 篇 ADR，含被否方案）。

### 1.2 Next.js 版本与渲染策略

- **Next 16.2.10 + React 19.2.7**（package.json:83,85），App Router（无 pages 目录），React Compiler 开启（next.config.ts:42）。
- `next dev --turbopack`（SW 关闭）；`next build --webpack`（Serwist PWA 打包，next.config.ts:13-21,77-79）。
- **只有 4 个页面是 Server Component**：`/`（app/page.tsx，Suspense 包 HomeClient）、`/stats`、`/settings`（薄壳，静态 props）、`/admin/metrics`（唯一真 SSR 取数 + 鉴权页面，app/admin/metrics/page.tsx:7,18-41）。其余 9 个页面全部 `"use client"`（habits/focus/calendar/login/signup/share/auth\*/access-denied）。
- 根布局 app/layout.tsx:50-56 在 Server 侧读 `kanso_guest_mode` cookie 得 `initialIsGuest` 防止 guest 首帧水合错误；:60-80 有防 FOUC 内联脚本（同步读 localStorage `kanso-ui-state` 预写 `data-view-mode`）。
- **Provider 嵌套**（app/layout.tsx:83-96）：`ThemeProvider(next-themes) → QueryProvider(PersistQueryClientProvider) → AuthProvider → TimerProvider → AppShell → PiPProvider(仅主内容区, src/components/layout/AppShell.tsx:423)`。

### 1.3 关键依赖及版本（package.json:39-107）

| 类别       | 依赖                                                                                                                                 | 版本                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 框架       | next / react / react-dom                                                                                                             | 16.2.10 / 19.2.7 / 19.2.7                           |
| 状态       | zustand / @tanstack/react-query（+persist-client）                                                                                   | 5.0.14 / 5.101.2                                    |
| 后端       | @supabase/supabase-js / @supabase/ssr                                                                                                | 2.89.0 / 0.12.0                                     |
| 本地持久化 | idb-keyval（IndexedDB KV）                                                                                                           | 6.3.0                                               |
| UI         | Tailwind CSS 4（CSS-first）/ shadcn + Radix 全家桶 / lucide-react / cmdk / sonner / vaul / next-themes                               | 4.1.18 / — / 1.24.0 / 1.1.1 / 2.0.7 / 1.1.2 / 0.4.6 |
| 交互       | @dnd-kit/core + sortable / framer-motion / react-hotkeys-hook / react-virtuoso                                                       | 6.3.1 + 10.0.0 / 12.42.2 / 5.3.3 / 4.18.10          |
| 表单       | react-hook-form / @hookform/resolvers / zod                                                                                          | 7.81.0 / 5.4.0 / 4.2.1                              |
| 日期       | date-fns / react-day-picker / chrono-node（自然语言时间）                                                                            | 4.4.0 / 10.0.1 / 2.10.0                             |
| 日历       | ical.js / ical-generator / tsdav                                                                                                     | 2.2.1 / 11.0.0 / 2.3.1                              |
| PWA/通知   | @serwist/next + serwist / web-push / @types/web-push                                                                                 | 9.5.11 + 9.4.2 / 3.6.7                              |
| 其他       | @sentry/nextjs / @upstash/ratelimit+redis / sql.js（uhabits .db 导入）/ fflate / recharts / react-activity-calendar / react-markdown | —                                                   |

---

## 2. 状态管理（Zustand × TanStack Query 分工）

### 2.1 总原则

AGENTS.md 原文：**"State is split by nature, not by feature: server-owned data (tasks, habits, events) lives in TanStack Query with IndexedDB persistence; ephemeral/local UI and the focus timer live in Zustand."**

| 数据             | Registered/Premium 权威源                                                                                | Guest 权威源                                       | 客户端缓存层                                                                   | 持久化介质（key）                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Tasks / Subtasks | Supabase `tasks`                                                                                         | mockStore.tasks                                    | Query cache `["tasks",{…}]`、`["subtasks",parentId,…]`                         | IndexedDB `REACT_QUERY_OFFLINE_CACHE`；guest 另有 localStorage `kanso_guest_data_v11` |
| Projects         | Supabase `projects`                                                                                      | mockStore.projects                                 | `["projects",isGuest]` 等                                                      | 同上                                                                                  |
| Habits + entries | Supabase `habits` / `habit_entries`                                                                      | mockStore                                          | `["habits",…]`                                                                 | 同上                                                                                  |
| Calendar events  | Supabase `calendar_events`（+外部日历同步）                                                              | mockStore.events                                   | `["calendar-events",isGuest]`；**视图镜像在 useCalendarStore**                 | 同上                                                                                  |
| Focus logs       | Supabase `focus_logs`                                                                                    | mockStore.focus_logs                               | `["stats-dashboard"] ["today-focus-count"] ["heatmap-data"] ["goal-progress"]` | 同上                                                                                  |
| **Timer 运行态** | **双主**：Zustand timerStore（本地）+ `user_timer_state`（跨设备仲裁）                                   | 仅 timerStore                                      | **刻意不走 Query cache**                                                       | localStorage `kanso-timer-storage`                                                    |
| UI 状态          | uiStore                                                                                                  | uiStore                                            | —                                                                              | localStorage `kanso-ui-state`                                                         |
| Profile          | Supabase `profiles`                                                                                      | 无（返回 null，src/lib/hooks/useProfile.ts:20-21） | `["profile",user.id]`                                                          | IndexedDB 同上                                                                        |
| 本机 focus 历史  | focusHistoryStore（**非权威**，已被服务端 focus_logs 取代，src/lib/hooks/useTodayFocusSessions.ts:9-16） | 同左                                               | —                                                                              | localStorage `kanso-focus-history`                                                    |

### 2.2 Zustand Store 清单（src/lib/store/ + 1 个目录外）

| Store                                             | 职责 / State 要点                                                                                                                                                                                                                                        | persist                                                                       | 引用                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **timerStore.ts**                                 | 计时器运行态（mode/isRunning/**endsAt 绝对 deadline**/sourceDeviceId/activeTaskId/completedSessions）+ settings；`reconcile` 以 serverNow 锚定、前台设备才允许完成；`completeTimer` 通过 `window.dispatchEvent(CustomEvent "timer-complete")` 触发副作用 | localStorage `kanso-timer-storage`，version 1 + migrate（v0→v1 重建 endsAt）  | src/lib/store/timerStore.ts:10-34,63-71,184-221,259-296             |
| **uiStore.ts**                                    | 30+ 字段：视图模式（viewMode/habitViewMode/statsPeriod）、排序分组、Projects 折叠态 isProjectsOpen、goals、时间格式、changelog、undo（lastUndoAction）、yank（vim yy）等                                                                                 | localStorage `kanso-ui-state`，partialize 排除瞬态字段，`_hasHydrated` 防水合 | src/lib/store/uiStore.ts:17-110,227-269                             |
| **focusHistoryStore.ts**                          | 每设备 focus 历史（非权威，仅本地）                                                                                                                                                                                                                      | localStorage `kanso-focus-history`                                            | src/lib/store/focusHistoryStore.ts:6-36                             |
| **locationHistoryStore.ts**                       | 位置历史 MRU（≤50 条）                                                                                                                                                                                                                                   | localStorage `kanso-location-history`                                         | src/lib/store/locationHistoryStore.ts:6-36                          |
| **useCalendarStore**（src/lib/calendar/store.ts） | 日历视图态（currentDate/view/events 镜像/isCreateEventOpen/selectedEvent）；**无 persist**，events 由 useCalendarEvents 的 effect 灌入（src/lib/hooks/useCalendarEvents.ts:99-101）                                                                      | 无                                                                            | src/lib/calendar/store.ts:14-148                                    |
| serverClock.ts / deviceId.ts                      | 模块级单例（非 store）：服务端时钟偏移（RTT/2 校正）与设备 ID                                                                                                                                                                                            | 内存 / localStorage `kanso-device-id`                                         | src/lib/store/serverClock.ts:13-65；src/lib/store/deviceId.ts:10-21 |

### 2.3 TanStack Query 基础设施（src/components/QueryProvider.tsx，已全文复核）

- **QueryClient 配置**（:30-44）：`staleTime 5min`、`gcTime 7 天`、`retry 2`、`refetchOnWindowFocus true`、**`networkMode: "offlineFirst"`**（离线时 mutation 进 paused 而非失败）、mutations `retry: 1`。
- **IndexedDB persister**（:13-23）：自定义 asyncStoragePersister，idb-keyval 直接 set/get/del key `"REACT_QUERY_OFFLINE_CACHE"`；`maxAge 7 天`（:105）。
- **可恢复 mutation**（:48-95）：`client.setMutationDefaults` 为 **14 个 mutationKey** 重新绑定 mutationFn——`["createTask"] ["toggleTask"] ["updateTask"] ["deleteTask"] ["reorderTasks"] ["clearCompletedTasks"] ["createHabit"] ["updateHabit"] ["deleteHabit"] ["markHabitComplete"] ["createProject"] ["updateProject"] ["archiveProject"] ["logFocusSession"]`。页面重载后 IndexedDB 中的 paused mutation 凭 mutationKey 恢复执行函数。
- **恢复守卫**（:107-123）：缓存恢复后检查 Supabase session 或 guest flag——有效则 `resumePausedMutations()`，无效则**清空整个 MutationCache**（防未认证 mutation 重放）。

### 2.4 Query Key 组织：**无集中工厂**

全仓 grep `queryKeys` 零命中——不存在集中的 key 工厂文件，所有 key 为内联数组字面量，散布在 hooks 与个别组件中。**`isGuestMode` 内嵌在 key 中**（模式切换即换缓存实例）。主要形状：

| 域          | Key 形状                                                                                                                                                                                              | 位置                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks       | `["tasks", { projectId, showCompleted, filter, isGuestMode }]` / `["task", taskId, isGuestMode]` / `["task-series", seriesId, isGuestMode]` / `["inbox-project"]`                                     | src/lib/hooks/useTasks.ts:21,175,209,238                                                                                                       |
| Subtasks    | `["subtasks", parentId, isGuestMode]`                                                                                                                                                                 | src/lib/hooks/useSubtasks.ts:19                                                                                                                |
| Habits      | `["habits", { includeArchived, isGuestMode }]` / `["habit", habitId, isGuestMode]`                                                                                                                    | src/lib/hooks/useHabits.ts:47,98                                                                                                               |
| Projects    | `["projects", isGuestMode]` / `["project", projectId, isGuestMode]` / `["projects","archived",isGuestMode]`                                                                                           | src/lib/hooks/useProjects.ts:13,43,72                                                                                                          |
| Calendar    | `["calendar-events", isGuestMode]`（日历页与命令菜单搜索共用）/ `["calendar-tasks", isGuestMode]`（due_date 任务投影）/ `["calendar-connected-providers"]`                                            | src/lib/hooks/useCalendarEventsList.ts:30；useCalendarEvents.ts:20；useConnectedCalendarProviders.ts:24                                        |
| Stats/Focus | `["stats-dashboard", isGuestMode, period]` / `["heatmap-data", isGuestMode]` / `["goal-progress", isGuestMode]` / `["today-focus-count", isGuestMode]` / `["focus-tasks", todayDateStr, isGuestMode]` | src/lib/hooks/useStats.ts:323；useHeatmapData.ts:34；useGoalProgress.ts:73；useTodayFocusSessions.ts:21；src/components/FocusTaskPicker.tsx:71 |
| Account     | `["profile", user?.id]` / `["has-password", user?.id]` / `["demo-mode", { isGuestMode }]`                                                                                                             | src/lib/hooks/useProfile.ts:19；useHasPassword.ts:13；useDemoMode.ts:12                                                                        |

### 2.5 缓存刷新策略

写后刷新 = **乐观 setQueryData（高频交互即时反馈）+ onSettled invalidate 前缀 key（正确性兜底）**。域间差异：

| 域                        | 策略                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasks / Habits / Projects | 完整乐观三部曲：`onMutate`（cancelQueries + setQueryData + 快照 previous）→ `onError` 回滚 → `onSettled` invalidate（如 `invalidateTaskCaches` 同时失效 `["tasks"] ["subtasks"] ["calendar-tasks"] ["stats-dashboard"] ["focus-tasks"] ["task-series"]`，src/lib/hooks/useTaskMutations.ts:22-32）                                  |
| Calendar events           | **例外**：不做 Query 乐观更新；`onSuccess` 直写 `useCalendarStore.addEvent/updateEvent/deleteEvent`（即时 UI）+ invalidate `["calendar-events"]`（src/lib/hooks/useCalendarEventMutations.ts:21-28）                                                                                                                                |
| Profile / Focus logs      | 纯 invalidate（useProfile.ts:64-67；useFocusTimer.ts:81-85）                                                                                                                                                                                                                                                                        |
| 大范围操作                | 备份恢复后枚举式全清（src/components/settings/BackupSyncSettings.tsx:363-374）；Settings/CommandMenu 全量 `invalidateQueries()`（src/components/settings/SettingsClient.tsx:154；src/components/command-menu.tsx:278）；guest 清数据用 `removeQueries` 按 `GUEST_QUERY_KEYS` 前缀移除（src/lib/hooks/useGuestStoreActions.ts:9-30） |

---

## 3. 数据模型

### 3.1 TypeScript 领域类型（src/lib/types/）

**关键事实：无 Supabase codegen、无 row↔domain 映射层**——领域类型直接采用 DB 的 snake_case 列名，查询结果一律 `as Task` 断言（如 useTasks.ts:162-165）。唯一转换函数是 `toCalendarEventUI`（src/lib/types/calendar-event.ts:94-108）。

**Task**（src/lib/types/task.ts:9-30）：

```ts
id, user_id, project_id: string|null, parent_id: string|null,
content, description: string|null,
priority: 1|2|3|4, due_date: string|null, do_date: string|null,
is_evening, is_completed: boolean, completed_at: string|null,
day_order: number,
recurrence: RecurrenceRule|null, recurring_series_id: string|null,
google_event_id / google_etag: string|null,   // Google 日历双向同步
created_at, updated_at, subtasks?: SubtaskSummary[]
```

- **Subtask 不是独立实体**：就是 `parent_id` 非空的 Task（单表自关联闭包，无层级限制）。
- `RecurrenceRule`（src/lib/utils/recurrence.ts:5-10）：`freq: DAILY|WEEKLY|MONTHLY|YEARLY, interval, days?, mode?: "strict"|"flexible"`。
- **Project**（src/lib/types/task.ts:32-42）：`id, user_id, name, color, view_style: "list"|"board", is_inbox, is_archived, created_at, updated_at`。

**Habit**（src/lib/types/habit.ts:1-22）：`id, user_id, name, description, color, icon, created_at, updated_at, archived_at, start_date, sort_order` + 可选迁移新增：`habit_type?: "boolean"|"measurable", frequency_count?, frequency_period?: "day"|"week"|"month", target_type?: "at_least"|"at_most", target_value?, unit?, source_uuid?`（uhabits 导入溯源，ADR 0006）。
**HabitEntry**（:24-30）：`id, habit_id, date (YYYY-MM-DD), value: number, created_at`——**无 user_id 列**，经 habit 归属（RLS 间接判定）。

**CalendarEvent**（src/lib/types/calendar-event.ts:6-43）：`id, user_id, title, description, location, start_time, end_time, all_day, color, category, recurrence_rule (RRULE 文本), remote_id, remote_calendar_id, etag, ics_uid, sync_state: "pending_create"|"pending_update"|"pending_delete"|null（离线 CRUD 队列）, is_archived（软删）, metadata, created_at, updated_at`。`CalendarEventUI`（:77-89）是 camelCase + Date 对象的渲染投影。

**FocusLog**（src/lib/types/focus.ts:5-13，实际命名无 FocusSession）：`id, user_id, task_id: string|null, start_time, end_time: string|null, duration_seconds, created_at`。

**Profile**（src/lib/types/profile.ts:1-10）：`id, display_name, settings: UserSettings（notifications 五开关 + adminLandingPage）, timezone, is_premium, is_admin, created_at, updated_at`。

### 3.2 Zod Schemas（src/lib/schemas/）

5 个文件，全部用于**表单校验**（react-hook-form zodResolver），不是读取路径的解析层：CreateTaskSchema（schemas/task.ts:19-37）、CreateHabitSchema、CreateProjectSchema、FocusSettingsSchema、Telemetry 系列（discriminatedUnion，schemas/telemetry.ts:79-92，服务端 API 校验）。

### 3.3 Supabase 表结构（schema.sql + migrations 合并）

核心表与关系（列清单详略，见引用行号）：

| 表                                 | 列要点                                                                                                                                                                                    | 关系/约束                                                                                                                                                   | 引用                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `profiles`                         | id→auth.users CASCADE, display_name, settings JSONB, timezone, is_premium, is_admin                                                                                                       | 列级 UPDATE 白名单（防自授 admin，fail-closed）                                                                                                             | supabase/schema.sql:12-21,485-497          |
| `projects`                         | name, color, view_style, is_inbox, is_archived                                                                                                                                            | RLS 全 CRUD 限本人                                                                                                                                          | schema.sql:26-36,500-507                   |
| `tasks`                            | content, description, priority 1-4, due_date/do_date, is_evening, is_completed, completed_at, day_order, recurrence JSONB, recurrence_settings, recurring_series_id, google_event_id/etag | **project_id → projects ON DELETE SET NULL**（删项目任务退回 inbox）；**parent_id → tasks 自引用 ON DELETE CASCADE**；RLS INSERT/UPDATE 校验 project 属本人 | schema.sql:41-61,510-530；20260617120000:4 |
| `focus_logs`                       | task_id → tasks ON DELETE SET NULL, start_time, end_time, duration_seconds                                                                                                                | RLS 校验 task 归属                                                                                                                                          | schema.sql:89-97,559-577                   |
| `habits`                           | name, color, icon, sort_order, archived_at, habit_type 系列（migrations）, source_uuid                                                                                                    | RPC `reorder_habits(updates jsonb)` 原子批量重排（SECURITY INVOKER 保 RLS）                                                                                 | schema.sql:624-667；20260616120000:19-27   |
| `habit_entries`                    | habit_id → habits ON DELETE CASCADE, date, value                                                                                                                                          | **UNIQUE(habit_id, date)**；无 user_id，RLS 经 habits EXISTS 判定                                                                                           | schema.sql:672-712                         |
| `calendar_events`                  | title, start_time/end_time（CHECK end≥start）, all_day, recurrence_rule, remote_id/etag/ics_uid, sync_state, is_archived                                                                  | remote_calendar_id → external_calendars ON DELETE SET NULL；**与 tasks/focus 无 FK**                                                                        | schema.sql:739-799；20260530120000:2-10    |
| `external_calendars`               | provider（caldav/google/outlook/icloud/fastmail/nextcloud）, sync_token, sync_status, sync_direction, is_premium_provider                                                                 | RLS 限本人                                                                                                                                                  | schema.sql:807-869                         |
| `calendar_oauth_tokens`            | provider, encrypted_refresh_token + token_iv                                                                                                                                              | **RLS 开但无 policy——仅 service-role 可读写**                                                                                                               | 20260530130000:3-22                        |
| `user_timer_state`                 | 每用户一行（UNIQUE user_id）, mode, remaining_seconds, is_running, active_task_id, **ends_at**, source_device_id, completed_sessions, settings JSONB                                      | **REPLICA IDENTITY FULL + 加入 supabase_realtime publication**（Realtime 按 user_id 过滤投递）；无 DELETE policy                                            | schema.sql:884-926                         |
| `push_subscriptions`               | endpoint, subscription JSONB                                                                                                                                                              | UNIQUE(user_id, endpoint)——一用户多设备                                                                                                                     | schema.sql:106-113；20260416               |
| `notification_queue`               | scheduled_at, type（timer_end/due_date/do_date/evening/briefing）, payload, status 状态机, retry_count/claimed_at/next_attempt_at                                                         | 去重唯一索引 + claim 索引                                                                                                                                   | schema.sql:122-143,940-942                 |
| `labels` / `task_labels`           | 多对多结构                                                                                                                                                                                | **前端未使用**（备而未用的 Tags 模型）                                                                                                                      | schema.sql:68-84                           |
| `habit_imports`                    | raw JSONB write-once                                                                                                                                                                      | uhabits 导入溯源（ADR 0006）                                                                                                                                | schema.sql:715-733                         |
| `waitlist_signups` / `telemetry_*` | —                                                                                                                                                                                         | service-role 专用                                                                                                                                           | schema.sql:1093-1261                       |

**模型关系结论**：Project→Task 经 `project_id`（ON DELETE SET NULL，inbox = `project_id IS NULL`）；Habit↔Entry 经 `habit_id` CASCADE + UNIQUE(habit_id,date)；**CalendarEvent 与 task/focus 之间没有任何外键**——"任务出现在日历上"是纯 UI 层投影（useCalendarEvents 把有 due_date 的 task 转成 CalendarEventUI 合流，src/lib/hooks/useCalendarEvents.ts:73-97）；recurring_series_id 是纯 uuid 分组标识（无 FK、无 series 表），完成循环任务 Occurrence 时客户端算下一日期插入新行（src/lib/mutations/task.ts:171-223,261-327）。

### 3.4 ⚠️ schema.sql ≠ 完整真相

`tasks.recurring_series_id`、`habits.habit_type` 系列、`calendar_events.sync_state` **只存在于 migrations 中**，schema.sql 未回写。完整 DB 真相 = schema.sql ∪ migrations/。新表需双写两处（既有惯例如此，但已出现 3 处滞后）。

### 3.5 关键触发器/函数

- `handle_new_user`（schema.sql:178-219）：注册即建 profile + Inbox project。
- `sync_task_notifications`（20260818130000:16-83）：tasks 写入 → 清/插 due_date/do_date 通知行。
- `sync_timer_notifications`（20260818120000:13-148）：user_timer_state 写入 → 服务端重放 timer 状态机，投影未来整条 interval 通知链（MAX_CHAIN_DEPTH=5）。
- `claim_due_notifications(p_limit)`（20260802120000:11-48）：`FOR UPDATE SKIP LOCKED` 原子认领，并发安全。
- cron：process-notification-queue 每分钟、system-daily-briefing 每小时（schema.sql:378-392）。

---

## 4. 数据访问层

### 4.1 结构：**无统一 repository/service 抽象，每个 hook 内联分流**

统一模式（已直接复核 task.ts 验证）：

```
const { isGuestMode } = useAuth()          // hooks 层
  → queryKey 内嵌 isGuestMode               // 模式切换即换缓存
  → if (isGuestMode) { mockStore.xxx }      // guest 分支：手工复刻云端过滤/排序语义
  else { createClient().from("tasks")… }    // cloud 分支：supabase-js
```

- **读取侧**：useTasks.ts:18,21,24-91,93-136 是范式样本（guest 分支在内存复刻 today 过滤/完成可见性/subtask 组装/排序 tie-break，注释明言与云端语义对齐）。useHabits/useProjects/useSubtasks/useCalendarEvents(List) 同构。
- **写侧**：src/lib/mutations/*.ts 是纯 service 对象（无 React 依赖），每个方法开头 `localStorage.getItem("kanso_guest_mode") === "true"` 判定（如 src/lib/mutations/task.ts:59-61，已复核）。
- **分页工具**：`fetchAllRows`（src/lib/supabase/paginate.ts）封装 .range() 翻页绕过 PostgREST 1000 行上限。

### 4.2 Guest 模式（mockStore）

- **单例**：`export const mockStore = new MockStore()`，模块加载即构造（src/lib/mock/mock-store.ts:31,1117）。
- **持久化**：**localStorage 单 key `kanso_guest_data_v11`**（mock-store.ts:15，已复核），JSON 全量同步写（:653-670，失败 Sentry+throw）。`GuestData` = 6 实体数组 + lastUpdated + `seed_ids?`（:17-27，已复核）。
- **Demo 数据**：首访生成 3 demo project、365 天历史任务+focus_logs、未来 30 天任务、4 层 subtask 树、16 周循环 series、6 habit + 365 天 entries、±14 天日历事件，全部 id 收进 `seed_ids`（:44-640）；`isSeedId` / `isInDemoMode` / `stripDemoData`（:1076-1147）。
- **注意**：guest 数据在 **localStorage 而非 IndexedDB**；idb-keyval（IndexedDB）只有两个用途——React Query 离线缓存 `REACT_QUERY_OFFLINE_CACHE` 与 guest 导入溯源 `kanso_import_sources`（src/lib/mutations/importSource.ts:7-34，避开 localStorage 5MB 上限）。

### 4.3 Auth：local ↔ cloud 模式切换

- **判定入口**：`useAuth()`（src/components/AuthProvider.tsx:89-302）。guest 状态三处协同：localStorage `kanso_guest_mode` + 同名 cookie（1 年，供 SSR 水合对齐，:63-67）+ 内存 state。**真实 session 永远胜出**（stale guest flag 被清除，:106-112）。guest 是伪造 User 对象（id="guest"，:78-87）。
- **登录迁移**（useMigrationStrategy，挂载于 AppShell.tsx:406，src/lib/hooks/useMigrationStrategy.ts:19-264）：守卫（user 存在 + guest flag 仍 true）→ `stripDemoData` 剥离 demo（ADR 0014：demo-ness 永久且按引用级联——entries 跟 habit_id、focus_logs 跟 task_id）→ 检测云端是否 established account（是则放弃迁移直接删本地）→ 按序迁移 projects→habits→tasks→subtasks(parent 二次 update)→habit_entries→focus_logs，全程 ID 重映射（content+created_at 回填 taskMap）→ **calendar events 刻意不迁移**（ADR 0014:49-51）→ 清 flag + reload。
- **登出**（AuthProvider.tsx:269-277）：guest 仅清 flag（本地数据保留）；注册用户 signOut 后**不会**自动回退 guest。

### 4.4 Backup / WebDAV（佐证全域数据清单）

备份覆盖 6 实体 + location_history（src/lib/backup/types.ts:19-28）：tasks、projects、habits、habit_entries、focus_logs、events。云端恢复按 `RESTORE_ORDER = projects → habits → tasks → habit_entries → focus_logs → calendar_events` upsert 保 id + 删 stale（src/lib/backup/cloud-data.ts:50-57,88-132）。WebDAV 走同源代理 `/api/webdav/*`（备份非同步，ADR 0015）。

---

## 5. Mutation 发生位置（本次普查最重要项）

### 5.0 两层结构总览

```
组件 → useXxxMutations hooks（useMutation + 乐观更新 + invalidate）
     → src/lib/mutations/*.ts（纯 service 函数，内部 if(isGuest) 分流 mockStore / supabase-js）
     → mockStore（localStorage）或 Supabase 表（RLS）
```

`src/lib/mutations/` 共 6 文件：task.ts（8 方法）、habit.ts（5）、calendar-event.ts（3）、project.ts（7）、focus.ts（3）、importSource.ts。**mutations 目录本身不含 useMutation**——乐观更新在 hooks 层。

### 5.1 写操作全链路表

**Task**（hook 层：src/lib/hooks/useTaskMutations.ts；service 层：src/lib/mutations/task.ts）

| 操作        | 触发组件（调用点）                                                                                                             | mutation hook                                                     | service 函数                                                                        | 最终落点                                                                                | invalidate                                                     | 乐观                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| 创建        | tasks/TaskSheet.tsx:120、TaskDetailPanel.tsx:88、SubtaskList.tsx:243                                                           | useCreateTask（useTaskMutations.ts:34-122）                       | taskMutations.create（task.ts:56-130，已复核）                                      | `tasks` insert / mockStore.addTask；day_order=max+1                                     | invalidateTaskCaches 全套（useTaskMutations.ts:22-32，已复核） | ✓（`_clientId` 幂等 ID）                               |
| 更新        | TaskSheet.tsx:121、TaskDetailPanel.tsx:87、SubtaskList.tsx:245、CompletedTasksSheet.tsx:44、TaskList.tsx:133、TaskBoard.tsx:83 | useUpdateTask（:202-240）                                         | taskMutations.update（task.ts:338-383；recurrence 变更自动补 seriesId）             | `tasks` update / mockStore                                                              | 同上                                                           | ✓                                                      |
| 完成 toggle | TaskItem.tsx:69、TaskList.tsx:135、SubtaskList.tsx:244、CompletedTasksSheet.tsx:44                                             | useToggleTask（:124-200）                                         | taskMutations.toggle（task.ts:132-336）                                             | `tasks` update + **循环任务展开：插入下一 Occurrence 新行**；guest 完成时补假 focus_log | 同上                                                           | ✓                                                      |
| 删除        | TaskItem.tsx:68、TaskSheet.tsx:122、TaskDetailPanel.tsx:89、SubtaskList.tsx:246、TaskList.tsx:134                              | useDeleteTask（:242-360，含 Undo toast + uiStore.lastUndoAction） | taskMutations.delete（task.ts:388-413，返回级联子任务供 Undo）+ restore（:418-432） | `tasks` delete（DB 级联子任务）/ mockStore                                              | tasks/subtasks/calendar-tasks/stats-dashboard                  | ✓ + Undo                                               |
| 排序        | TaskList.tsx:132、TaskBoard.tsx:84、SubtaskList.tsx:247                                                                        | useReorderTasks（:362-438）                                       | taskMutations.reorder（task.ts:438-461）                                            | `tasks` 逐条 update day_order / mockStore                                               | :431-436                                                       | ✓（拖拽中 TaskList.tsx:237,943 还直接 setQueriesData） |
| 清除已完成  | CompletedTasksSheet.tsx:131                                                                                                    | useClearCompletedTasks（:440-478）                                | taskMutations.clearCompleted（task.ts:463-488）                                     | `tasks` delete where completed / mockStore                                              |                                                                | ✓                                                      |
| 复制        | TaskList.tsx:136                                                                                                               | useDuplicateTask（:480-514）                                      | taskMutations.duplicate（task.ts:490-585，递归复制子任务、剥离 series）             | `tasks` insert / mockStore                                                              |                                                                | ✗                                                      |

**Habit**（useHabitMutations.ts / mutations/habit.ts）

| 操作              | 触发组件                                 | hook                                                                     | service                                                | 落点                                                                                                                                   | 乐观  |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 创建/更新/删除    | habits/HabitSheet.tsx:99-101             | useCreateHabit(:13-26) / useUpdateHabit(:28-41) / useDeleteHabit(:43-79) | habitMutations.create/update/delete（habit.ts:42-165） | `habits` / mockStore                                                                                                                   | ✗/✗/✓ |
| **打卡 check-in** | HabitCard.tsx:45、HabitCompactRow.tsx:52 | useMarkHabitComplete（:123-213）                                         | habitMutations.markComplete（habit.ts:192-216）        | **`habit_entries` upsert onConflict(habit_id,date)** / mockStore.setHabitEntry（幂等 value-set，防双击 desync，mock-store.ts:924-967） | ✓     |
| 排序              | HabitCompactList.tsx:60                  | useReorderHabits（:81-121）                                              | habitMutations.reorder（habit.ts:170-190）             | **RPC `reorder_habits`**（单事务原子）/ mockStore                                                                                      | ✓     |

**CalendarEvent**（useCalendarEventMutations.ts / mutations/calendar-event.ts）

| 操作 | 触发组件                                                                        | hook                             | service                                                                          | 落点                                                                                                                       | 乐观                                 |
| ---- | ------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 创建 | calendar/CreateEventDialog.tsx:138、ImportExportMenu.tsx:39、useIcsImport.ts:12 | useCreateCalendarEvent（:14-30） | calendarEventMutations.create（calendar-event.ts:10-96）                         | `calendar_events` insert + `sync_state:'pending_create'`（查 external_calendars 找同步目标）；**guest 仅返回 stub 不落库** | ✗（onSuccess 直写 useCalendarStore） |
| 更新 | CreateEventDialog.tsx:139                                                       | useUpdateCalendarEvent（:32-46） | calendarEventMutations.update（calendar-event.ts:98-130，sync_state 状态机转移） | `calendar_events` update；**guest throw not implemented**                                                                  | ✗                                    |
| 删除 | CreateEventDialog.tsx:140                                                       | useDeleteCalendarEvent（:48-60） | calendarEventMutations.delete（calendar-event.ts:132-179）                       | pending_create→hard delete；其余→`pending_delete`；纯本地→软删 is_archived；**guest no-op**                                | ✗                                    |

**Focus / Timer**（特殊：绕过 Query cache，见 §6.1）

| 操作                                     | 触发点                                                                                                                                                                                     | 链路                                                                                                                                                                  | 落点                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 计时器 start/pause/stop/cancel/skip/设置 | app/focus/page.tsx:39、FloatingTimer.tsx:27、PiPTimer.tsx:28、FocusSettingsDialog.tsx:394、CancelSessionButton.tsx:27、FocusTaskPicker.tsx:54 —— 全经 TimerProvider.tsx:44 → useFocusTimer | Zustand timerStore 即时 → useFocusTimer.syncToServer（useFocusTimer.ts:66-68,244-288）→ focusMutations.upsertTimerState（focus.ts:66-110，upsert onConflict user_id） | `user_timer_state`                                                                          |
| 完成（多设备原子竞选）                   | timerStore.completeTimer（timerStore.ts:223-270）dispatch CustomEvent "timer-complete" → useFocusTimer.handleComplete（useFocusTimer.ts:87-113）                                           | focusMutations.claimTimerCompletion（focus.ts:121-169）                                                                                                               | 条件 UPDATE `.eq("is_running",true).eq("ends_at",claim_ends_at)`——只有一方 data.length>0    |
| focus log 写入                           | 同上（有 activeTaskId 时，useFocusTimer.ts:115-121）                                                                                                                                       | 内联 useMutation `["logFocusSession"]`（:78-85）→ focusMutations.logSession（focus.ts:31-64）                                                                         | `focus_logs` insert / mockStore.addFocusLog；invalidate stats-dashboard + today-focus-count |

**Project**（useProjectMutations.ts / mutations/project.ts）

| 操作                            | 触发组件                                                      | hook → service                                                                                                                                                    | 落点                                       | 乐观 |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---- |
| 创建/更新                       | projects/CreateProjectDialog.tsx:65、EditProjectDialog.tsx:66 | useCreateProject(:9-56) / useUpdateProject(:58-71) → projectMutations.create/update（project.ts:18-77）                                                           | `projects` / mockStore                     | ✓/✗  |
| 归档/恢复                       | DeleteProjectDialog.tsx:50、ArchivedProjectsDialog.tsx:26     | useArchiveProject(:73-108) / useUnarchiveProject(:140-154) → projectMutations.archive/unarchive（project.ts:79-100,141-162）                                      | `projects`；invalidate projects+tasks 双域 | ✓/✗  |
| 硬删除（含先移任务/删任务选项） | DeleteProjectDialog.tsx:51-53                                 | useMoveTasksToInbox / useDeleteProjectTasks / useHardDeleteProject（:110-169）→ projectMutations.moveTasksToInbox/deleteProjectTasks/delete（project.ts:102-178） | `tasks` update/delete + `projects` delete  | ✗    |

### 5.2 单一 Mutation Path 验证结论

**交互式 CRUD 已收敛**：全仓 `supabase.from(` 统计——src/ 100 处 + app/ 22 处；**src/components/ 仅 2 处且均为只读**（FocusTaskPicker.tsx:100 tasks select、auth/AuthPage.tsx:58 profiles select）；app/ 非 API route 仅 admin/metrics/page.tsx:29 一处只读。**组件零直写**，符合 AGENTS.md 规定。

**但存在 5 类客户端绕过 mutations/ 目录的写路径**：

1. **useMigrationStrategy.ts**（guest→注册一次性迁移）：直接 insert projects(:98)/habits(:132)/tasks(:173)、update tasks.parent_id(:200)、insert habit_entries(:223)/focus_logs(:240)。
2. **useAccountData.ts**（备份导入/云端清空）：insert 各表（:82,:88,:103）、clearCloudData 逐表 delete（:131-134）。
3. **useUhabitsImport.ts:143-149**：habit_entries 批量 insert（500/块；habit 定义走 habitMutations.create 但 entry 历史绕过）。
4. **useProfile.ts:57-60,88-91**：profiles update（useMutation 内联在读取 hook 中，未沉淀到 mutations/）。
5. **src/lib/sync/orchestrator.ts**（外部日历同步引擎）：直接写 `calendar_events`（delete:179、update drain:201-214、批量 insert:301、update:328-335、archive:343-346、hard delete:353-356、adopt:362-369）+ `external_calendars`（:384）。

**服务端写路径**（设计上不属于客户端 mutation 层）：API routes（telemetry insert、push_subscriptions upsert/delete、calendar connect/disconnect 写 tokens/events/calendars）、edge functions（process-queue 写 notification_queue、daily-briefing insert 通知）、**SQL 触发器**（handle_task_notification_sync / handle_timer_notification_sync 写 notification_queue）、RPC `reorder_habits`。

**timerStore 本身不直写 DB**——所有 `user_timer_state` 写都经 focusMutations。✅

---

## 6. Realtime / 同步 / 通知

### 6.1 Realtime：仅 user_timer_state 一张表（已 grep 复核：全 src 仅 useTimerSync.ts:173 一处 .channel(）

- 订阅点：src/lib/hooks/useTimerSync.ts:172-224，channel `timer-sync:${user.id}`，postgres_changes 监听 `public.user_timer_state` UPDATE。
- 事件处理：本机 source_device_id 跳过（防回声 :185）→ `updated_at <= lastKnownUpdatedAt` 丢弃陈旧写（:187-192）→ **`remoteRowToState` 直接 `useTimerStore.setState`（不经过 TanStack Query）**（:203-206）→ 远端停止 toast（:208-214）。
- REPLICA IDENTITY FULL（migration 20260604120000:13）——因 user_id 非 PK，默认 WAL 不含它导致过滤静默丢事件（TIMER-01 修复）。
- **tasks/habits/events 无任何 realtime 订阅**——ADR 0002 提到的 "tasks-changes pattern" 在当前代码不存在；Premium 的 realtime mirroring 是未建功能。跨设备数据新鲜度 = invalidate + refetchOnWindowFocus + 手动 Sync now。

### 6.2 离线支持与冲突处理

- **离线检测**：useIsOnline.ts:5-24（useSyncExternalStore + navigator.onLine + online/offline 事件）；OfflineIndicator 纯展示（"Changes will sync when back online"）。
- **离线 mutation 行为**：`networkMode: "offlineFirst"` → mutation 进 paused；恢复后 resumePausedMutations（带 auth 守卫，QueryProvider.tsx:107-123）；14 个 mutationKey 注册 setMutationDefaults 使 paused mutation **跨页面重载可恢复**。
- **src/lib/sync/ 是外部日历双向同步引擎**（非离线队列）：adapter-interface / google / microsoft / caldav-adapter / orchestrator（pull/push 核心）/ pull-merge（差量计算）/ conflict（**LWW**：sync_state null→remote 赢、pending_delete→local 赢、其余比 updated_at；conflict.ts:11-25）/ crud-state / sync-scheduler（30s 自动节流 + 本地编辑信号 debounce 2.5s）。`calendar_events.sync_state` 是推送队列标记。
- **冲突处理**：日历有 LWW + push 侧 updated_at CAS（orchestrator.ts:199-215）；timer 有 claim 原子裁决 + updated_at 门槛；**tasks/habits 无显式冲突处理**（单用户单写者假设，靠乐观回滚 + invalidate 重取）。

### 6.3 通知系统

- 链路：**SQL 触发器**（task due/do、timer 链 MAX_CHAIN_DEPTH=5）写 `notification_queue` → cron 每分钟 → process-queue Edge Function（长轮询 50s，rpc claim_due_notifications 原子认领 ≤50 行 → webpush 发送 → sent/failed/retry 状态机，process-queue/index.ts:103-222）→ Web Push；daily-briefing 按用户时区 8:00/18:00 生成 briefing（daily-briefing/index.ts:23-75）。
- 客户端：usePushNotifications.ts:97-157（pushManager.subscribe VAPID → POST /api/push/subscribe；visibilitychange 重同步应对 endpoint 轮换）；guest 全程跳过。
- toast 收敛在自有 notify 接口（ADR 0008：description 与 action 互斥的 discriminated union，禁止直接 import sonner）。

---

## 7. UI / 导航 / 设计系统

### 7.1 导航与布局（未来加 "Workspaces" 区域的位置）

| 文件                                                     | 职责                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| src/components/layout/AppShell.tsx                       | 全局外壳：装配 Sidebar/Header/MobileNav + 全局 overlay（TaskSheet/HabitSheet/CommandMenu 等 dynamic+ssr:false 懒加载 :58-123,197-260）+ 挂载 useMigrationStrategy（:406） |
| src/components/layout/AppSidebar.tsx                     | 桌面侧边栏（shadcn Sidebar 封装）+ 移动端项目 Drawer                                                                                                                      |
| src/components/layout/Header.tsx / MobileNav.tsx         | 移动端顶栏 / 底部 tab（framer-motion）                                                                                                                                    |
| src/components/layout/GlobalHotkeys.tsx / GlobalFabs.tsx | 全局快捷键（mod+k、1-6 数字导航 :152-157、t 主题）/ 按路由条件 FAB                                                                                                        |

**导航项为数组配置**（已复核）：`mainNavItems` = All Tasks `/`、Habits、Calendar、Stats（AppSidebar.tsx:68-73）；`secondaryNavItems` = Focus、Settings（:75-78）；移动端独立 `navItems`（MobileNav.tsx:10-14）。侧边栏结构：Header → 主导航 → Separator → **Projects 可折叠区块**（SidebarGroup :202-371，uiStore.isProjectsOpen + grid-rows 动画，Inbox 固定项 + useProjects 列表 + Archived 入口）→ 次级导航（桌面 :373-405）→ Footer。

**Workspaces 插入点（已复核）**：**AppSidebar.tsx:371（Projects `</SidebarGroup>` 闭合）与 :373（次级导航 `{!isMobile && (` 之间）**——复刻 Projects 区块模式作为兄弟 SidebarGroup；折叠态仿 uiStore `isProjectsOpen`（uiStore.ts:19-20,116-118）新增 `isWorkspacesOpen`；若是单路由入口则直接改 `mainNavItems`（一处改动同时影响桌面侧栏与移动抽屉，注意 AppSidebar.tsx:147-154 移动端过滤逻辑）。配套：CommandMenu Navigation group 加 CommandItem（src/components/command-menu.tsx:412-439）、GlobalHotkeys 数字键（:152-157）、移动端底栏 MobileNav.tsx:10-14。

### 7.2 ink & matte 视觉风格载体

- **Tailwind v4 CSS-first**：无 tailwind.config 文件（postcss.config.js:1-5 仅插件）；全部在 app/globals.css：`@theme inline`（:9-70）桥接 HSL 变量为 token。
- **浅色 "Matte & Ink"（:root :115-150）**：background `40 20% 99%`（暖纸）、foreground/primary `0 0% 18%`（墨色，**黑即主色**）、muted 纸灰 `60 9% 96%`、brand `220 44% 50%`（#4B6CB7 Kanso 蓝，唯一彩色之一）、destructive 深陶土红 + surface 三元组。
- **深色 "Sumi Ink"（.dark :152-186）**：background `0 0% 10%`（墨黑）、card `0 0% 13%`（炭黑）、primary 反转淡墨、brand 同蓝。
- **哑光 = 禁阴影**：card.tsx:6 注释 "shadows are strictly prohibited in the Matte UI"，Card/Dialog 均 `shadow-none` + `border border-border/80` 以 1px 边框替代阴影（card.tsx:7-19、dialog.tsx:46）。
- **水墨动效**：任务完成灰度化 + 墨线划除（globals.css:361-428）、`sumi-red-action` 朱砂（:348-359）、`--ease-seijaku` 主缓动 + Framer Motion 弹簧统一 `mass:1 stiffness:280 damping:60`（:62-69）。
- 圆角分档：控件 rounded-md → 容器 rounded-xl；图标 stroke 2.25；44px 触控目标（globals.css:343-346）；排版 utilities type-h1…touch（:243-306，负字距）。
- next-themes：class 策略，ThemeProvider.tsx:6-11，layout.tsx:83-88 挂载（system 默认）。

### 7.3 页面路由与入口

| 路由        | 入口                                                    | 说明                                                                                                                                 |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/`         | HomeClient（src/components/home/HomeClient.tsx:25-144） | **Tasks 首页**：viewMode 分流 SplitViewLayout（≥1024px 主从面板）或 TaskList（列表/看板）；`?project=<id>` 过滤（HomeClient.tsx:53） |
| `/habits`   | 页内自包含（app/habits/page.tsx:17-137）                | HabitCard / HabitCompactList                                                                                                         |
| `/calendar` | 页内自包含（app/calendar/page.tsx:20-183）              | YearView/TimeGrid/MonthView/ScheduleView 按 view 切换                                                                                |
| `/focus`    | 页内自包含（app/focus/page.tsx:37-244）                 | 计时器全屏页（隐藏侧边栏与底栏）                                                                                                     |
| `/stats`    | StatsClient（薄壳 RSC）                                 | recharts + react-activity-calendar                                                                                                   |
| `/settings` | SettingsClient（薄壳 RSC）                              | version 来自 package.json props                                                                                                      |

**Projects 无路由**——侧边栏折叠面板 + CreateProjectDialog/EditProjectDialog/DeleteProjectDialog/ArchivedProjectsDialog（src/components/projects/）+ CommandMenu 命令 + 快捷键 p/a。Task Insights 也是 TaskSheet 内嵌面板（tasks/TaskSheet.tsx:322），非独立路由。

---

## 8. 测试

- **框架**：Vitest 4（jsdom，tests/unit/setup.ts，alias `@→src`，vitest.config.ts:1-24，无 coverage 配置）+ Playwright 1.61（chromium + mobile-webkit iPhone 14 两个 project；webServer 自动起 dev server `npm run dev`，playwright.config.ts:14-19）。
- **组织**：tests/unit/ **镜像 src 结构**（约 190+ 文件）：hooks/（useTaskMutations、useHabitMutations、useMigrationStrategy、useTimerSync…）、lib/mutations/、lib/sync/（pull-merge、orchestrator、google-adapter）、lib/schemas/、components/tasks/（Vim 导航、DnD 竞态约 35 个）等。tests/e2e/ 22 个 spec（离线启动、SW 预缓存、安全头、任务创建、uhabits 导入…，support/guest-mode.ts 提供 guest 种子工具）。
- **运行**：`npm test`（vitest watch 模式）、`npx vitest run <path>` 单文件、`npm run e2e`（自动管理 dev server）、`npm run validate`（format+lint+typecheck+test 并行）。
- **自定义 lint 规则**：`no-unbounded-supabase-select`（eslint-rules/，有对应测试）——强制 supabase 查询带上限。

---

## 9. ASCII 架构图（组件 → hooks → 状态 → 数据层完整数据流）

```
┌─────────────────────────── 路由层 app/（薄壳） ───────────────────────────┐
│  / (Tasks)→HomeClient   /habits   /calendar   /focus   /stats   /settings │
│  API routes: /api/{calendar,push,telemetry,webdav,health}  /auth/callback│
└──────────────────────────────────┬────────────────────────────────────────┘
                                   ▼
┌─ Provider 栈 (app/layout.tsx:83-96) ─────────────────────────────────────┐
│ ThemeProvider → QueryProvider(PersistQueryClientProvider + IndexedDB)     │
│   → AuthProvider(isGuestMode) → TimerProvider → AppShell → PiPProvider    │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   ▼
┌─ 组件层 src/components/* ─────────────────────────────────────────────────┐
│ TaskList/TaskItem/TaskSheet   HabitCard/HabitCompactRow   CreateEventDialog│
│ projects/*Dialog   focus页→TimerProvider   AppSidebar   CommandMenu        │
└────┬──────────────────┬──────────────────────┬───────────────────────────┘
  读 useQuery        写 useMutation          Timer 写(即时)
  useTasks           useTaskMutations        timerStore.start/pause/…
  useHabits          useHabitMutations       (Zustand, localStorage
  useCalendarEvents… useProjectMutations     kanso-timer-storage)
  useProjects…       useCalendarEventMutations      │
     │              (onMutate: setQueryData 乐观    │ syncToServer
     │               onError: 回滚                    ▼
     │               onSettled: invalidate)  focusMutations.upsertTimerState
     │                      │                          (user_timer_state upsert)
     ▼                      ▼                                 │
┌─ TanStack Query 缓存（唯一客户端一致性视图）────────────────┐  │
│ queryKey: ["tasks",{projectId,…,isGuestMode}]…            │  │
│ IndexedDB 持久化 REACT_QUERY_OFFLINE_CACHE (idb-keyval,7天)│  │
│ 14 个 setMutationDefaults → 离线 paused mutation 可恢复    │  │
│ networkMode:"offlineFirst" + 恢复时 auth 守卫             │  │
└───────┬──────────────────────────────────────────────────┘  │
        │ queryFn / mutationFn（if isGuestMode 内联分流）        │
        ├────────────────────────────┐                          │
        ▼                            ▼                          ▼
┌─ Guest: mockStore ─────┐  ┌─ Cloud: supabase-js ─┐  ┌─ Supabase Postgres ─┐
│ localStorage           │  │ RLS: user_id =       │  │ tasks/habits/…     │
│ kanso_guest_data_v11   │  │ auth.uid()           │◄─┤ + 触发器(通知)      │
│ 6 实体 + seed_ids      │  │ fetchAllRows 分页     │  │ + cron → edge fn   │
│ (demo 数据 + strip)    │  │ RPC reorder_habits   │  │ process-queue 等    │
└────────────────────────┘  └──────────────────────┘  └─────────┬─────────┘
                                                                  │ Realtime
                                                                  ▼
                                              仅 user_timer_state (UPDATE)
                                    useTimerSync → useTimerStore.setState（直写 Zustand，
                                    不经 Query cache；serverClock 校时 + claim 原子竞选）
```

写路径时序（以任务 toggle 为例）：TaskItem → useToggleTask.onMutate（cancelQueries + setQueryData 直写缓存）→ taskMutations.toggle（isGuest? mockStore.updateTask + 循环展开 : supabase update + insert 下一 Occurrence）→ onSettled invalidateTaskCaches（6 个前缀 key 失效）→ 相关 query 异步 refetch。

---

## 10. 对 Workspace 集成的关键发现

### 10.1 后续设计必须依赖的事实

1. **Mutation 已有收敛点，Command Layer 的缝是现成的**：所有交互式 CRUD 走 `src/lib/mutations/` 六个纯 service 对象（组件零直写），且 14 个 mutationKey 已在 QueryProvider.tsx:48-95 注册为全局 defaults（resumable）。未来 Command Layer 最自然的落位是：包装 `useXxxMutations` hooks 层与组件之间，或直接以 `xxxMutations.*` 方法为实现核。mutationKey 体系可免费复用为命令标识符。
2. **读取侧同样收敛于 useXxx hooks，Workspace 投影可零成本获得双向一致性**：Workspace 节点直接消费 useTasks/useHabits/useCalendarEventsList 等同一批 hooks——相同 queryKey = 同一 Query cache 条目 = 与普通 UI 天然实时一致（同标签页内）。无需自建同步。
3. **Guest/Cloud 双轨无接口抽象，靠内联 if 分流**：每个 queryFn/mutationFn 开头 `localStorage.getItem("kanso_guest_mode")`（mutations 层，无法用 useAuth）。Workspace 新增 Command 时必须沿用同一双分支模式（或借此机会抽 repository 接口——需权衡破坏面）。
4. **「事件总线」的最近似物是 invalidate 依赖图 + Query cache 事件**：无事件总线；但 `invalidateTaskCaches`（useTaskMutations.ts:22-32）这类"写 → 需失效的 key 集合"就是现成的「写 → 派生视图」依赖图。Workspace 若需感知写，可选 TanStack Query 的 cache 事件订阅（queryClient.getQueryCache().subscribe）或挂载在既有 onSettled 点——不建议自建平行 bus。
5. **Realtime 仅 user_timer_state**：tasks/habits/events 无跨设备/跨标签推送。Workspace 的一致性模型必须基于「Query cache 是唯一信任源 + invalidate 驱动」，而非订阅 DB 变更流。Timer 是唯一例外（Zustand 直写 + realtime 回流），投影"进行中的专注"应读 timerStore，投影历史应读 focus_logs 相关 query——两个不同来源。
6. **Calendar 链路是异类，节点投影需专门处理**：calendar event mutation 无乐观更新（onSuccess 直写 useCalendarStore 镜像 + invalidate）；guest 模式 create 不落库、update throw、delete no-op（calendar-event.ts:17-41,104-106,137-139）。
7. **类型即 DB row（snake_case 直通），无映射层**：Workspace 若为节点元数据新建表并采用 camelCase，将是全仓第一个引入 row↔domain 映射的地方；若沿用 snake_case 直通风格则保持一致。同时 **schema.sql 与 migrations 双源**（schema.sql 已滞后 3 处列），新表 DDL 必须双写。
8. **Guest 容量红线**：guest 全部数据在 localStorage 单 key JSON（kanso_guest_data_v11），import sources 已因 5MB 上限迁去 IndexedDB（importSource.ts:4-6 注释）。Workspace 节点/画布数据若要支持 guest 模式且体积可观，应直接走 IndexedDB（idb-keyval 先例现成）。
9. **侧边栏扩展点已验证**：AppSidebar.tsx:371-373（Projects 区块后、次级导航前）插入 Workspaces SidebarGroup；折叠态仿 uiStore.isProjectsOpen（uiStore.ts:19-20）；路由入口加 mainNavItems（AppSidebar.tsx:68-73）+ CommandMenu Navigation group（command-menu.tsx:412-439）+ GlobalHotkeys（:152-157）。
10. **既有 ADR 体系是设计输入**：尤其 ADR 0002（server-anchored timer——Workspace 引用 timer 的语义约束）、ADR 0008（notify 接口——Workspace 的 toast 必须走 notify）、ADR 0014（demo 剥离——guest 模式下创建的 Workspace 数据在注册迁移时的去留需明确决策）、ADR 0015（WebDAV 是备份非同步）。

### 10.2 风险清单（与"单一数据源"原则的冲突/阻碍点）

1. **Command Layer 无法覆盖全部写路径**：5 类客户端绕过（迁移 useMigrationStrategy、备份导入 useAccountData、uhabits 导入 useUhabitsImport:143-149、profile 更新 useProfile:57-60、日历同步引擎 sync/orchestrator.ts）+ 服务端写（SQL 触发器、edge functions、API routes、RPC）。**Workspace 投影必须以 Query cache 为唯一信任源，绝不能把"命令日志"当作数据真相**——数据可以不经任何命令到达 DB 与缓存。
2. **无集中 queryKey 工厂且 key 含对象字面量**：`["tasks", { projectId, showCompleted, filter, isGuestMode }]` 这类形状只能前缀匹配失效。Workspace 新增的任何 query 必须遵守既有前缀约定（["tasks"]/["habits"]/…），否则写后 invalidate 失配 → 投影陈旧。建议 Workspace 阶段顺手建立 key 工厂（渐进式，先包不改）。
3. **乐观更新 + 离线重放 = "mutation 成功返回 ≠ DB 最终态"**：offlineFirst 下 mutation 可长期 paused（页面重载后恢复），乐观态与回滚窗口都存在。Workspace 节点状态要能表达 pending/failure 中间态，且 undo/redo 设计不能假设命令线性持久。
4. **跨标签页无一致性机制**：Query cache 每标签页独立，未发现 BroadcastChannel/storage 事件桥接。同一用户两个标签页打开普通 UI 与 Workspace，会各自持有独立缓存，另一端写入后本端需等 refetchOnWindowFocus/invalidate（仅本标签内生效）。跨标签实时一致需要额外机制（如 BroadcastChannel 转发 invalidate）。
5. **uiStore 已是巨型混合 store**（30+ 字段持久化 localStorage）：Workspace 视图状态（画布缩放/滚动/展开态）不应再塞 uiStore——应新建独立 persisted store 并沿用 partialize/version/migrate 惯例（timerStore.ts:272-296 是最佳样本）。
6. **tasks/habits 无冲突模型**（单用户单写者假设，无 updated_at 比较）：日历有 LWW（sync/conflict.ts:11-25）、timer 有 claim 条件 UPDATE（focus.ts:149-165）——若 Workspace 未来引入多设备并发编辑节点/编排，没有可直接照抄的通用冲突层，最近的样板是这两个。
7. **guest 模式功能不对称**：calendar 三写操作在 guest 下分别是 stub/throw/no-op；Workspace 在 guest 下对 calendar 类节点的行为需要专门的降级设计（且 CONTEXT.md 明确 CalDAV 在所有 tier 都是 deferred）。
8. **备份/恢复是枚举式全清**（BackupSyncSettings.tsx:363-374 枚举 12 个 key 前缀）：Workspace 新增 query/实体若需要纳入备份与恢复语义，必须同步更新这些枚举清单，否则 restore 后 Workspace 投影会读到陈旧数据。同理 useGuestStoreActions.ts:9-30 的 GUEST_QUERY_KEYS。
9. **schema 演进双写负担**：新 Workspace 表需同时改 schema.sql + migration + RLS（user_id = auth.uid() 惯例）+ 若需 realtime 则考虑 REPLICA IDENTITY（user_timer_state 的教训）。
10. **命名纪律**：CONTEXT.md 是 load-bearing 词汇表（"Sync" 四义、Habit vs Entry、demo 而非 mock——尽管路径仍叫 src/lib/mock/）。Workspace 相关命名（Node/Edge/Board/Canvas 等）进入代码前需先对照消歧，冲突必须在文档层解决而非代码层混用。

---

## 附：普查覆盖度说明

- §1-§8 全部 8 项研究清单已覆盖；行号引用来自 4 个并行探索代理的交叉验证 + 人工直接复核（mutations/task.ts、QueryProvider.tsx 全文、realtime grep、AppSidebar.tsx 插入点、mock-store.ts、useTaskMutations.ts）。
- 已知局限：supabase/schema.sql（约 1400 行）与 44 个 migration 未逐行通读，仅按表精读关键段；tests 只归纳覆盖面未逐文件核验；`docs/adr/` 15 篇中精读了 0001/0002/0008/0014 相关内容（经代理转述）。
