import { describe, it, expect } from "vitest";
import {
  compileBlueprintLayout,
  doBoundsOverlap,
  estimateDocHeight,
  getItemDimensions,
  getNodeAbsoluteBounds,
  isNodeWithinGroup,
  LAYOUT_CONSTANTS,
  resolveOptimalHandles,
} from "@/lib/workspace/blueprint/layout";
import {
  WorkspaceBlueprintSchema,
  type BlueprintDocItem,
  type BlueprintFocusItem,
  type BlueprintHabitItem,
  type BlueprintProjectItem,
  type BlueprintTaskItem,
  type CompiledLayoutNode,
  type WorkspaceBlueprint,
} from "@/lib/workspace/blueprint/types";

describe("Workspace Blueprint - Schema Validation", () => {
  it("validates a full blueprint containing all item kinds and flows", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Q4 Product Revamp",
      color: "#6366f1",
      sections: [
        {
          id: "sec-goals",
          title: "Goals & Spec",
          isGroup: true,
          color: "#4f46e5",
          items: [
            {
              id: "doc-spec",
              kind: "doc",
              title: "Product Spec",
              content: "# Product Spec\n\n- Scope 1\n- Scope 2",
            },
            {
              id: "task-review",
              kind: "task",
              content: "Review spec with team",
              priority: 1,
              dueDate: "2026-09-20",
              projectName: "Revamp",
            },
          ],
        },
        {
          id: "sec-routines",
          title: "Daily Routines",
          isGroup: false,
          items: [
            {
              id: "habit-sync",
              kind: "habit",
              name: "Morning Standup",
              color: "#10b981",
            },
            {
              id: "focus-sprint",
              kind: "focus",
            },
          ],
        },
      ],
      flows: [
        {
          fromItemId: "doc-spec",
          toItemId: "task-review",
        },
      ],
    };

    const parsed = WorkspaceBlueprintSchema.parse(blueprint);
    expect(parsed.name).toBe("Q4 Product Revamp");
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.flows).toHaveLength(1);
  });

  it("fails validation when required fields are missing", () => {
    const invalidBlueprint = {
      // Missing name
      sections: [
        {
          id: "sec-1",
          title: "Section 1",
          items: [
            {
              id: "task-1",
              kind: "task",
              // Missing content
            },
          ],
        },
      ],
    };

    const result = WorkspaceBlueprintSchema.safeParse(invalidBlueprint);
    expect(result.success).toBe(false);
  });
});

describe("Workspace Blueprint - Standard Card Dimensions", () => {
  it("resolves exact standard dimensions for fixed-size cards", () => {
    const taskItem: BlueprintTaskItem = {
      id: "t1",
      kind: "task",
      content: "Task 1",
    };
    const habitItem: BlueprintHabitItem = {
      id: "h1",
      kind: "habit",
      name: "Habit 1",
    };
    const projectItem: BlueprintProjectItem = {
      id: "p1",
      kind: "project",
      name: "Project 1",
    };
    const focusItem: BlueprintFocusItem = {
      id: "f1",
      kind: "focus",
    };

    expect(getItemDimensions(taskItem)).toEqual({
      width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.width, // 280
      height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.height, // 96
    });

    expect(getItemDimensions(habitItem)).toEqual({
      width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.habit.width, // 260
      height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.habit.height, // 88
    });

    expect(getItemDimensions(projectItem)).toEqual({
      width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.project.width, // 300
      height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.project.height, // 120
    });

    expect(getItemDimensions(focusItem)).toEqual({
      width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.focus.width, // 240
      height: LAYOUT_CONSTANTS.CARD_DIMENSIONS.focus.height, // 100
    });

    expect(
      getItemDimensions({
        id: "d1",
        kind: "decision",
        question: "Approved?",
      }),
    ).toEqual({
      width: 240,
      height: 120,
    });

    expect(
      getItemDimensions({
        id: "s1",
        kind: "step",
        title: "Send Notification",
      }),
    ).toEqual({
      width: 280,
      height: 88,
    });
  });

  it("calculates dynamic Doc height based on markdown content volume", () => {
    // Empty content defaults to standard defaultHeight (180px)
    expect(estimateDocHeight("")).toBe(
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight,
    );
    expect(estimateDocHeight(undefined)).toBe(
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight,
    );

    // Minimal single line is bounded by minHeight (160px)
    expect(estimateDocHeight("Short note")).toBe(
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.minHeight,
    );

    // Multi-line content scales height dynamically
    const lines10 = Array.from(
      { length: 10 },
      (_, i) => `- [ ] Checklist item number ${i + 1}`,
    ).join("\n");
    const height10 = estimateDocHeight(lines10);
    expect(height10).toBeGreaterThan(
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.defaultHeight,
    );

    // 20 lines requires more height than 10 lines
    const lines20 = Array.from(
      { length: 20 },
      (_, i) => `- [ ] Checklist item number ${i + 1}`,
    ).join("\n");
    const height20 = estimateDocHeight(lines20);
    expect(height20).toBeGreaterThan(height10);

    const docItem: BlueprintDocItem = {
      id: "d1",
      kind: "doc",
      title: "Doc Title",
      content: lines10,
    };
    expect(getItemDimensions(docItem)).toEqual({
      width: LAYOUT_CONSTANTS.CARD_DIMENSIONS.doc.width, // 280
      height: height10,
    });
  });

  it("accurately estimates height for rich Markdown with headers, lists, code blocks and paragraph breaks", () => {
    // 1. Headings
    const h1Content = "# Main Section Header";
    // baseChrome (76) + 48 + 24 = 148 -> minHeight 160
    expect(estimateDocHeight(h1Content)).toBe(160);

    const h1WithSub = "# Title\n\n### Subtitle";
    // baseChrome (76) + H1 (48) + blank line (16) + H3 (36) + buffer (24) = 200
    expect(estimateDocHeight(h1WithSub)).toBe(200);

    // 2. Lists
    const listContent = "- Item 1\n- Item 2\n- Item 3";
    // baseChrome (76) + 3 * 26 + buffer (24) = 178
    expect(estimateDocHeight(listContent)).toBe(178);

    // 3. Code block
    const codeContent = "```typescript\nconst a = 1;\nconst b = 2;\n```";
    // baseChrome (76) + fence entry (16) + 2 * 32 + fence exit (16) + buffer (24) = 196
    expect(estimateDocHeight(codeContent)).toBe(196);

    // 4. Rich SOP release guideline
    const sopDoc = [
      "# 金丝雀发布操作规程",
      "前置准备与准入条件：",
      "- [ ] 确认全量测试用例已绿灯通过",
      "- [ ] 检查 Prometheus 指标基线处于健康范围",
      "- [ ] 确认已配置自动回滚告警策略",
      "",
      "### 执行准则",
      "1. 导入 5% 灰度流量持续观察 5 分钟",
      "2. 错误率上升 > 0.05% 即刻触发熔断",
    ].join("\n");
    // Calculation:
    // baseChrome: 76
    // H1: 48
    // Prose line: 22
    // 3 list items: 3 * 26 = 78
    // blank line: 16
    // H3: 36
    // 2 numbered list items: 2 * 26 = 52
    // buffer: +24
    // Total = 76 + 48 + 22 + 78 + 16 + 36 + 52 + 24 = 352
    const estimatedSopHeight = estimateDocHeight(sopDoc);
    expect(estimatedSopHeight).toBe(352);
    expect(estimatedSopHeight).toBeGreaterThan(250);

    // 5. Clamps at maxHeight (480px) for ultra-long documents
    const longDoc = Array.from(
      { length: 30 },
      (_, i) => `Step ${i + 1}: detailed procedure explanation text`,
    ).join("\n");
    expect(estimateDocHeight(longDoc)).toBe(480);
  });
});

describe("Workspace Blueprint - Group Container & Containment Math", () => {
  it("encloses all member cards with 32px padding and 52px header clearance", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Group Test",
      sections: [
        {
          id: "group-sec",
          title: "Sprint Group",
          isGroup: true,
          items: [
            { id: "task-1", kind: "task", content: "Task 1" },
            { id: "task-2", kind: "task", content: "Task 2" },
          ],
        },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toHaveLength(3); // 1 group node + 2 task nodes

    const groupNode = layout.nodes.find((n) => n.id === "group-sec");
    expect(groupNode).toBeDefined();
    expect(groupNode?.kind).toBe("group");
    expect(groupNode?.groupId).toBeNull();
    expect(groupNode?.position).toEqual({ x: 0, y: 0 });

    const memberNodes = layout.nodes.filter((n) => n.groupId === "group-sec");
    expect(memberNodes).toHaveLength(2);

    // Group node precedes member nodes in array order
    const groupIdx = layout.nodes.findIndex((n) => n.id === "group-sec");
    const member1Idx = layout.nodes.findIndex((n) => n.id === "task-1");
    const member2Idx = layout.nodes.findIndex((n) => n.id === "task-2");
    expect(groupIdx).toBeLessThan(member1Idx);
    expect(groupIdx).toBeLessThan(member2Idx);

    // First child is positioned with 32px left padding and 52px top header clearance
    expect(memberNodes[0].position).toEqual({
      x: LAYOUT_CONSTANTS.GROUP_PADDING, // 32
      y: LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE, // 52
    });

    // Second child is stacked below first child with 40px card gap
    const expectedChild2Y =
      LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE +
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.height + // 52 + 96 = 148
      LAYOUT_CONSTANTS.CARD_GAP; // 148 + 40 = 188
    expect(memberNodes[1].position).toEqual({
      x: LAYOUT_CONSTANTS.GROUP_PADDING,
      y: expectedChild2Y,
    });

    // Group bounding box wraps children with 32px padding (min width is 320)
    const expectedGroupWidth = Math.max(
      LAYOUT_CONSTANTS.GROUP_MIN_WIDTH,
      LAYOUT_CONSTANTS.GROUP_PADDING * 2 +
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.width, // 32 + 280 + 32 = 344
    );
    const expectedGroupHeight = Math.max(
      LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT,
      expectedChild2Y +
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.height +
        LAYOUT_CONSTANTS.GROUP_PADDING, // 188 + 96 + 32 = 316
    );

    expect(groupNode?.width).toBe(expectedGroupWidth);
    expect(groupNode?.height).toBe(expectedGroupHeight);

    // Strict containment assertion: each child is inside the group
    for (const member of memberNodes) {
      expect(isNodeWithinGroup(member, groupNode!)).toBe(true);
    }
  });

  it("handles empty group section with standard minimum dimensions", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Empty Group",
      sections: [
        {
          id: "empty-group",
          title: "Empty Lane",
          isGroup: true,
          items: [],
        },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toHaveLength(1);

    const group = layout.nodes[0];
    expect(group.id).toBe("empty-group");
    expect(group.width).toBe(LAYOUT_CONSTANTS.GROUP_MIN_WIDTH); // 320
    expect(group.height).toBe(LAYOUT_CONSTANTS.GROUP_MIN_HEIGHT); // 200
  });
});

describe("Workspace Blueprint - Non-Group Standalone Sections", () => {
  it("assigns absolute canvas coordinates and null groupId to standalone items", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Standalone Test",
      sections: [
        {
          id: "sec-standalone",
          title: "Free Cards",
          isGroup: false,
          items: [
            { id: "h1", kind: "habit", name: "Habit A" },
            { id: "f1", kind: "focus" },
          ],
        },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    // Standalone section creates no group node
    expect(layout.nodes).toHaveLength(2);

    const [h1, f1] = layout.nodes;
    expect(h1.groupId).toBeNull();
    expect(f1.groupId).toBeNull();

    expect(h1.position).toEqual({ x: 0, y: 0 });
    expect(f1.position).toEqual({
      x: 0,
      y:
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.habit.height +
        LAYOUT_CONSTANTS.CARD_GAP, // 88 + 20 = 108
    });
  });
});

describe("Workspace Blueprint - Deterministic Auto-Layout & Zero-Collision Invariants", () => {
  const sampleBlueprint: WorkspaceBlueprint = {
    name: "Complete Architecture Roadmap",
    sections: [
      {
        id: "sec-1-group",
        title: "Phase 1: Architecture",
        isGroup: true,
        items: [
          {
            id: "doc-arch",
            kind: "doc",
            title: "ADR 0022 Overview",
            content: "Detailed RFC and architecture decisions for workspace.",
          },
          {
            id: "task-spec",
            kind: "task",
            content: "Write schema definitions",
            priority: 1,
          },
        ],
      },
      {
        id: "sec-2-standalone",
        title: "Sprint Tasks",
        isGroup: false,
        items: [
          {
            id: "proj-core",
            kind: "project",
            name: "Core Engine Project",
          },
          {
            id: "task-compiler",
            kind: "task",
            content: "Implement layout compiler",
          },
          {
            id: "task-tests",
            kind: "task",
            content: "Unit test zero collision invariants",
          },
        ],
      },
      {
        id: "sec-3-group",
        title: "Phase 2: Review",
        isGroup: true,
        items: [
          {
            id: "habit-daily",
            kind: "habit",
            name: "Daily Code Review",
          },
          {
            id: "focus-block",
            kind: "focus",
          },
        ],
      },
    ],
    flows: [
      { fromItemId: "doc-arch", toItemId: "task-spec" },
      { fromItemId: "task-spec", toItemId: "proj-core" },
      { fromItemId: "proj-core", toItemId: "task-compiler" },
      { fromItemId: "task-compiler", toItemId: "task-tests" },
      { fromItemId: "task-tests", toItemId: "habit-daily" },
    ],
  };

  it("guarantees 100% deterministic, reproducible output for identical blueprints", () => {
    const layout1 = compileBlueprintLayout(sampleBlueprint);
    const layout2 = compileBlueprintLayout(sampleBlueprint);

    expect(layout1).toEqual(layout2);
    expect(JSON.stringify(layout1)).toBe(JSON.stringify(layout2));
  });

  it("enforces 120px horizontal column spacing between adjacent lanes", () => {
    const layout = compileBlueprintLayout(sampleBlueprint);
    const nodesById = new Map<string, CompiledLayoutNode>(
      layout.nodes.map((n) => [n.id, n]),
    );

    // Section 1 is a group at x=0
    const sec1Group = nodesById.get("sec-1-group")!;
    expect(sec1Group.position.x).toBe(0);

    // Section 2 starts exactly at sec1.x + sec1.width + 120
    const sec2FirstNode = nodesById.get("proj-core")!;
    const expectedSec2X =
      sec1Group.position.x + sec1Group.width + LAYOUT_CONSTANTS.COLUMN_GAP; // + 120
    expect(sec2FirstNode.position.x).toBe(expectedSec2X);

    // Section 3 is a group starting at sec2.x + sec2.width + 120
    const sec2Width = Math.max(
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.project.width, // 300
      LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.width, // 280
    );
    const expectedSec3X =
      sec2FirstNode.position.x + sec2Width + LAYOUT_CONSTANTS.COLUMN_GAP;
    const sec3Group = nodesById.get("sec-3-group")!;
    expect(sec3Group.position.x).toBe(expectedSec3X);
  });

  it("asserts zero overlapping bounding boxes among all sibling nodes and peer groups", () => {
    const layout = compileBlueprintLayout(sampleBlueprint);
    const nodesById = new Map<string, CompiledLayoutNode>(
      layout.nodes.map((n) => [n.id, n]),
    );

    // 1. Verify top-level peer nodes (groups and standalone nodes) do not overlap
    const topLevelNodes = layout.nodes.filter((n) => !n.groupId);
    for (let i = 0; i < topLevelNodes.length; i++) {
      for (let j = i + 1; j < topLevelNodes.length; j++) {
        const boundsA = getNodeAbsoluteBounds(topLevelNodes[i], nodesById);
        const boundsB = getNodeAbsoluteBounds(topLevelNodes[j], nodesById);
        const overlap = doBoundsOverlap(boundsA, boundsB);
        expect(overlap).toBe(false);
      }
    }

    // 2. Verify sibling member nodes within the same group do not overlap
    const groupIds = [
      ...new Set(layout.nodes.map((n) => n.groupId).filter(Boolean)),
    ] as string[];
    for (const gid of groupIds) {
      const members = layout.nodes.filter((n) => n.groupId === gid);
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const boundsA = getNodeAbsoluteBounds(members[i], nodesById);
          const boundsB = getNodeAbsoluteBounds(members[j], nodesById);
          const overlap = doBoundsOverlap(boundsA, boundsB);
          expect(overlap).toBe(false);
        }
      }
    }

    // 3. Verify ALL non-parent-child pairs in absolute canvas coordinates do not overlap
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const nodeA = layout.nodes[i];
        const nodeB = layout.nodes[j];

        // Skip parent-group and child containment pairs
        if (nodeA.groupId === nodeB.id || nodeB.groupId === nodeA.id) {
          continue;
        }

        const boundsA = getNodeAbsoluteBounds(nodeA, nodesById);
        const boundsB = getNodeAbsoluteBounds(nodeB, nodesById);
        const overlap = doBoundsOverlap(boundsA, boundsB);
        expect(overlap).toBe(false);
      }
    }
  });

  it("asserts all member nodes are strictly contained within their parent group bounding box", () => {
    const layout = compileBlueprintLayout(sampleBlueprint);
    const nodesById = new Map<string, CompiledLayoutNode>(
      layout.nodes.map((n) => [n.id, n]),
    );

    const memberNodes = layout.nodes.filter((n) => n.groupId != null);
    expect(memberNodes.length).toBeGreaterThan(0);

    for (const member of memberNodes) {
      const parentGroup = nodesById.get(member.groupId!)!;
      expect(parentGroup).toBeDefined();
      expect(isNodeWithinGroup(member, parentGroup)).toBe(true);

      // Verify absolute bounds containment
      const memberAbs = getNodeAbsoluteBounds(member, nodesById);
      const groupAbs = getNodeAbsoluteBounds(parentGroup, nodesById);

      expect(memberAbs.x).toBeGreaterThanOrEqual(
        groupAbs.x + LAYOUT_CONSTANTS.GROUP_PADDING,
      );
      expect(memberAbs.x + memberAbs.width).toBeLessThanOrEqual(
        groupAbs.x + groupAbs.width - LAYOUT_CONSTANTS.GROUP_PADDING,
      );
      expect(memberAbs.y).toBeGreaterThanOrEqual(
        groupAbs.y + LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE,
      );
      expect(memberAbs.y + memberAbs.height).toBeLessThanOrEqual(
        groupAbs.y + groupAbs.height - LAYOUT_CONSTANTS.GROUP_PADDING,
      );
    }
  });

  it("calculates accurate total layout canvas bounds", () => {
    const layout = compileBlueprintLayout(sampleBlueprint);
    const { bounds } = layout;

    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.maxY).toBeGreaterThan(0);
    expect(bounds.width).toBe(bounds.maxX - bounds.minX);
    expect(bounds.height).toBe(bounds.maxY - bounds.minY);
  });
});

describe("Workspace Blueprint - Flow Edges Generation", () => {
  it("generates deterministic edges linking valid source to target items", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Flow Blueprint",
      sections: [
        {
          id: "sec-1",
          title: "Lanes",
          isGroup: false,
          items: [
            { id: "task-a", kind: "task", content: "A" },
            { id: "task-b", kind: "task", content: "B" },
            { id: "task-c", kind: "task", content: "C" },
          ],
        },
      ],
      flows: [
        { fromItemId: "task-a", toItemId: "task-b" },
        { fromItemId: "task-b", toItemId: "task-c" },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.edges).toHaveLength(2);

    expect(layout.edges[0]).toEqual({
      id: "flow-task-a-task-b",
      sourceNodeId: "task-a",
      targetNodeId: "task-b",
      label: null,
      sourceHandle: "out-bottom",
      targetHandle: "in-top",
    });

    expect(layout.edges[1]).toEqual({
      id: "flow-task-b-task-c",
      sourceNodeId: "task-b",
      targetNodeId: "task-c",
      label: null,
      sourceHandle: "out-bottom",
      targetHandle: "in-top",
    });
  });

  it("auto-assigns out-bottom -> in-top for sequential vertical steps within the same group lane", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "SOP Lane",
      sections: [
        {
          id: "lane-1",
          title: "Execution",
          isGroup: true,
          items: [
            { id: "s1", kind: "step", title: "Step 1" },
            { id: "s2", kind: "step", title: "Step 2" },
          ],
        },
      ],
      flows: [{ fromItemId: "s1", toItemId: "s2" }],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].sourceHandle).toBe("out-bottom");
    expect(layout.edges[0].targetHandle).toBe("in-top");
  });

  it("auto-assigns out -> in for cross-lane horizontal flows", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Cross-lane",
      sections: [
        {
          id: "lane-1",
          title: "Lane 1",
          isGroup: true,
          items: [{ id: "s1", kind: "step", title: "Step 1" }],
        },
        {
          id: "lane-2",
          title: "Lane 2",
          isGroup: true,
          items: [{ id: "s2", kind: "step", title: "Step 2" }],
        },
      ],
      flows: [{ fromItemId: "s1", toItemId: "s2" }],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].sourceHandle).toBe("out");
    expect(layout.edges[0].targetHandle).toBe("in");
  });

  it("compiles multi-branch flowchart topologies with decision nodes, ports, and edge labels without overlap", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Authentication Flow",
      sections: [
        {
          id: "sec-trigger",
          title: "Trigger",
          isGroup: false,
          items: [
            {
              id: "step-login",
              kind: "step",
              title: "User submits credentials",
            },
          ],
        },
        {
          id: "sec-decision",
          title: "Decision Gate",
          isGroup: false,
          items: [
            {
              id: "dec-valid",
              kind: "decision",
              question: "Password correct?",
            },
          ],
        },
        {
          id: "sec-branches",
          title: "Outcomes",
          isGroup: false,
          items: [
            {
              id: "task-dashboard",
              kind: "task",
              content: "Redirect to Dashboard",
            },
            {
              id: "step-error",
              kind: "step",
              title: "Show error & increment failed count",
            },
          ],
        },
      ],
      flows: [
        {
          fromItemId: "step-login",
          toItemId: "dec-valid",
          toPort: "in-top",
        },
        {
          fromItemId: "dec-valid",
          toItemId: "task-dashboard",
          label: "Yes",
          fromPort: "out",
        },
        {
          fromItemId: "dec-valid",
          toItemId: "step-error",
          label: "No",
          fromPort: "out-bottom",
        },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(3);

    // Verify incoming target handle and outgoing source handles
    const inEdge = layout.edges.find(
      (e) => e.sourceNodeId === "step-login" && e.targetNodeId === "dec-valid",
    );
    expect(inEdge).toBeDefined();
    expect(inEdge?.targetHandle).toBe("in-top");

    const yesEdge = layout.edges.find(
      (e) =>
        e.sourceNodeId === "dec-valid" && e.targetNodeId === "task-dashboard",
    );
    expect(yesEdge).toBeDefined();
    expect(yesEdge?.label).toBe("Yes");
    expect(yesEdge?.sourceHandle).toBe("out");

    const noEdge = layout.edges.find(
      (e) => e.sourceNodeId === "dec-valid" && e.targetNodeId === "step-error",
    );
    expect(noEdge).toBeDefined();
    expect(noEdge?.label).toBe("No");
    expect(noEdge?.sourceHandle).toBe("out-bottom");

    // Verify non-overlapping nodes in the outcome lane
    const nodesById = new Map(layout.nodes.map((n) => [n.id, n]));
    const dashboardBounds = getNodeAbsoluteBounds(
      nodesById.get("task-dashboard")!,
      nodesById,
    );
    const errorBounds = getNodeAbsoluteBounds(
      nodesById.get("step-error")!,
      nodesById,
    );
    expect(doBoundsOverlap(dashboardBounds, errorBounds)).toBe(false);
  });

  it("filters out dangling flows referencing non-existent items and self-loops", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Dangling Flow Test",
      sections: [
        {
          id: "sec-1",
          title: "Lane",
          isGroup: false,
          items: [{ id: "task-valid", kind: "task", content: "Valid" }],
        },
      ],
      flows: [
        // Non-existent target
        { fromItemId: "task-valid", toItemId: "missing-task" },
        // Non-existent source
        { fromItemId: "ghost-task", toItemId: "task-valid" },
        // Self loop
        { fromItemId: "task-valid", toItemId: "task-valid" },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    // All dangling flows and self-loops should be safely omitted
    expect(layout.edges).toHaveLength(0);
  });
});

describe("Workspace Blueprint - Layout Options & Overrides", () => {
  it("respects custom origin and gap overrides", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Custom Options",
      sections: [
        {
          id: "sec-1",
          title: "Col 1",
          isGroup: false,
          items: [
            { id: "t1", kind: "task", content: "1" },
            { id: "t2", kind: "task", content: "2" },
          ],
        },
        {
          id: "sec-2",
          title: "Col 2",
          isGroup: false,
          items: [{ id: "t3", kind: "task", content: "3" }],
        },
      ],
    };

    const layout = compileBlueprintLayout(blueprint, {
      origin: { x: 100, y: 200 },
      columnGap: 120,
      cardGap: 30,
    });

    const [t1, t2, t3] = layout.nodes;
    expect(t1.position).toEqual({ x: 100, y: 200 });
    expect(t2.position).toEqual({
      x: 100,
      y: 200 + LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.height + 30,
    });

    const expectedCol2X =
      100 + LAYOUT_CONSTANTS.CARD_DIMENSIONS.task.width + 120;
    expect(t3.position).toEqual({ x: expectedCol2X, y: 200 });
    expect(layout.bounds.minX).toBe(100);
    expect(layout.bounds.minY).toBe(200);
  });

  it("handles completely empty blueprint gracefully", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Empty Blueprint",
      sections: [],
    };

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("resolveOptimalHandles pure topological helper", () => {
  it("routes out-bottom -> in-top when target is below source in the same group", () => {
    const handles = resolveOptimalHandles(
      { position: { x: 24, y: 48 }, width: 240, groupId: "group-1" },
      { position: { x: 24, y: 160 }, width: 240, groupId: "group-1" },
    );
    expect(handles).toEqual({
      sourceHandle: "out-bottom",
      targetHandle: "in-top",
    });
  });

  it("routes out-bottom -> in-top when horizontal centers diverge by <= 80px and target is below source", () => {
    const handles = resolveOptimalHandles(
      { position: { x: 100, y: 50 }, width: 240 }, // center: 220
      { position: { x: 140, y: 200 }, width: 200 }, // center: 240, diff: 20 <= 80
    );
    expect(handles).toEqual({
      sourceHandle: "out-bottom",
      targetHandle: "in-top",
    });
  });

  it("routes out -> in when horizontal centers diverge by > 80px even if target is lower", () => {
    const handles = resolveOptimalHandles(
      { position: { x: 100, y: 50 }, width: 240 }, // center: 220
      { position: { x: 400, y: 200 }, width: 200 }, // center: 500, diff: 280 > 80
    );
    expect(handles).toEqual({
      sourceHandle: "out",
      targetHandle: "in",
    });
  });

  it("routes out -> in when target is above source (target.y <= source.y)", () => {
    const handles = resolveOptimalHandles(
      { position: { x: 100, y: 200 }, width: 240, groupId: "g1" },
      { position: { x: 100, y: 50 }, width: 240, groupId: "g1" },
    );
    expect(handles).toEqual({
      sourceHandle: "out",
      targetHandle: "in",
    });
  });

  it("falls back to out -> in when either node info is null or undefined", () => {
    expect(resolveOptimalHandles(null, null)).toEqual({
      sourceHandle: "out",
      targetHandle: "in",
    });
  });
});

describe("Workspace Blueprint - Two-Track Branch Column Layout", () => {
  it("compiles a two-track lane with primary happy path and branch recovery path", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Canary Deployment SOP",
      sections: [
        {
          id: "lane-canary",
          title: "Canary Rollout & Self-Healing",
          isGroup: true,
          items: [
            { id: "step-1", kind: "step", title: "1. Route 5% Traffic" },
            { id: "dec-1", kind: "decision", question: "Error Rate < 0.1%?" },
            { id: "step-2", kind: "step", title: "2. Full Production Rollout" },
            {
              id: "step-rollback-1",
              kind: "step",
              title: "Alert SRE & Isolate",
              branch: true,
            },
            {
              id: "step-rollback-2",
              kind: "step",
              title: "Automated Rollback",
              branch: true,
            },
          ],
        },
      ],
      flows: [
        { fromItemId: "step-1", toItemId: "dec-1" },
        { fromItemId: "dec-1", toItemId: "step-2", label: "Pass" },
        {
          fromItemId: "dec-1",
          toItemId: "step-rollback-1",
          label: "Fail (异常)",
        },
        { fromItemId: "step-rollback-1", toItemId: "step-rollback-2" },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    const nodesById = new Map<string, CompiledLayoutNode>(
      layout.nodes.map((n) => [n.id, n]),
    );

    const group = nodesById.get("lane-canary")!;
    expect(group).toBeDefined();

    const step1 = nodesById.get("step-1")!;
    const dec1 = nodesById.get("dec-1")!;
    const step2 = nodesById.get("step-2")!;
    const rb1 = nodesById.get("step-rollback-1")!;
    const rb2 = nodesById.get("step-rollback-2")!;

    // Primary column items stacked at x = GROUP_PADDING (32)
    expect(step1.position.x).toBe(LAYOUT_CONSTANTS.GROUP_PADDING);
    expect(dec1.position.x).toBe(LAYOUT_CONSTANTS.GROUP_PADDING);
    expect(step2.position.x).toBe(LAYOUT_CONSTANTS.GROUP_PADDING);

    // Primary Y stacking: step1 (52), dec1 (52 + 88 + 40 = 180), step2 (180 + 120 + 40 = 340)
    expect(step1.position.y).toBe(LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE);
    expect(dec1.position.y).toBe(
      LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE +
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.step.height +
        LAYOUT_CONSTANTS.CARD_GAP,
    );
    expect(step2.position.y).toBe(
      dec1.position.y +
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.decision.height +
        LAYOUT_CONSTANTS.CARD_GAP,
    );

    // Primary column width is max(280, 240, 280) = 280
    // Branch column offset is groupPadding + 280 + 40 = 32 + 320 = 352
    const expectedBranchX =
      LAYOUT_CONSTANTS.GROUP_PADDING + 280 + LAYOUT_CONSTANTS.CARD_GAP;
    expect(rb1.position.x).toBe(expectedBranchX);
    expect(rb2.position.x).toBe(expectedBranchX);

    // rb1 is targeted from dec1 (y = 180), so its anchor Y aligns with dec1
    expect(rb1.position.y).toBe(dec1.position.y);
    // rb2 stacks below rb1: 180 + 88 + 40 = 308
    expect(rb2.position.y).toBe(
      rb1.position.y +
        LAYOUT_CONSTANTS.CARD_DIMENSIONS.step.height +
        LAYOUT_CONSTANTS.CARD_GAP,
    );

    // All members must be strictly within the group container
    for (const member of [step1, dec1, step2, rb1, rb2]) {
      expect(isNodeWithinGroup(member, group)).toBe(true);
    }

    // Zero bounding box overlap among all nodes
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        if (a.groupId === b.id || b.groupId === a.id) continue;
        const bA = getNodeAbsoluteBounds(a, nodesById);
        const bB = getNodeAbsoluteBounds(b, nodesById);
        expect(doBoundsOverlap(bA, bB)).toBe(false);
      }
    }

    // Flow handle assertions:
    // dec1 -> step-rollback-1 (lateral branch to right column) routes out -> in
    const failEdge = layout.edges.find(
      (e) => e.sourceNodeId === "dec-1" && e.targetNodeId === "step-rollback-1",
    )!;
    expect(failEdge).toBeDefined();
    expect(failEdge.sourceHandle).toBe("out");
    expect(failEdge.targetHandle).toBe("in");

    // dec1 -> step2 (vertical happy path in primary column) routes out-bottom -> in-top
    const passEdge = layout.edges.find(
      (e) => e.sourceNodeId === "dec-1" && e.targetNodeId === "step-2",
    )!;
    expect(passEdge).toBeDefined();
    expect(passEdge.sourceHandle).toBe("out-bottom");
    expect(passEdge.targetHandle).toBe("in-top");

    // rb1 -> rb2 (vertical flow in branch column) routes out-bottom -> in-top
    const rbEdge = layout.edges.find(
      (e) =>
        e.sourceNodeId === "step-rollback-1" &&
        e.targetNodeId === "step-rollback-2",
    )!;
    expect(rbEdge).toBeDefined();
    expect(rbEdge.sourceHandle).toBe("out-bottom");
    expect(rbEdge.targetHandle).toBe("in-top");
  });

  it("automatically infers branch column from exception flow label without explicit branch flag", () => {
    const blueprint: WorkspaceBlueprint = {
      name: "Auto Inferred Branch SOP",
      sections: [
        {
          id: "lane-1",
          title: "Lane 1",
          isGroup: true,
          items: [
            { id: "s1", kind: "step", title: "Step 1" },
            { id: "d1", kind: "decision", question: "Ok?" },
            { id: "s-pass", kind: "step", title: "Pass Step" },
            { id: "s-err", kind: "step", title: "Error Step" }, // No branch: true, but targeted with "异常"
          ],
        },
      ],
      flows: [
        { fromItemId: "s1", toItemId: "d1" },
        { fromItemId: "d1", toItemId: "s-pass", label: "Pass" },
        { fromItemId: "d1", toItemId: "s-err", label: "异常分支" },
      ],
    };

    const layout = compileBlueprintLayout(blueprint);
    const nodesById = new Map<string, CompiledLayoutNode>(
      layout.nodes.map((n) => [n.id, n]),
    );

    const sPass = nodesById.get("s-pass")!;
    const sErr = nodesById.get("s-err")!;

    expect(sPass.position.x).toBe(LAYOUT_CONSTANTS.GROUP_PADDING);
    expect(sErr.position.x).toBeGreaterThan(
      LAYOUT_CONSTANTS.GROUP_PADDING + 200,
    );

    const errEdge = layout.edges.find(
      (e) => e.sourceNodeId === "d1" && e.targetNodeId === "s-err",
    )!;
    expect(errEdge.sourceHandle).toBe("out");
    expect(errEdge.targetHandle).toBe("in");
  });
});
