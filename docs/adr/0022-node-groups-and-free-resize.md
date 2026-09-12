# Node groups are visual container frames; member coordinates are parent-relative

A Workspace canvas now supports **grouping** (打组) and **free container resizing**: multiple nodes can be organized into a visual container frame (`kind: "group"`), with children enclosed inside the container, moving with it, and auto-expanding the container boundary when moved near the edges.

This decision settles the visual model, coordinate persistence scheme, member boundary interaction, and lifecycle semantics for workspace node groups.

---

## 1. Visual Model: Container Frame Pattern

A group is an explicit visual container node (`kind: "group"` in `workspace_nodes`), not a decorative border or an invisible tag:

- Rendered via `GroupNode`, featuring an ink & matte container card with a top header strip (color dot, editable group title, member count badge `02`, and an ungroup button) and a translucent matte backdrop.
- Includes `NodeResizer` handles for free resizing, constrained to minimum bounds (240px × 160px).
- In React Flow, container nodes must precede member nodes in the DOM order so that child cards sit on top of the container's background surface and receive pointer/drag events cleanly. `toWorkspaceFlowNodes` explicitly sorts `group` nodes ahead of content nodes.

---

## 2. Coordinate Storage: Parent-Relative Coordinates (方案一)

When a node belongs to a group (`group_id != null`):

- Its `position_x` and `position_y` in the database (`workspace_nodes`) represent **parent-relative offsets** from the top-left corner of its group container.
- **Why parent-relative coordinates?**
  1. **Zero cascading writes on container drag:** When the user moves the group container, only the container's own `position_x, position_y` is written to the database (a single row update). All member nodes maintain their relative offsets automatically without any secondary database updates or network thrash.
  2. **Atomic boundary calculation:** Grouping computes the bounding box of selected items plus padding (`x - 40`, `y - 60`, `w + 80`, `h + 100`), creates the group container node, and converts member absolute coordinates into container-relative offsets:
     $$x_{\text{relative}} = x_{\text{absolute}} - x_{\text{group}}$$
     $$y_{\text{relative}} = y_{\text{absolute}} - y_{\text{group}}$$
  3. **Lossless ungrouping:** Ungrouping dissolves the group container and restores each member's absolute coordinates:
     $$x_{\text{absolute}} = x_{\text{group}} + x_{\text{relative}}$$
     $$y_{\text{absolute}} = y_{\text{group}} + y_{\text{relative}}$$

---

## 3. Boundary Semantics: Gesture Penetration without Unwanted Container Expansion

Member nodes within a group do NOT use React Flow's `expandParent: true`:

- **Smooth drag out**: When a user drags a member node towards or past the container edge, the parent container dimensions remain fixed. The card smoothly floats out of the container across the canvas.
- **Center-point hit testing**: On mouse release (`handleNodeDragStop`), if the card center is outside the container, it detaches into an independent canvas root node; if dropped into another container, it attaches to that container.
- **On-demand resize expansion**: If a member card inside a group is resized (via `CardResizer`), or moved within the group near the bottom-right corner, the container auto-expands upon release to maintain comfortable margins (`requiredW > gw || requiredH > gh`).

---

## 4. Lifecycle: Auto-Dissolution on Zero Members (选项 A)

A group exists solely to organize member nodes:

- When member nodes are deleted or ungrouped, the system tracks remaining members.
- If a member is deleted and the container's member count drops to 0, the empty container automatically dissolves: its row in `workspace_nodes` is removed, and a `node.removed` domain event is emitted for the group.
- An empty container never dangles orphaned on the canvas.

---

## 5. Persistence & Commands

1. **Schema (`workspace_nodes`):**
   - Added `group_id TEXT REFERENCES workspace_nodes(id) ON DELETE SET NULL`
   - Added index `workspace_nodes_group_id_idx` on `(workspace_id, group_id)`
2. **Domain Commands:**
   - `node.createGroup`: Creates the container node and atomicity updates member coordinates and `group_id`. Emits `node.added` for the group and `node.grouped` for each member.
   - `node.ungroup`: Restores absolute coordinates for all members, deletes the container row, and emits `node.removed` (group) and `node.ungrouped` (members).
   - `node.renameGroup`: Edits `display_config.title` with optimistic store update.
   - `node.resize`: Persists container dimensions with debounced persistence (Layer 3, 400ms debounce) and emits `node.resized`.
3. **Guest & Cloud Parity:**
   - Both IndexedDB (`guest-store.ts`) and Postgres/Supabase implement identical transactional grouping, ungrouping, renaming, and auto-dissolution logic.

---

## 6. Consequences

- **Performance:** Moving large groups (e.g. 20+ cards) produces exactly 1 database write instead of $N + 1$ writes.
- **Visual Clarity:** Ink & matte aesthetic styling preserves Kagelin's minimalist, high-contrast visual design.
- **Edge Routing:** Edges between grouped nodes and external nodes seamlessly connect to the card ports across container boundaries.

---

## 7. Interactive Connection Lines: Feishu-Style Cancellation

Connection lines between cards use custom `WorkspaceEdge` component:

- **Midpoint disconnect button**: An interactive floating button rendered at the curve midpoint `(labelX, labelY)` via `EdgeLabelRenderer`. It smoothly appears when the line is hovered or selected.
- **24px hit area**: An invisible wide path under the bezier curve enables effortless clicking and hovering.
- **Direct cancellation**: Clicking the button calls `reactFlow.deleteElements({ edges: [{ id }] })`, cleanly severing the connection without needing to delete cards.
- **Keyboard delete**: Selecting the line and pressing `Delete` or `Backspace` also severs the connection via `onEdgesDelete`.
