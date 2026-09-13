# Kagelin Workspace Builder MCP Instructions

Use this MCP server to inspect, compile, scaffold, and incrementally modify workspace canvases and visual workflows in Kagelin.

## Core Node Taxonomy & Semantics

Every item placed on the canvas MUST map to one of these registered node kinds:

1. **`doc` (Document Node / 文档节点)**
   - **Purpose**: Explanations, SOP guidelines, milestone targets, prompts, review summaries, or notes.
   - **Fields**: `id: string`, `kind: "doc"`, `title: string`, `content: string` (Markdown supported).
   - **Characteristics**: Self-contained (not linked to external entity tables). Renders Markdown in-place; provides a one-click copy button (ideal for AI prompt cards) and double-click title editing. Dynamic auto-height.

2. **`task` (Task Node / 任务节点)**
   - **Purpose**: Actionable to-do items. Live reference to a real task in Kagelin.
   - **Fields**: `id: string`, `kind: "task"`, `content: string`, `priority?: 1 | 2 | 3 | 4` (1=P1/Urgent, 4=P4/Low), `dueDate?: string`, `projectName?: string`, `existingTaskId?: string`.
   - **Characteristics**: Live soft-reference. Interactive checkbox directly toggles task completion on canvas without leaving. Shows priority flag, due date badges, and subtask progress. Always check `inspect_app_context` to reuse `existingTaskId` when applicable.

3. **`habit` (Habit Node / 习惯节点)**
   - **Purpose**: Daily routines, recurring cadences, or behavioral support systems (e.g. "Daily review", "Study 1h").
   - **Fields**: `id: string`, `kind: "habit"`, `name: string`, `color?: string`, `existingHabitId?: string`.
   - **Characteristics**: Live soft-reference. Interactive check-in circle for today. Displays streak count ("连续 N 天") and custom icon/color.

4. **`project` (Project Node / 项目节点)**
   - **Purpose**: Sub-system / Epic / Milestone overview board aggregating related tasks.
   - **Fields**: `id: string`, `kind: "project"`, `name: string`, `color?: string`, `existingProjectId?: string`.
   - **Characteristics**: Live soft-reference. Displays project theme dot, overall completion progress bar (e.g. "4/10 任务完成 (40%)"), and up to 4 inline actionable tasks with direct checkbox completion.

5. **`focus` (Focus Node / 专注节点)**
   - **Purpose**: Execution station / Pomodoro timer lens.
   - **Fields**: `id: string`, `kind: "focus"`.
   - **Characteristics**: Singleton visual projection of global `timerStore`. Built-in play/pause/stop controls, mode indicator (Focus / Short Break / Long Break), and countdown display.

6. **`group` (Group Container Frame / 分组容器)**
   - **Purpose**: Visual grouping boundary for stages, phases, or functional swimlanes (e.g., "Phase 1: Concepts", "Phase 2: Sprint").
   - **Fields in Blueprint**: `BlueprintSection` with `isGroup: true`.
   - **Characteristics**: Ink & matte container card. Child nodes use parent-relative coordinates. Dragging the container moves all members smoothly with 1 single DB write. Dissolves automatically if member count reaches 0.

7. **`flows` (Workflow Edges / 连线)**
   - **Purpose**: Directed dependency or informational flow between cards.
   - **Fields**: `fromItemId: string`, `toItemId: string`.
   - **Characteristics**: Strict Left-to-Right orientation: connects source node's Right port (`out`) to target node's Left port (`in`). Renders bezier curves with Feishu-style midpoint disconnect button.

---

## Standard Workflow Patterns & Recipes

### 1. New Workspace Scaffolding Flow

1. **Always inspect context first**: Call `inspect_app_context({ limit: 20 })` to discover existing tasks, habits, and projects. Reuse existing entity IDs (`existingTaskId`, `existingHabitId`, `existingProjectId`) to prevent duplicates.
2. **Clarify if requirements are ambiguous**: Ask 2-3 focused questions about milestone stages and timeline before building.
3. **Compile blueprint**: Call `build_workspace({ blueprint })` using structured sections (`isGroup: true` for phases) and `flows` for dependencies.

### 2. Incremental Fine-Tuning Flow (Never Overwrite!)

1. **Inspect existing canvas first**: Call `get_workspace_blueprint({ workspaceId })` to obtain current snapshot and node IDs.
2. **Apply localized patch**: Call `patch_workspace` with surgical changes:
   - `addItems`: Append cards to specific sections or groups without displacing untouched cards.
   - `updateDocs`: In-place edit of doc titles or markdown content.
   - `removeNodeIds`: Delete specific cards.
   - `addFlows` / `removeEdgeIds`: Adjust connections.
3. **Never call `build_workspace` on an existing canvas**: Rebuilding erases manual layouts. Always use `patch_workspace`.

---

## Layout & Styling Constants

- **Column Gap**: `80px`
- **Card Vertical Gap**: `20px`
- **Group Padding**: `24px` (inner margins)
- **Group Header Clearance**: `48px`
- **Card Dimensions**:
  - `doc`: 280px × (dynamic: 160px ~ 400px+)
  - `task`: 260px × 96px
  - `habit`: 240px × 88px
  - `project`: 280px × 120px
  - `focus`: 220px × 100px
