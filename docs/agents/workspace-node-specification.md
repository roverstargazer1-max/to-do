# Kagelin 工作台节点与拓扑规范标准 (Workspace Node Specification)

> **版本**：v1.0.0  
> **适用对象**：用户与 AI 编码/规划助手（Antigravity、Claude Code、Cursor）、Kagelin MCP Server (`kagelin-workspace-builder`)、以及未来内置 Copilot  
> **核心目标**：建立严格、无歧义的人机统一术语体系与数据契约，实现对工作台画布（Canvas）布局与工作流拓扑的精细化控制。

---

## 目录

1. [规范总则与核心设计原则](#1-规范总则与核心设计原则)
2. [节点类型规范详解](#2-节点类型规范详解)
   - 2.1 [文档节点 (Document Node / Doc)](#21-文档节点-document-node--doc)
   - 2.2 [任务节点 (Task Node)](#22-任务节点-task-node)
   - 2.3 [习惯节点 (Habit Node)](#23-习惯节点-habit-node)
   - 2.4 [事件节点 (Event Node)](#24-事件节点-event-node)
   - 2.5 [专注节点 (Focus Node)](#25-专注节点-focus-node)
   - 2.6 [项目节点 (Project Node)](#26-项目节点-project-node)
   - 2.7 [分组容器 (Group Node / Section)](#27-分组容器-group-node--section)
3. [连线与流向规范 (Flow / Edge)](#3-连线与流向规范-flow--edge)
4. [MCP 蓝图与精细化操作契约 (MCP Protocol)](#4-mcp-蓝图与精细化操作契约-mcp-protocol)
5. [人机交互沟通与精准微调指南 (Prompting & Fine-tuning)](#5-人机交互沟通与精准微调指南-prompting--fine-tuning)

---

## 1. 规范总则与核心设计原则

Kagelin 的工作台（Workspace）是一张高对比度、墨黑美学（Ink & Matte）的无限画布。为了确保 AI 生成与微调的精准度，必须遵循以下不可违背的底层设计准则：

### 1.1 软引用 vs 独立数据 (Reference vs Self-contained)

- **引用节点 (Reference Nodes - 任务/习惯/事件/项目)**：画布上的卡片是底层领域实体的**实时引用（Live Reference）**，绝不是数据的副本。在画布上移除卡片（`node.remove`）**绝对不会**删除真实的任务或习惯；修改底层任务状态会自动实时同步到画布。
- **独立节点 (Self-contained Nodes - 文档/分组)**：文档和分组不绑定外部业务表，其数据仅存在于工作台布局层（`display_config`）。移除节点即删除该卡片内容。
- **单例投影节点 (Singleton Projection - 专注)**：专注节点是全站唯一番茄钟计时器（`timerStore`）在画布上的视觉透镜，不产生独立倒计时。

### 1.2 零后门原则 (Zero-Backdoor Principle)

AI 和 MCP Server 对画布的任何修改，必须 100% 走 Kagelin 领域命令层（`nodeCommands`、`edgeCommands`、`taskCommands`）。禁止直接绕过领域层写入数据库，确保并发、撤销及状态一致性。

### 1.3 严格连线流向 (Strict Directionality: Left-to-Right)

每个节点遵循严格的横向信息流模式：

- **输入端（Target Port）**：统一位于节点**左边缘**（`Position.Left`，id: `"in"`）。
- **输出端（Source Port）**：统一位于节点**右边缘**（`Position.Right`，id: `"out"`）。
- 连线始终从前序节点的右端连入后续节点的左端。

### 1.4 容错降级与孤立保护 (Orphan & Unknown Tolerance)

- **孤立状态 (`isOrphaned`)**：若引用节点所指向的底层实体在外部被删除，卡片自动降级展示孤立警示（`NodeOrphanBody`），保留位置，仅提供移除操作，杜绝白屏或报错崩塌。
- **未知节点 (`unknown`)**：低版本客户端打开包含未来新类型节点的画布时，渲染兜底占位卡片，支持安全移除。

---

## 2. 节点类型规范详解

![添加节点菜单](/C:/Users/diamo/.gemini/antigravity/brain/394ef5c1-9b2f-4283-aa58-756af03436fc/.user_uploaded/media_1789282608144.png)

---

### 2.1 文档节点 (Document Node / Doc)

- **注册标识符 (`kind`)**：`"doc"`
- **中文标准名称**：文档节点 / 文本卡片
- **英文标准名称**：Document Node / Doc Node
- **UI 菜单入口**：`+ 添加` -> `文档` (`workspace.canvas.addDoc`)

#### 核心定位与用途

作为工作台的“说明书”、“上下文载体”与“Prompt 便签”。用于承载工作流的背景说明、阶段目标、操作准则（SOP）、参考资料、阶段复盘，或者作为供用户一键复制发给 AI 的**提示词卡片**。

#### 数据结构与存储

- **引用模型**：纯布局节点，`entity_type: null`，`entity_id: null`。
- **数据存储位置**：`workspace_nodes.display_config`

```typescript
interface DocDisplayConfig {
  title?: string; // 文档标题（显示于卡片顶部）
  content?: string; // Markdown 文本正文
}
```

#### 尺寸与布局规范

- **默认宽度**：`280px`（固定宽度）
- **高度规则**：动态自适应，最小高度 `160px`，默认空内容高度 `180px`。
- **文本高度估算算法**：
  $$\text{Height} = \max(160, 60 + \text{visualLines} \times 20)$$
  （其中头部固定约 `60px`，每行折行约 32 字符，行高 `20px`）
- **缩放支持**：支持 8 个控制点自由拉伸缩放 (`CardResizer`)。

#### 交互与功能特性

1. **双模渲染**：支持 Markdown 渲染预览模式与纯文本编辑模式的平滑切换（编辑图标 / 确认图标）。
2. **富文本语法**：完全支持 GFM（加粗、斜体、列表、复选框列表、代码块、引用等）。
3. **一键复制**：卡片头部自带复制按钮（Copy），点击后一键将正文 Markdown 内容复制到剪贴板，带反馈动效与 Toast 提示（极大方便复制提示词）。
4. **标题行内修改**：双击卡片顶部标题即可进入输入框编辑，失焦或回车自动持久化保存。

#### 典型应用场景

- **工作流头部**：`[目标与背景 Doc]` -> 连线到各个执行阶段。
- **AI 提示词输入卡**：放置提示词模板，供用户复制后发送给大模型处理。
- **交付物归档**：记录某阶段输出的关键结论或评审记录。

---

### 2.2 任务节点 (Task Node)

- **注册标识符 (`kind`)**：`"task"`
- **中文标准名称**：任务节点
- **英文标准名称**：Task Node
- **UI 菜单入口**：`+ 添加` -> `任务` (`workspace.canvas.addTask`)，或顶部快捷输入框

#### 核心定位与用途

工作流中最基础的**具体可执行行动项（Actionable Item）**。代表真实待办事项，直接映射到系统的任务中心。

#### 数据结构与存储

- **引用模型**：软引用，`entity_type: "task"`，`entity_id: "<task_id>"`。
- **数据联动**：实时从任务 Query 缓存（`useTasks({ showCompleted: true })`）读取，完成的任务仍然保留在画布上。

#### 尺寸与布局规范

- **默认宽度**：`260px`
- **默认高度**：`96px`（自适应，单行标题与标签）
- **缩放支持**：支持自由拉伸宽度与高度。

#### 交互与功能特性

1. **画布即时打勾**：卡片上包含实时交互的复选框，直接点击调用 `taskCommands.toggle` 完成/恢复任务，无需离开工作台。
2. **优先级与元数据徽标**：
   - 优先级图标：P1（紧急/红）、P2（高/橙）、P3（中/蓝）、P4（低/灰）。
   - 截止日期（Due Date）：高亮显示“今天”、“明天”或逾期提醒。
   - 子任务进度条（Step Progress）：若有子任务，显示如 `2/5` 及迷你进度条。
3. **孤立容错**：若关联任务在任务列表中被永久删除，显示为“任务已删除”，仅允许用户点击右上角 `×` 移除卡片。

#### 典型应用场景

- **流水线任务步骤**：`[任务 1: 需求编写]` -> `[任务 2: 代码实现]` -> `[任务 3: 部署验证]`。
- **冲刺待办清单**：在某阶段分组中整齐排布 3~6 个关键任务。

---

### 2.3 习惯节点 (Habit Node)

- **注册标识符 (`kind`)**：`"habit"`
- **中文标准名称**：习惯节点
- **英文标准名称**：Habit Node
- **UI 菜单入口**：`+ 添加` -> `习惯` (`workspace.canvas.addHabit`)

#### 核心定位与用途

用于工作流中的**周期性日常纪律、节奏仪式（Cadence）或长效支撑机制**。让用户在关注大目标的同时，确保底层的日常执行力不中断。

#### 数据结构与存储

- **引用模型**：软引用，`entity_type: "habit"`，`entity_id: "<habit_id>"`。
- **数据联动**：通过 `useHabits` 读取习惯基础属性，通过 `useMarkHabitComplete` 进行当日幂等打卡。

#### 尺寸与布局规范

- **默认宽度**：`240px`
- **默认高度**：`88px`
- **缩放支持**：支持调整大小。

#### 交互与功能特性

1. **画布即时打卡**：卡片右侧提供圆环打卡按钮，直接点击即可完成今日打卡，再次点击取消。
2. **连续打卡天数（Streak）**：醒目展示当前连续坚持天数（如 `连续 12 天`），激发成就感。
3. **主题色与图标**：显示用户在习惯系统中设置的专属图标与色彩。

#### 典型应用场景

- **支撑日常泳道**：在工作台最右侧或底部放置一个独立的“日常支撑”区域，如放置“每日复盘”、“每天研读1篇论文”、“早间站会”。

---

### 2.4 事件节点 (Event Node)

- **注册标识符 (`kind`)**：`"event"`
- **中文标准名称**：事件节点 / 日程节点
- **英文标准名称**：Event Node / Calendar Event Node
- **UI 菜单入口**：`+ 添加` -> `事件` (`workspace.canvas.addEvent`)

#### 核心定位与用途

作为画布上的**绝对时间锚点（Schedule Anchor）**与硬性截止时间点。用于标定外部不可逾越的会议、考试、上线发布日或交付评审日。

#### 数据结构与存储

- **引用模型**：软引用，`entity_type: "event"`，`entity_id: "<event_id>"`。
- **数据联动**：通过 `useDedicatedCalendarEventsQuery` 读取日历事件。
- **写入策略**：Phase-1 保持**只读展示（Display-Only）**，不提供画布修改日程时间的行为，防止破坏日历外部同步逻辑。

#### 尺寸与布局规范

- **默认宽度**：`240px`
- **默认高度**：`88px`
- **缩放支持**：支持调整大小。

#### 交互与功能特性

1. **日程展示**：显示事件标题、格式化日期（如 `周四 9月18日`）、具体时间段或“全天”徽标。
2. **视觉锚定**：卡片附带日历（Calendar）徽章标识，作为拓扑连线的汇聚终点。

#### 典型应用场景

- **截止日汇聚**：`[任务A]` 与 `[任务B]` 的右侧连线最终汇入 `[事件: 9月25日 毕业论文提交]`。

---

### 2.5 专注节点 (Focus Node)

- **注册标识符 (`kind`)**：`"focus"`
- **中文标准名称**：专注节点 / 番茄钟节点
- **英文标准名称**：Focus Node / Timer Node
- **UI 菜单入口**：`+ 添加` -> `专注` (`workspace.canvas.addFocus`)

#### 核心定位与用途

工作流中的**即时执行工位（Execution Station）**。将时间管理工具直接搬上画布，方便用户在理清工作流后立即就地开展深度沉浸式工作。

#### 数据结构与存储

- **引用模型**：全局单例投影（Singleton Projection），`entity_type: null`，`entity_id: null`。
- **数据联动**：直接挂钩全站顶层的 `TimerProvider` 与 `timerStore`，反映全局唯一的番茄钟倒计时状态。画布上添加多个专注节点仅为同一单例的不同视角。

#### 尺寸与布局规范

- **默认宽度**：`220px`
- **默认高度**：`100px`
- **缩放支持**：支持调整大小。

#### 交互与功能特性

1. **就地启停**：卡片上自带播放（Play）、暂停（Pause）、停止（Stop）三键微型控制器。
2. **模式与轮次状态**：实时显示剩余时间（`mm:ss`）、轮次（`第 2 轮`）以及当前模式（专注 / 短休息 / 长休息）。

#### 典型应用场景

- **当前攻坚任务旁置**：放置在当前进行中的任务卡片旁边，并用虚线或实线连接，提示用户“当前应专注此项”。

---

### 2.6 项目节点 (Project Node)

- **注册标识符 (`kind`)**：`"project"`
- **中文标准名称**：项目节点
- **英文标准名称**：Project Node
- **UI 菜单入口**：快捷添加菜单 -> `选择已有项目` (`workspace.canvas.pickExistingProject`)

#### 核心定位与用途

工作流中的**宏观业务容器或模块总览大盘（Sub-system / Epic / Initiative）**。汇总展示某一项目下的整体进度与待办任务流。

#### 数据结构与存储

- **引用模型**：软引用，`entity_type: "project"`，`entity_id: "<project_id>"`。
- **数据联动**：通过 `useProjects()` 获取项目元数据，通过 `useTasks()` 聚合过滤该项目所属的所有根任务。

#### 尺寸与布局规范

- **默认宽度**：`280px`
- **默认高度**：`120px`（根据内嵌待办项动态增长）
- **缩放支持**：支持自由拉伸。

#### 交互与功能特性

1. **项目进度大盘**：显示项目主题色圆点、项目标题，以及可视化进度条（如 `4/10 任务完成 (40%)`）。
2. **内嵌活跃待办（Active Tasks List）**：卡片内直接展示最近按截止日期与优先级排序的最多 4 条未完成待办，并支持**在卡片内直接勾选打勾完成**！
3. **外部跳转**：提供“打开项目视图”链接图标，一键打开对应项目的详情页面或抽屉。

#### 典型应用场景

- **多项目协同蓝图**：`[核心项目 A: 客户端升级]` -> 连线 -> `[关联项目 B: 后端接口改造]`。

---

### 2.7 分组容器 (Group Node / Section)

- **注册标识符 (`kind`)**：`"group"`
- **中文标准名称**：分组容器 / 阶段泳道
- **英文标准名称**：Group Node / Section Container Frame
- **UI 菜单入口**：框选多个节点后点击顶部工具栏 `打组` (`workspace.toolbar.group`)，或在 MCP Blueprint 中设置 `isGroup: true`

#### 核心定位与用途

工作台的**视觉边界组织单元与模块包裹框架**。用于划分开发阶段、冲刺周期、主题分类或业务泳道。

#### 数据结构与存储

- **引用模型**：纯容器节点，`entity_type: null`，`entity_id: null`。
- **子节点关联机制**：成员节点的 `group_id` 指向该 group 节点的 `id`。
- **坐标存储规则（Parent-Relative Coordinates）**：
  - 组内成员在数据库中的 `position_x, position_y` 是**相对于该分组左上角的相对偏移量**！
  - 拖拽移动分组容器时，只更新容器自身坐标（1 次 DB 写入），成员自动平移，绝无级联性能损耗。
- **生命周期策略**：当组内所有子节点被删除或移出，且成员数归零时，分组容器**自动消亡解散**，杜绝留存空容器垃圾。

#### 尺寸与布局规范

- **默认最小尺寸**：`GROUP_MIN_WIDTH: 240px`，`GROUP_MIN_HEIGHT: 160px`
- **内边距与头部净空**：
  - 内边距 `GROUP_PADDING`: `24px`
  - 头部标题净空 `GROUP_HEADER_CLEARANCE`: `48px`
- **卡片垂直间距**：组内卡片垂直间距标准为 `20px` (`CARD_GAP`)。
- **自适应包裹算法**：
  $$\text{GroupWidth} = \max(240, \text{ContentWidth} + 48)$$
  $$\text{GroupHeight} = \max(160, \text{ContentHeight} + 72)$$

#### 交互与功能特性

1. **双击改名**：双击头部标题即可行内重命名。
2. **一键解散**：点击头部解散按钮（Ungroup），原子化恢复所有子节点的绝对画布坐标，并删除容器行。
3. **8 向边框缩放**：支持自由拉伸四边与四角，拉伸时自动反向补偿子节点相对坐标，确保子节点在屏幕绝对视觉位置保持不动。
4. **子节点拖出穿透**：拖动子节点超出容器边缘释放时，自动解除组关系转换为画布根节点。

---

## 3. 连线与流向规范 (Flow / Edge)

- **注册标识符**：`WorkspaceEdge` / `Flow`
- **中文标准名称**：关系流连线 / 依赖连接线
- **英文标准名称**：Workflow Edge / Connection Flow
- **存储表**：`workspace_edges` (`source_node_id`, `target_node_id`)

### 3.1 连线几何与交互规范

1. **贝塞尔平滑曲线 (Bezier Path)**：连接源卡片右侧端口（Out）到目标卡片左侧端口（In）。
2. **飞书风格中点断开控件 (Midpoint Disconnect)**：悬停或选中连线时，中点浮现微型快捷断开按钮（`×`），点击一键切断关系；亦支持选中后按 `Delete` 键删除。
3. **24px 宽幅隐形命中区**：确保用户在画布上点击或悬停连线时极易命中。

### 3.2 推荐拓扑语义

- **顺序推进流 (Sequential Dependency)**：
  `Task A (out)` $\longrightarrow$ `Task B (in)`：表示 A 为 B 的前置任务。
- **背景指导流 (Contextual Flow)**：
  `Doc (out)` $\longrightarrow$ `Task / Project (in)`：表示该文档为后续任务提供执行标准或输入规格。
- **汇聚里程碑 (Milestone Convergence)**：
  `Task A (out)` $\searrow$  
  `Task B (out)` $\longrightarrow$ `Event / Project (in)`：多个任务共同汇聚于某一关键事件或里程碑。

---

## 4. MCP 蓝图与精细化操作契约 (MCP Protocol)

在通过 `kagelin-workspace-builder` MCP 与 AI 交互时，所有数据交互严格映射为以下 TypeScript DSL 结构：

### 4.1 全量构建数据结构 (`build_workspace`)

```typescript
interface WorkspaceBlueprint {
  name: string; // 工作台名称
  color?: string; // 主题色，如 "blue", "indigo", "emerald"
  sections: BlueprintSection[]; // 阶段或泳道分组
  flows?: BlueprintFlow[]; // 节点间连线
}

interface BlueprintSection {
  id: string; // 分组唯一ID，如 "phase-1", "backlog"
  title: string; // 分组标题，如 "第一阶段：核心开发"
  isGroup?: boolean; // 为 true 时在画布上渲染为可视化的 Group 容器卡片
  color?: string;
  items: BlueprintItem[]; // 组内包含的节点清单
}

type BlueprintItem =
  | {
      id: string;
      kind: "doc";
      title: string;
      content: string; // 支持完整 Markdown 格式
    }
  | {
      id: string;
      kind: "task";
      content: string; // 任务标题
      priority?: 1 | 2 | 3 | 4; // 1: 紧急, 2: 高, 3: 中, 4: 低
      dueDate?: string; // 截止日期，如 "2026-09-20"
      projectName?: string; // 所属项目名称（自动关联或创建）
      existingTaskId?: string; // 复用已有任务 ID（强烈推荐优先复用）
    }
  | {
      id: string;
      kind: "habit";
      name: string;
      color?: string;
      existingHabitId?: string; // 复用已有习惯 ID
    }
  | {
      id: string;
      kind: "project";
      name: string;
      color?: string;
      existingProjectId?: string; // 复用已有项目 ID
    }
  | {
      id: string;
      kind: "focus";
    };

interface BlueprintFlow {
  fromItemId: string; // 源节点 item id
  toItemId: string; // 目标节点 item id
}
```

### 4.2 增量微调数据结构 (`patch_workspace`)

当用户要求微调现有工作台时，**必须使用 `patch_workspace`**，禁止推倒重构，严守“保留用户已有卡片绝对位置”的铁则：

```typescript
interface BlueprintPatch {
  workspaceId: string;
  // 1. 局部新增：向指定 section/group 中追加卡片
  addItems?: Array<{
    sectionId?: string;
    targetGroupId?: string;
    item: BlueprintItem;
  }>;
  // 2. 局部删除：仅移除指定 ID 的节点卡片
  removeNodeIds?: string[];
  // 3. 文档热更新：就地修改文档节点的标题或正文
  updateDocs?: Array<{
    nodeId: string;
    title?: string;
    content?: string;
  }>;
  // 4. 连线增删
  addFlows?: BlueprintFlow[];
  removeEdgeIds?: string[];
}
```

---

## 5. 人机交互沟通与精准微调指南 (Prompting & Fine-tuning)

为了让用户与 AI 沟通时意图清晰，双方应约定使用统一标准用语：

### 5.1 常用交互词汇对照表

| 用户口头表述                    | 规范对应实体                   | AI 处理动作 / MCP 工具                     |
| :------------------------------ | :----------------------------- | :----------------------------------------- |
| “建一个说明卡/便签/Prompt”      | **文档节点 (`doc`)**           | 添加 `kind: "doc"`，写入 Markdown          |
| “加一个待办/任务”               | **任务节点 (`task`)**          | 检查已有任务复用，或新建任务节点           |
| “加一个打卡/习惯”               | **习惯节点 (`habit`)**         | 检查已有习惯，放置习惯节点                 |
| “把XX日期的会议/考试放上去”     | **事件节点 (`event`)**         | 检索日历事件，挂载事件节点                 |
| “放个番茄钟/倒计时”             | **专注节点 (`focus`)**         | 挂载专注单例透镜节点                       |
| “把这几个放在一个框里/建个阶段” | **分组容器 (`group`)**         | 设定 `isGroup: true` 并包裹目标卡片        |
| “连一根线/建立依赖”             | **连线 (`flow`)**              | 配置 `fromItemId` $\to$ `toItemId` 连线    |
| “改一下第一阶段说明里的内容”    | **微调文档 (`updateDocs`)**    | 调用 `patch_workspace` 仅更新指定 doc 节点 |
| “删掉那个旧任务卡片”            | **局部删除 (`removeNodeIds`)** | 调用 `patch_workspace`，不破坏其余卡片坐标 |

### 5.2 精准指令范例

#### 场景 1：全量构建工作流

> **用户指令**：“请为我创建一个‘考研数学复习冲刺’工作台。分为三个阶段：基础概念（分组）、强化刷题（分组）、考前模考（分组）。基础概念阶段放一个复习指南文档节点和两个核心任务；强化刷题放每日刷题习惯节点和一个专注节点；考前模考连接到 12月20日 的考试事件节点。注意每个阶段从左到右连线建立流程。”  
> **AI 动作**：调用 `inspect_app_context` 查看用户是否已有考研相关任务/习惯，随后调用 `build_workspace` 编译带连线与自适应分组的完整蓝图。

#### 场景 2：局部微调与拓扑变更

> **用户指令**：“在‘强化刷题’分组里追加一个任务节点：‘完成近三年真题分析’，并建立从‘复习指南文档’指向该任务的连线。”  
> **AI 动作**：调用 `get_workspace_blueprint` 获取当前工作台状态与节点 ID，调用 `patch_workspace` 执行 `addItems` 与 `addFlows`，原有卡片绝对位置分毫不动。

---

## 6. 审查与演进维护

- **变更触发**：任何涉及新增节点类型（如未来的白板手绘节点、网页嵌入节点、数据报表节点）或修改连线行为，必须同步更新本规范文件与 `types.ts`。
- **审查机制**：规范修改需经人类架构师审批后方可合入。
