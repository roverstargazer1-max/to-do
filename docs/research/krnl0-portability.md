# KRNL0 可移植性研究：吸收 / 丢弃裁决报告

- **日期**：2026-09-08
- **研究对象**：`d:\Projects\to-do\references\KRNL0`（Electron + React + React Flow 画布式生产力应用，只读参考）
- **目的**：为 Kagelin（Next.js + Supabase + TanStack Query + Zustand）的 additive Workspace 功能做出逐概念的"吸收 / 丢弃"裁决。Kagelin 是 Domain 数据唯一所有者，Workspace 只是投影/编排层。
- **方法**：4 个并行代码探索（Node model/registry、画布与持久化、Edge 与 Mutation path、CLI/Claude/ADR）+ 关键引用人工复核（`node.ts`、`edge.ts`、`registry.ts`、`SysFacade.ts`、`handlers.ts`、`rpc/server.ts`、`followup-edge-runtime-dispatch.md` 均已直接读源验证）。
- **行号约定**：所有行号基于当前 `references/KRNL0` 工作区快照，路径相对 `references/KRNL0/`。

---

## 0. 执行摘要（TL;DR）

KRNL0 最有价值的不是任何具体代码，而是四条已被验证的架构思想：

1. **"Persist intent, derive at read"**（只持久化意图，读取时派生）——cascade 调度不写扇出，selector 读时计算（ADR 0003/0005）。这是全场最普适、最值得原样吸收的思想。
2. **"Mother 节点不拥有领域数据"**——Calendar mother 的 state 只有 `selectedDate/anchorDate/zoom` 视图状态，领域关联靠 task 上的 `scheduledFor` 字段，边只是装饰（ADR 0001 §8）。这与 Kagelin"Workspace 是投影层"的约束**天然同构**。
3. **"AI 与人共用同一命令面，无后门"**——Claude 走用户能敲的同一个 CLI，帮助文本从命令注册表生成，读命令带 `--json`（decisions.md D3、D4）。
4. **"每类节点 = 纯函数 FSM + 纯渲染组件"**——`commands.ts` 是 `(state, args) => state` 的纯函数，可测试、可跨端复用。

最大的反面教训同样是四条：

1. **Edge 的运行时分发从未实现**——数据模型完整（类型/Zod/CLI CRUD 全齐），但"节点发事件 → kernel 分发匹配边"的循环一行都没有，边至今纯视觉（`followup-edge-runtime-dispatch.md:9` 亲口承认）。**规格超前实现一年，文档与现实脱节**。
2. **双 mutation path 语义漂移**——`SysFacade`（CLI 路径）与 `commandDispatch.ts`（UI 路径）部分重复、部分漂移，ADR-0014 §2 自己承认"CLI 静默 desync 运行中应用的 pomo 状态"，收敛重构至今未完成。
3. **Registry 分散在 6-8 处**——声明式的 `NodeKindSpec`（`node.ts:44-52`）只是愿景，运行时实际是三张手写表 + 一个集中 switch，新增节点类型要改 6-8 个文件。
4. **单文件整板快照持久化**——每次 mutation 立即 `JSON.stringify` 整板写 `board.json`（无 debounce、无增量），靠 RPC 单飞互斥锁防撕裂。这在多用户云环境是灾难模型。

一句话总纲：**吸收 KRNL0 的"意图持久化 + 派生读取 + 纯函数命令"内核，丢弃它为"Electron 单进程 + 单 JSON 文件 + PTY 子进程"环境发明的全部补偿机制（named-pipe RPC、文件互斥、整板快照、镜像双写）**。

---

## 1. 可移植性裁决表（核心交付物）

| #   | 概念                        | a) 核心思想（一句话本质）                                                                                           | b) 裁决                                 | c) Electron/本地文件特有部分及原样复制的问题                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | d) 映射到 Kagelin（Next.js + Supabase + TanStack Query + Zustand）                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Node model**              | 最小节点信封：`{id, kind, position, state, config, isMother}`，state 必须可 JSON 序列化、不含函数/DOM               | **吸收思想（反转形态）**                | KRNL0 把业务数据**内嵌**在 `node.state`（如 `TaskState.text/done` 全在节点上）。原样复制会复制出 task↔todo **镜像双写**（Decision 20）——正是 Kagelin"Workspace 不存业务字段"约束要防的噩梦                                                                                                                                                                                                                                                                                                                            | 保留信封结构，但 `state` 换成**纯引用元数据**：`{ entityId, entityType, displayConfig }`。KRNL0 里 `HabitLaneState = { habitId }`、`ImageState = { assetId }`（[HabitLaneNode/types.ts:5-7](../../../references/KRNL0/src/renderer/components/nodes/HabitLaneNode/types.ts#L5-L7)）就是这个形态，直接参考。实体数据留在 Supabase domain 表，经 TanStack Query 按 id 拉取                                                                |
| 2   | **Node registry**           | "一种 node 类型 = 类型定义 + 默认值 + 渲染组件 + 纯函数命令集"的模块化规约                                          | **吸收思想 + 参考实现（合并）**         | KRNL0 实际是**三张手写表 + 一个集中 switch**（渲染表×2、`applyCommand` 巨型 switch、持久化 DEFAULTS 表），新增类型改 6-8 处。声明式 `NodeKindSpec`（[node.ts:44-52](../../../references/KRNL0/src/shared/types/node.ts#L44-L52)）写了但没用。原样复制会继承分散注册的高维护成本                                                                                                                                                                                                                                       | 做 KRNL0 没做完的事：**单一声明式 NodeKindSpec**（kind + defaults + component + commands + zod schema），一个 `registerNodeKind()` 一次注册全部能力，渲染表/命令路由/schema 校验从同一份规约派生。workspace node 类型首期 3-4 种（task-ref/habit-ref/event-ref/note）                                                                                                                                                                   |
| 3   | **Mother / Child**          | 固定 6 个"母节点"作为领域功能锚点（Todo/Pomo/Habit/Calendar/Clock/Term），child 通过 state 内 ID 回链挂靠           | **部分吸收**                            | 固定 6 母节点、固定语义 ID（`mother-pomo` 等，[persistence/board.ts:46-115](../../../references/KRNL0/src/main/persistence/board.ts#L46-L115)）、固定 slot 布局是 KRNL0 的"单板单用户"特有设计；mother/child 无树形字段、靠回链 ID + 边表达，链路脆弱                                                                                                                                                                                                                                                                 | 吸收"**容器节点不拥有领域数据**"（Calendar mother state 只有视图状态，[CalendarNode/types.ts:10-17](../../../references/KRNL0/src/renderer/components/nodes/CalendarNode/types.ts#L10-L17)）与 MotherFrame 视觉外壳模式。Kagelin 的容器（分组/泳道）存 `childNodeIds` 引用列表即可；用户 workspace 布局自由，不要固定 6 锚点                                                                                                            |
| 4   | **Edge 模型**               | 边 = 纯数据的自动化意图：`{from:{nodeId,event}, to:{nodeId,command}, args?, enabled}`                               | **吸收思想（数据层），runtime 谨慎**    | KRNL0 边的运行时分发**从未实现**（`followup-edge-runtime-dispatch.md:9`："Edges are visual-only"），唯一读 `edge.enabled` 的代码是线条样式选择（[CanvasFlow.tsx:124](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L124)）。原样复制会得到一个"看起来有自动化、实际不触发"的半成品                                                                                                                                                                                                          | 数据模型可存（workspace_edges 表：source_node/event → target_node/command）。但裁决是**要么完整实现 dispatch 循环（含防环：visited-edge set + 深度上限，规格见 followup 文档 §5），要么明确标记为视觉连线**——绝不上线 KRNL0 式的"静默不触发"                                                                                                                                                                                            |
| 5   | **Event→Command dispatch**  | 所有状态变更走命名命令；命令处理是纯函数 FSM `(state, args) => state`；跨节点语义收敛在 dispatcher                  | **吸收思想 + 参考实现**                 | 双层 switch（`node.kind × command`）集中分发、27 处手动 `saveBoard` 调用点、"command 完成后硬编码镜像到兄弟节点"（[commandDispatch.ts:1740-1822](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1740-L1822)）是缺乏基础设施下的手工补偿。原样复制会把镜像双写固化进架构                                                                                                                                                                                                                 | 纯 FSM 命令模块直接参考：workspace 专属命令（如 `node.move`、`group.resize`）做成纯函数，落在 `src/lib/mutations/workspace.ts`（对齐 Kagelin 现有 mutations 目录结构）。**不需要 KRNL0 的镜像分支**——因为 Kagelin 的 domain 变更走既有 mutations，workspace 命令只改布局元数据。TanStack Query mutation onSuccess 使 queryKey 精确失效，替代手动 saveBoard                                                                              |
| 6   | **SysFacade**               | 外部进程（CLI/agent）与 UI 共用的命令门面，把 argv 翻译成对 board 的读写                                            | **不吸收（形态），吸收其教训**          | SysFacade 是为"独立进程直写 board.json"发明的：named-pipe RPC + per-launch token + Promise 单飞互斥 + `board:changed` 广播整板重载，全部是 Electron 进程模型补偿。原样复制在 Web 端无处安放                                                                                                                                                                                                                                                                                                                           | Kagelin 已有天然门面：**Next.js API routes / server actions → domain mutations**。要吸收的是 ADR-0014 §2 的教训而非方案——"UI 与 agent 走**同一条** mutation 路径"，agent 功能 = 对既有 mutations 的 HTTP 封装，绝不另起第二套写路径                                                                                                                                                                                                     |
| 7   | **Selectors**               | 派生数据查询层：跨节点结构（任务链 DAG）在**读取时**用纯 selector 派生，引用相等做 memo                             | **强烈吸收思想 + 参考实现**             | 模块级单值缓存（`_cacheKey` 引用比较，[scheduleSelector.ts:87-106](../../../references/KRNL0/src/renderer/store/scheduleSelector.ts#L87-L106)）依赖 Zustand 不可变更新模式；直接搬会与 TanStack Query 的缓存模型打架                                                                                                                                                                                                                                                                                                  | 思想全盘吸收："persist intent, derive at read"。实现换成 **TanStack Query 的 queryKey 组合**：`['workspace', id, 'schedule']` 这类派生查询用 `select` 选项做投影，缓存失效由上游 mutation 精确触发。cascade 式"锚点+链派生"对 Kagelin 的日历排布/任务链展示有直接借鉴价值                                                                                                                                                               |
| 8   | **Board persistence**       | 单文件整板快照：每次 mutation 立即全量 `JSON.stringify` 写 board.json，加载时跑幂等迁移流水线                       | **不吸收实现，吸收两个思想**            | 整板快照 + `writeFileSync`（[persistence/board.ts:653-661](../../../references/KRNL0/src/main/persistence/board.ts#L653-L661)）+ 读-改-写合并 viewport（[handlers.ts:81-87](../../../references/KRNL0/src/main/ipc/handlers.ts#L81-L87)）依赖单进程文件独占。复制到浏览器/云 = 写放大、并发撕裂、无版本历史。**可吸收的思想**：① 加载时幂等 schema 迁移流水线（[board.ts:590-651](../../../references/KRNL0/src/main/persistence/board.ts#L590-L651)，13 步前向 only）；② "persist intent, derive presentation"（D5） | Workspace 布局存 Supabase：`workspace_nodes` / `workspace_edges` 行级表（node = 一行），拖拽位置变更走 **debounced PATCH**（参考 KRNL0 viewport 的 500ms debounce 思想，[useViewportPersistence.ts:4-23](../../../references/KRNL0/src/renderer/hooks/useViewportPersistence.ts#L4-L23)），离线写 IndexedDB 由现有离线管线收编。schema 迁移思想映射为 Supabase migration + 表内 `schema_version` 字段                                   |
| 9   | **CLI**                     | 命令注册表为唯一事实源，帮助/文档从注册表生成；CLI 经 named-pipe RPC 操作运行中应用                                 | **不吸收（传输层），吸收注册表思想**    | named pipe/Unix socket + per-launch token + cli-bin PATH 分发 + PTY 环境注入（[rpc/server.ts:36-42](../../../references/KRNL0/src/main/rpc/server.ts#L36-L42)、[index.ts:221-247](../../../references/KRNL0/src/main/index.ts#L221-L247)）全是"让 OS 子进程进 Electron"的桥梁，Web 端无对应物                                                                                                                                                                                                                         | 命令注册表 + "帮助即生成"思想吸收：Kagelin 若做 agent 命令面，用单一 registry 定义命令（名称/参数/JSON schema），同时生成 API route 校验、帮助文档、agent tool 描述三份产物。传输层用现有 HTTP API + 用户会话鉴权，天然多用户                                                                                                                                                                                                           |
| 10  | **Claude Code integration** | Agent 不走特权通道：spawn `claude -p` 子进程，让它用与人类相同的 CLI 操作应用；CLAUDE.md 世界模型 + skills 诚实文档 | **吸收思想 + 文档模式，不吸收进程模型** | 信任模型 = "PTY shell 后代继承 token"（[adr-0014:111](../../../references/KRNL0/docs/03-architecture/adr-0014-terminal-cli-bridge.md)），单机单用户假设；`bin/claude` shim + CWD hop + asar unpack 是打包补偿。复制到多用户云 = 授权模型完全失效                                                                                                                                                                                                                                                                      | 吸收三件事：① **CLAUDE.md/AGENTS.md 模式**——给 agent 的世界模型文档（数据在哪、怎么改、禁什么，参考 [CLAUDE.md:34-46](../../../references/KRNL0/claude/CLAUDE.md#L34-L46) 的 board 世界模型写法）；② **skills 诚实降级声明**（[wire-edge.md:10-27](../../../references/KRNL0/claude/skills/wire-edge.md#L10-L27) 开头即声明"边不会自动触发"）；③ "无后门"原则。实现走 MCP server 或 agent 专用 API key + RLS，与人类共用 mutations 语义 |
| 11  | **Automation**              | 声明式自动化 = edge 数据 + 派生 selector + 脚本回放三层；真正的"自动"全在读取时派生，不在事件触发                   | **分层吸收**                            | 脚本回放引擎（Assistant flows：预录音频+cameraToNode+runCommand，[Assistant/types.ts:5-53](../../../references/KRNL0/src/renderer/components/Assistant/types.ts#L5-L53)）与单机 Electron 深耦合；edge 触发层未实现                                                                                                                                                                                                                                                                                                    | 分三层吸收：① **派生层**（selector 派生排布/时间线）——零风险，直接做；② **意图层**（edge 数据存储+CRUD）——作为 workspace 自动化的持久化格式；③ **触发层**（event→edge→command 循环）——独立 feature 完整实现（Supabase edge function / 数据库触发器 或客户端 dispatch 循环 + 防环），否则不做                                                                                                                                            |

---

## 2. 分域详析

### 2.1 Node model 与 registry

**数据结构**。Node 是最小信封，业务载荷全部在 `state/config` 两个泛型槽里：

```typescript
// src/shared/types/node.ts:4-12
export interface Node<TState = unknown, TConfig = unknown> {
  id: string; // ULID
  kind: string; // "pomo", "todo.task", "habit", ...
  position: { x: number; y: number };
  state: TState; // serializable JSON — no functions, no DOM
  config: TConfig; // user-editable settings
  isMother: boolean;
  slot?: number;
}
```

持久化用 Zod 校验，`kind` 刻意放宽为 `z.string()`、`state/config` 为 `z.unknown()`，保证旧板的未知 kind 能原样 round-trip（[board.schema.ts:3-11](../../../references/KRNL0/src/shared/schemas/board.schema.ts#L3-L11)）——**"宽容读取 + 兜底渲染"是值得吸收的健壮性思想**（配合 UnknownNode 永不抛异常，[UnknownNode/index.tsx:5-27](../../../references/KRNL0/src/renderer/components/nodes/UnknownNode/index.tsx#L5-L27)："a stale board.json must still render"）。

**关键发现：业务数据内嵌是 KRNL0 的原罪级妥协**。`TaskState` 把 `text/done/tag/durationMin` 等全部领域字段内嵌在节点上（[TaskNode/types.ts:4-17](../../../references/KRNL0/src/renderer/components/nodes/TaskNode/types.ts#L4-L17)），并需要 `todoItemId ↔ taskNodeId` **双向 ID 回链**，每次 toggle 由 dispatcher 手工镜像同步（Decision 20，[commandDispatch.ts:1740-1822](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1740-L1822)）。KRNL0 自己证明了这条路的代价。Kagelin 必须走反方向：node 只存 `{entityId, entityType, displayConfig}`——项目里已存在的正面样板是 `HabitLaneState = { habitId }`（纯引用，渲染时从 mother state 查找，[HabitLaneNode/index.tsx:100](../../../references/KRNL0/src/renderer/components/nodes/HabitLaneNode/index.tsx#L100)）。

**Registry 的现实**。声明式 `NodeKindSpec`（含 defaultState/defaultConfig/render/commands/events/schema，[node.ts:44-52](../../../references/KRNL0/src/shared/types/node.ts#L44-L52)）**只是类型声明，运行时从未使用**（followup 文档 §3："The kernel was supposed to use these — it doesn't"）。实际注册点是三张手写表 + 一个集中 switch：

- 渲染表 ×2：`NODE_REGISTRY`（裸组件，Station 模式用）与 `NODE_TYPES`（`createNodeAdapter` 包装后给 React Flow），见 [registry.ts:25-66](../../../references/KRNL0/src/renderer/components/nodes/registry.ts#L25-L66)；
- 命令表：`applyCommand` 的 `switch (node.kind)` 巨型分支（[commandDispatch.ts:219-227](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L219-L227)）；
- 持久化表：`seedBoard`/`STATE_DEFAULTS`/`CONFIG_DEFAULTS`（[persistence/board.ts:36-125, 171, 234](../../../references/KRNL0/src/main/persistence/board.ts#L36-L125)）。

新增一种节点类型需要触碰 6-8 个文件（含 `NodeKind` 联合类型、`INITIAL_DIMS_BY_KIND` 初始尺寸表 [rfAdapters.tsx:50-64](../../../references/KRNL0/src/renderer/components/Canvas/rfAdapters.tsx#L50-L64)、dock 默认值 Record 等）——ADR 0001 §11（[0001-calendar-mother-node-and-task-scheduling.md:230-252](../../../references/KRNL0/docs/03-adr/0001-calendar-mother-node-and-task-scheduling.md#L230-L252)）是这套流程的权威模板。**Kagelin 应把"三表一 switch"合并为单一声明式规约**，这是 KRNL0 留下的最明确的改进空间。

**Mother/Child**。`isMother` 持久化在 node 上（[node.ts:10](../../../references/KRNL0/src/shared/types/node.ts#L10)）；mother 不可拖动（`draggable: !node.isMother`，[rfAdapters.tsx:108](../../../references/KRNL0/src/renderer/components/Canvas/rfAdapters.tsx#L108)）、不可连线（`showHandles = !node.isMother`，[rfAdapters.tsx:180](../../../references/KRNL0/src/renderer/components/Canvas/rfAdapters.tsx#L180)）。MotherFrame 是共享视觉外壳（540×540 面板 + 槽位徽章，[MotherFrame/index.tsx:64-66](../../../references/KRNL0/src/renderer/components/nodes/MotherFrame/index.tsx#L64-L66)）。最有价值的裁决依据来自 ADR 0001：**Calendar mother 不拥有任何领域数据**，state 只有 `selectedDate/anchorDate/zoom`（[CalendarNode/types.ts:10-17](../../../references/KRNL0/src/renderer/components/nodes/CalendarNode/types.ts#L10-L17)），读写模式是"读用 selector 直读、写走 onCommand"，且"**field is the source of truth; the edge is cosmetic**"（ADR 0001 §8）——这正是 Kagelin Workspace 投影层该有的形态。

**ID 策略**。类型注释写 ULID 但实际是 `crypto.randomUUID()` 加前缀（`task-<uuid>`，[commandDispatch.ts:1598-1599](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1598-L1599)）；mother 用固定语义 ID（`mother-pomo` 等）支撑迁移幂等。Kagelin 映射：workspace node 行用 Supabase 主键（uuid），但**不要**固定语义 ID（多用户环境每人一份布局）。

### 2.2 画布（React Flow）

**开箱即用部分**：pan/zoom/框选/多选/MiniMap/Controls/Background 全部是 React Flow v12 原生能力（[CanvasFlow.tsx:1494-1526, 1537-1573](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L1494-L1526)）。**自定义部分**：全部 node renderer（经 `createNodeAdapter` HOC 注入 Handle，node 主体不感知 RF，[rfAdapters.tsx:170-213](../../../references/KRNL0/src/renderer/components/Canvas/rfAdapters.tsx#L170-L213)）、edge 样式（几何仍用默认 `getBezierPath`+`BaseEdge`，仅自定义描边/渐变/动画，[CanvasFlow.tsx:199-202](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L199-L202)）、滚轮/触控板手势区分启发式（[CanvasFlow.tsx:489-520](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L489-L520)）、frame 拖拽碰撞解算（最多 6 轮 AABB 迭代，[CanvasFlow.tsx:1292-1352](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L1292-L1352)）。

**最值得吸收的画布工程决策——受控模式下的性能分层**：拖拽期间 React Flow 本地 state 是工作副本（`applyNodeChanges` 只改本地数组、绕过 Zustand），**仅在 drag end 一次性 `commitDragEnd` 写回 store**（[CanvasFlow.tsx:1149-1170, 1383-1433](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L1149-L1170)，注释非常详尽）；viewport 用 `onMoveEnd`（手势结束才写）+ 模块级 `viewportBus` 标量（每帧写、零 React 渲染，[CanvasFlow.tsx:1443-1459](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L1443-L1459)）。这套"高频交互不过全局 store"的分层对 Kagelin 直接适用（Zustand 同样怕 60fps 写入）。

**坐标系统**：node.position 是画布世界系绝对坐标，不相对 mother；"属于某 frame"是 `frame.state.childIds` 软分组（[persistence/board.ts:222](../../../references/KRNL0/src/main/persistence/board.ts#L222)），drag end 时按中心点包含检测重算归属。

**持久化（不吸收的部分）**：单文件 `board.json`（位置 [handlers.ts:28-30](../../../references/KRNL0/src/main/ipc/handlers.ts#L28-L30)），每次 mutation 立即整板 `JSON.stringify(data, null, 2)` + `writeFileSync`（[persistence/board.ts:653-661](../../../references/KRNL0/src/main/persistence/board.ts#L653-L661)）；唯一例外是 viewport 走 500ms debounce + 读-改-写合并（[useViewportPersistence.ts:4-23](../../../references/KRNL0/src/renderer/hooks/useViewportPersistence.ts#L4-L23)、[handlers.ts:81-87](../../../references/KRNL0/src/main/ipc/handlers.ts#L81-L87)）。加载时跑 13 步幂等迁移流水线，任一步失败回退种子板（[persistence/board.ts:590-651](../../../references/KRNL0/src/main/persistence/board.ts#L590-L651)）。**无多 board 支持**（单板 per install，仅靠 `KRNL0_BOARD_DIR` 环境变量隔离 worktree 实例）。

### 2.3 Edge 模型与自动化

**Edge 的语义**：边是"事件→命令"的 wiring 数据，不携带可执行行为：

```typescript
// src/shared/types/edge.ts:1-7
export interface Edge {
  id: string;
  from: { nodeId: string; event: string };
  to: { nodeId: string; command: string };
  args?: Record<string, unknown>;
  enabled: boolean;
}
```

**核心事实（决定裁决）：运行时 edge 分发从未实现**。规格说"When a node emits an event, the kernel dispatches matching edges"（[node-spec.md:72](../../../references/KRNL0/docs/05-node-system/node-spec.md#L72)），但 issue 规格亲口承认：

> "…but **no code reads the edge list at runtime and dispatches the target command when a node emits the source event**. Edges are visual-only." — [followup-edge-runtime-dispatch.md:9](../../../references/KRNL0/docs/06-requirements/followup-edge-runtime-dispatch.md#L9)

运行时唯一读 `edge.enabled` 的代码是线条样式选择（[CanvasFlow.tsx:124](../../../references/KRNL0/src/renderer/components/Canvas/CanvasFlow.tsx#L124)）。`link` 边是规格明确豁免的纯视觉类型（[node-spec.md:145](../../../references/KRNL0/docs/05-node-system/node-spec.md#L145)）。

**真实运转的"自动化"是另一套**——cascade 调度完全绕开 edge 触发，采用 **persist intent, derive at read**：

- 只持久化锚点任务的 `scheduledFor`，后继时间由纯 selector `selectSchedule` 沿 `task.next` DAG 读时派生（ADR 0003，[0003-cascade-scheduling.md:24](../../../references/KRNL0/docs/03-adr/0003-cascade-scheduling.md#L24)）；ADR 0005 升级为多锚点 fixpoint 模型（[0005-multi-anchor-cascade.md:16-18](../../../references/KRNL0/docs/03-adr/0005-multi-anchor-cascade.md#L16-L18)）。
- edge 表仅被 `buildChainIndex` 在读取时消费**图结构**（只认 `task.next` 事件，[chainWalker.ts:49-70](../../../references/KRNL0/src/renderer/store/chainWalker.ts#L49-L70)）。
- edge 上的 `task.activate` 命令是**显式 no-op**（[TaskNode/commands.ts:39-42](../../../references/KRNL0/src/renderer/components/nodes/TaskNode/commands.ts#L39-L42)："currently just returns state unchanged"）。

**Event→Edge→Command 的真实流转**（以点击 task checkbox 为例，全程无 edge 环节）：

1. UI：`onCommand('task.toggle')`（[TaskNode/index.tsx:536-547](../../../references/KRNL0/src/renderer/components/nodes/TaskNode/index.tsx#L536-L547)）→ `makeCommandHandler` 缓存的 handler（[commandDispatch.ts:788-801](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L788-L801)）；
2. dispatch：`_dispatch` → `applyCommand` 按 `node.kind × command` 路由到纯 FSM `taskToggle = (s) => ({...s, done: !s.done})`（[commandDispatch.ts:275-277](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L275-L277)、[TaskNode/commands.ts:18-21](../../../references/KRNL0/src/renderer/components/nodes/TaskNode/commands.ts#L18-L21)）；
3. 跨节点级联：`_dispatch` 的 task.toggle 专属分支硬编码——写回 Zustand、记事件日志、同步完成台账（`syncCompletionLedger`，[commandDispatch.ts:439-454](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L439-L454)）、**镜像 TodoItem**（Decision 20 双写）、取消关联 pomo 会话（[commandDispatch.ts:1740-1822](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1740-L1822)）；
4. 持久化：`saveBoard` → IPC `board:save` → `writeFileSync` 整板落盘（[commandDispatch.ts:1820-1822](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1820-L1822)）。

**eventLog 不是事件总线**：它是 renderer 内存环形缓冲审计日志（容量 200，不持久化、无回放，[eventLog/types.ts:8-30](../../../references/KRNL0/src/renderer/store/eventLog/types.ts#L8-L30)、[store.ts:35-57](../../../references/KRNL0/src/renderer/store/eventLog/store.ts#L35-L57)），`EventKind` 与 Edge 的 `from.event` 名字撞车但互不相干。Kagelin 若做审计流可参考其"emit 永不抛错 + Proxy 包装持久化桥自动记录"的 instrumentation 模式（[boardSaveLogging.ts:39-84](../../../references/KRNL0/src/renderer/store/eventLog/boardSaveLogging.ts#L39-L84)）。

### 2.4 Mutation path

**SysFacade**（[SysFacade.ts:83](../../../references/KRNL0/src/sys/SysFacade.ts#L83)）：`sys`/`krnl` CLI 的命令门面，`run(argv)` → `SysParser.parse` → 巨型 switch 分发到 `src/sys/commands/*`。它存在的原因是"外部进程要写 board.json"——design-patterns.md 6.3 定位为"GUI 按钮、语音流、Claude 子进程、用户终端**四个调用者，一个门面**"（[design-patterns.md:71](../../../references/KRNL0/docs/03-architecture/design-patterns.md#L71)）。

**"One Mutation Path"的真实强度：约定 + 收敛未完成的共享纯函数，无类型/运行时强制**。

- 约定层：AGENTS.md 硬规则"never write board.json directly from app code"；node-spec 六规则之三"Every state change goes through a named command"（[node-spec.md:53](../../../references/KRNL0/docs/05-node-system/node-spec.md#L53)）——都只是文档契约。
- 实际是**两条写入路径 + 一个共享持久化单点**：UI 路径（commandDispatch → Zustand → IPC save）与 CLI 路径（SysFacade → 直接 fs 读写 → `board:changed` 广播整板重载）。持久化单点是 `boardIo.ts`："there is exactly one persistence path"（[boardIo.ts:4-7](../../../references/KRNL0/src/main/boardIo.ts#L4-L7)）。
- 并发防护：RPC server 用 Promise 链单飞互斥串行化所有 CLI 请求，防 read-modify-write 交错撕裂 board.json（[rpc/server.ts:50-52, 90](../../../references/KRNL0/src/main/rpc/server.ts#L50-L52)）。
- **实证的绕过点**：CLI 的 `taskToggle` 手写 TodoItem 镜像而非调用 shared 的 `taskToggleMirror`（[sys/commands/task.ts:288-299](../../../references/KRNL0/src/sys/commands/task.ts#L288-L299) vs [shared/dispatch/task.ts:207-238](../../../references/KRNL0/src/shared/dispatch/task.ts#L207-L238)），同一逻辑两份代码；ADR 0003 自己承认"CLI 直接写 scheduledFor 可绕过 dispatcher 破坏锚点不变量"（[0003:194](../../../references/KRNL0/docs/03-adr/0003-cascade-scheduling.md#L194)）；ADR-0014 §2 承认"CLI mutates board through SysFacade today silently desyncs the running app"（[adr-0014:39](../../../references/KRNL0/docs/03-architecture/adr-0014-terminal-cli-bridge.md)）。
- Zod `BoardSchema` 只在**加载时**整板校验，无 per-mutation 运行时校验（[board.schema.ts:30-51](../../../references/KRNL0/src/shared/schemas/board.schema.ts#L30-L51)）。

**Selectors**：`chainWalker`（共享纯 helper，吃 `task.next` 边产出链/并行组结构）+ `scheduleSelector`（多锚点 cascade，模块级引用相等 memo）+ `timelineSelector`（统一时间线）。契约地位由 ADR 0003 锁定："Direct reads of `TaskState.scheduledFor` for the purpose of placing tasks on a calendar are **forbidden**"（[0003:24](../../../references/KRNL0/docs/03-adr/0003-cascade-scheduling.md#L24)）——**selector 是排他性数据源**，这条纪律值得 Kagelin 直接采纳（"日历/看板视图读派生 selector，不读原始字段"）。

### 2.5 Agent-native / CLI / Claude Code

**CLI 架构**：单一命令注册表 `CLI_REGISTRY` 是帮助文本唯一事实源（"No hand-maintained HELP_TEXT constant survives"，[commandRegistry.ts:1-16](../../../references/KRNL0/src/shared/cli/commandRegistry.ts#L1-L16)，覆盖 22 个命令组）。传输层是 named pipe/Unix socket 上的行分隔 JSON RPC + per-launch 256-bit token（不落盘，mismatch → exit 126 断连，[rpc/server.ts:57, 79-84](../../../references/KRNL0/src/main/rpc/server.ts#L57)）。ADR-0014 明确拒绝 HTTP/WS（防火墙弹窗）与 stdin/stdout marshalling（与用户 shell 流量混流）（[adr-0014:63-77](../../../references/KRNL0/docs/03-architecture/adr-0014-terminal-cli-bridge.md)）——这两个"拒绝理由"恰好说明了它是单机环境补偿。

**Claude Code 集成**：**不是 MCP、不是 stdin/stdout 协议**——是 Claude Code 的 Bash 工具跑 `krnl` CLI 子进程。决策记录明确拒绝 MCP（"auto-discovery configuration is fragile; v1 scope doesn't justify it"，[decisions.md:58-82](../../../references/KRNL0/docs/03-architecture/decisions.md#L58-L82)）。授权 = PTY 环境继承（claude 作为 shell 后代拿到 token）。文档模式是精华：

- [CLAUDE.md](../../../references/KRNL0/claude/CLAUDE.md)：503 行世界模型——身份边界（"NOT a developer assistant"）、哲学不变量（"Everything the UI can do, the CLI can do"）、board 路径与禁令（"Never write to it directly — always use krnl"）、ID 解析纪律（"Never invent IDs. List first, then act"）、8 个多步 pipeline 示例；
- [skills/wire-edge.md:10-27](../../../references/KRNL0/claude/skills/wire-edge.md#L10-L27)：开头即"诚实声明"——"Edges in KRNL0 today are pure data, not reactive wires... Do not promise the wire will fire automatically"。

**automation 的真身**：没有叫 automation 的模块。实际三层 = edge 数据（未触发）+ 派生 selector（真正工作的"自动"）+ Assistant 脚本回放引擎（`Flow = {steps: (boardSnapshot) => FlowStep[]}`，步骤含 speak/cameraToNode/runCommand/waitForBoard/verify，[Assistant/types.ts:5-53](../../../references/KRNL0/src/renderer/components/Assistant/types.ts#L5-L53)、[ScriptRunner.ts:113-121](../../../references/KRNL0/src/renderer/components/Assistant/ScriptRunner.ts#L113-L121)）。`src/brain/`（BrainProvider/ClaudeCodeProvider）与 `src/voice/`（Whisper/Piper）是**已定义未接线**的骨架——IPC handler 全是 TODO 空壳（[handlers.ts:155-173](../../../references/KRNL0/src/main/ipc/handlers.ts#L155-L173)），README 宣传的三层闭环实际只完成 Action 层。

### 2.6 架构决策：普适 vs 环境补偿

| 决策                                                                                  | 出处                                                                                                                                                               | 判断                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| D5 SSOT + "persist intent, derive presentation"                                       | [decisions.md:100-114](../../../references/KRNL0/docs/03-architecture/decisions.md#L100-L114)                                                                      | **普适**——pomo 只存 `startedAt+durationMin`、cascade 只存锚点，全是读取时派生           |
| D3/D4 "UI 能做的 CLI 都能做"、无后门、共用命令面                                      | [decisions.md:57-96](../../../references/KRNL0/docs/03-architecture/decisions.md#L57-L96)                                                                          | **普适**（agent-native 核心思想）                                                       |
| Edge = 数据（event→command 存 board）                                                 | [node-spec.md:60-72](../../../references/KRNL0/docs/05-node-system/node-spec.md#L60-L72)                                                                           | **普适**（graph 领域标准形态）                                                          |
| 节点六铁律（state 可序列化/render 纯函数/命令变异/事件类型化/禁跨节点 import/无特权） | [README.md:242](../../../references/KRNL0/README.md#L242)、[node-spec.md:50-56](../../../references/KRNL0/docs/05-node-system/node-spec.md#L50-L56)                | **普适**——对 Kagelin workspace node 同样适用（把"禁跨节点 import"引申为"禁跨实体直读"） |
| 注册表生成帮助、读命令 `--json`、ID 前缀解析                                          | [commandRegistry.ts:1-2](../../../references/KRNL0/src/shared/cli/commandRegistry.ts#L1-L2)、[CLAUDE.md:44-46](../../../references/KRNL0/claude/CLAUDE.md#L44-L46) | **普适**（AI 可发现性设计）                                                             |
| 诚实文档（明示边不触发、log 不跨重启）                                                | [wire-edge.md:10-27](../../../references/KRNL0/claude/skills/wire-edge.md#L10-L27)                                                                                 | **普适**                                                                                |
| named-pipe/UDS RPC + per-launch token                                                 | [adr-0014:63-111](../../../references/KRNL0/docs/03-architecture/adr-0014-terminal-cli-bridge.md)                                                                  | **环境补偿**（PTY 子进程进 Electron 的桥）                                              |
| Promise 单飞互斥串行化                                                                | [rpc/server.ts:50-52](../../../references/KRNL0/src/main/rpc/server.ts#L50-L52)                                                                                    | **环境补偿**（多进程并发写单文件的锁）                                                  |
| `cli:dispatch` main→renderer 回环 IPC                                                 | [handlers.ts:120-144](../../../references/KRNL0/src/main/ipc/handlers.ts#L120-L144)                                                                                | **环境补偿**（Electron invoke 只有 renderer→main 方向）                                 |
| renderer-attached vs headless 双路径                                                  | [decisions.md:2169-2177](../../../references/KRNL0/docs/03-architecture/decisions.md#L2169-L2177)                                                                  | **环境补偿**（undo/viewport 是渲染器内存态）                                            |
| per-launch cli-bin PATH 分发 + asar unpack + shim                                     | [index.ts:221-247](../../../references/KRNL0/src/main/index.ts#L221-L247)                                                                                          | **环境补偿**（打包分发细节）                                                            |
| D17 per-worktree board 隔离                                                           | [decisions.md:675-759](../../../references/KRNL0/docs/03-architecture/decisions.md#L675-L759)                                                                      | **环境补偿**（单机文件冲突事故）                                                        |
| viewport 500ms debounce + board byte-identical 往返                                   | [decisions.md:154-167](../../../references/KRNL0/docs/03-architecture/decisions.md#L154-L167)                                                                      | debounce 思想普适；byte-identical 契约是文件 diff 场景特有                              |

---

## 3. 风险清单：最容易照搬出问题的部分

按"被照搬概率 × 事故严重度"排序：

1. **把 board.json 整板快照搬进浏览器/Supabase（最高危）**。KRNL0 每次 mutation 全量 `JSON.stringify` 整板 + 立即写盘（[persistence/board.ts:653-661](../../../references/KRNL0/src/main/persistence/board.ts#L653-L661)、27 处 `saveBoard` 调用点）。搬到云环境 = 每次勾选一个任务都全量重写整块 workspace 数据：写放大、多用户并发互相覆盖、TanStack Query 粒度失效彻底报废（一个 queryKey 失效等于全部失效）、无行级 RLS 可能。**正确映射**：workspace_nodes/edges 行级表 + 位置变更 debounced PATCH。
2. **把 node.state 内嵌业务数据的形态搬过来**。这直接违反 Kagelin 的 SSOT 约束，且 KRNL0 已经替我们付过学费——task↔todo 的 Decision 20 双向回链 + dispatcher 手工镜像（[commandDispatch.ts:1757-1769](../../../references/KRNL0/src/renderer/components/Canvas/commandDispatch.ts#L1757-L1769)）就是内嵌数据的直接代价。一旦 Workspace 复制业务字段，"改任务标题要同步改 node"的镜像代码会在 Kagelin 全套重演，且叠加云端多端同步后不可收敛。
3. **把 edge 当"已实现的自动化"来设计产品**。KRNL0 的边数据模型（类型/Zod/CLI CRUD/启用开关）看起来完备，但运行时分发一行未写（[followup-edge-runtime-dispatch.md:9](../../../references/KRNL0/docs/06-requirements/followup-edge-runtime-dispatch.md#L9)），文档与现实脱节近一年，最后靠 skills 文档的诚实声明兜底（"Do not promise the wire will fire automatically"）。Kagelin 若吸收 edge 数据模型，**必须**同步实现 dispatch 循环（含防环与深度上限，规格见 followup 文档 §5）或在 UI/文档中明确降级为视觉连线——没有第三条路。
4. **把 CLI 的本地信任模型搬进多用户云环境**。"token 只注入 PTY 子进程环境、只有 shell 后代能拿到"（[adr-0014:111](../../../references/KRNL0/docs/03-architecture/adr-0014-terminal-cli-bridge.md)）的前提是单机单用户。云环境的 agent 授权必须是真正的认证鉴权（会话/API key + RLS + per-user 数据隔离），不存在"进程血缘即授权"这回事。
5. **复制双 mutation path 的结构**。KRNL0 的 UI 路径与 CLI 路径各自维护语义副本（`sys/commands/task.ts:288-299` vs `shared/dispatch/task.ts:207-238` 同一镜像逻辑两份代码），ADR-0014 规划的收敛"至今未完成"是项目自己承认的技术债。Kagelin 的 agent/自动化功能必须复用 `src/lib/mutations/*` 同一层，**从第一天就不存在第二套写路径**——这比 KRNL0 事后收敛便宜一个数量级。
6. **把"每次交互立即持久化"的节奏搬进云环境**。KRNL0 靠无 debounce 的即时整板写 + 单飞互斥保证一致性（[rpc/server.ts:50-52](../../../references/KRNL0/src/main/rpc/server.ts#L50-L52)）；云环境的对应物是数据库事务与行锁，**不是**应用层 Promise 链。拖拽类高频操作必须走本地副本 + drag end 提交 + debounce PATCH 三层（KRNL0 画布内的分层是对的，持久化层的节奏是错的）。
7. **把固定语义 ID（mother-pomo 等）与固定 6 锚点布局搬进多用户产品**。KRNL0 用固定 ID 支撑单板迁移幂等（[persistence/board.ts:46-115](../../../references/KRNL0/src/main/persistence/board.ts#L46-L115)）；多用户环境每人有独立 workspace，锚点数量与布局应用户可配，固定 ID 反而制造跨用户冲突。
8. **把 undo/redo 内存栈模型当完整能力搬运**。KRNL0 的 undo 是 Zustand 内存栈（`history/future`，容量 50，刷新即失，[boardStore.ts:125](../../../references/KRNL0/src/renderer/store/boardStore.ts#L125)）。多端场景下"另一端已经改了"会让纯客户端 undo 产生意外回滚——Kagelin 需要 workspace 级别的操作日志或至少限定 undo 只回滚本地未同步操作。
9. **把"帮助/文档手写"的习惯带进 agent 时代**。KRNL0 的教训是正面的：注册表生成帮助（[commandRegistry.ts:250-284](../../../references/KRNL0/src/shared/cli/commandRegistry.ts#L250-L284)）保证命令面与文档永不漂移。Kagelin 给 agent 暴露命令面时，tool 描述/参数 schema 应从同一 registry 生成，避免第二份漂移源。
10. **误把 brain/voice 骨架当作可参考的成熟实现**。`src/brain/`、`src/voice/` 是"已定义未接线"的接口骨架（IPC handler 全 TODO，[handlers.ts:155-173](../../../references/KRNL0/src/main/ipc/handlers.ts#L155-L173)），README 宣传的三层闭环只完成了 Action 层。可以吸收其 Provider 接口形状（[BrainProvider.ts:3-18](../../../references/KRNL0/src/brain/BrainProvider.ts#L3-L18)），不要对其完成度抱有期待。

---

## 4. 建议落地顺序（供后续 grilling / 规格阶段输入）

1. **先做投影层地基**（裁决表 #1/#2/#7 的交集）：引用型 node 信封 + 单一 NodeKindSpec 注册 + TanStack Query 派生 selector——零自动化风险，全部是数据读取路径。
2. **再做画布交互**（#5）：纯函数 workspace 命令 + 拖拽本地副本/drag end 提交分层 + debounced 位置 PATCH。
3. **最后做自动化**（#4/#11）：edge 意图存储 → dispatch 循环（含防环）→ agent 命令面（registry 生成）。每一步都可以独立叫停，不会留半成品语义。

---

_本报告为只读研究产物；未修改 references/KRNL0 下任何文件。_
