import {
  compileBlueprintLayout,
  doBoundsOverlap,
  getNodeAbsoluteBounds,
  isNodeWithinGroup,
  LAYOUT_CONSTANTS,
} from "../src/lib/workspace/blueprint/layout";
import {
  WorkspaceBlueprintSchema,
  type CompiledLayoutNode,
  type WorkspaceBlueprint,
} from "../src/lib/workspace/blueprint/types";

/**
 * Benchmark Blueprint: Microservices Progressive Canary Release & Self-Healing SOP
 *
 * Simulates a complex enterprise operations workflow across 3 swimlane stages:
 * - Stage 1: Pre-flight Canary & Compliance Guidelines (Rich Markdown Doc + vertical steps + decision gate)
 * - Stage 2: Rolling Deployment & Two-Track Self-Healing (Happy Path vs Incident Rollback Lane)
 * - Stage 3: Observability Verification & Release Sign-off (Finalization lane)
 */
const sopBlueprint: WorkspaceBlueprint = {
  name: "微服务全链路发布与自愈容灾 SOP 规程",
  color: "#4f46e5",
  sections: [
    {
      id: "sec-stage-1",
      title: "阶段一：前置灰度与合规健康检查",
      isGroup: true,
      color: "#3b82f6",
      items: [
        {
          id: "doc-sop-guidelines",
          kind: "doc",
          title: "SOP-702 金丝雀准入与发布规范",
          content: [
            "# 金丝雀发布准入合规基准",
            "本操作规程约束核心生产集群变更准入：",
            "- [ ] 自动化流水线冒烟测试已通过",
            "- [ ] 变更已在预发环境稳定运行 >= 2小时",
            "- [ ] 监控大盘 P99 延迟处于基线阈值内",
            "",
            "### 流量灰度准则",
            "1. 初批流量注入不超过生产总量的 5%",
            "2. 持续观察窗口至少 5 分钟并收集指标",
            "3. 任何异常告警立即中断流程转入应急处理",
          ].join("\n"),
        },
        {
          id: "step-1",
          kind: "step",
          title: "步骤 1: 流量金丝雀引流验证",
          description: "导入 5% 生产真实用户流量至灰度版本 Pod",
        },
        {
          id: "step-2",
          kind: "step",
          title: "步骤 2: 收集错误率与 P99 延迟指标",
          description: "Prometheus 持续采样 5 分钟监控窗口",
        },
        {
          id: "dec-1",
          kind: "decision",
          question:
            "指标是否满足健康基线阈值？(Error Rate < 0.1% 且 P99 < 200ms)",
          description: "SLO 金丝雀指标合规性门禁",
        },
      ],
    },
    {
      id: "sec-stage-2",
      title: "阶段二：全量滚动发布与自愈容灾双轨流程",
      isGroup: true,
      color: "#10b981",
      items: [
        // Primary Column (Happy Path)
        {
          id: "step-3",
          kind: "step",
          title: "步骤 3: 滚动升级核心集群 Pod 副本",
          description: "MaxUnavailable 设为 10% 逐批替换",
        },
        {
          id: "dec-2",
          kind: "decision",
          question: "K8s 就绪探针是否全部通过且无 CrashLoop？",
          description: "容器健康探针就绪确认",
        },
        {
          id: "step-4",
          kind: "step",
          title: "步骤 4: 切换外部 DNS 生产流量权重至 100%",
          description: "全量生产流量就绪上线完成",
        },
        // Branch Column (Exception / Incident Recovery Lane)
        {
          id: "step-self-heal",
          kind: "step",
          title: "自愈处理: 隔离异常 Pod 并触发报警",
          description: "API 网关摘除异常实例路由",
          branch: true,
        },
        {
          id: "step-rollback",
          kind: "step",
          title: "应急回滚: 一键恢复前序稳定版本镜像",
          description: "ArgoCD 触发镜像快速无损回滚",
          branch: true,
        },
      ],
    },
    {
      id: "sec-stage-3",
      title: "阶段三：全景监控与收尾确认",
      isGroup: true,
      color: "#6366f1",
      items: [
        {
          id: "step-5",
          kind: "step",
          title: "步骤 5: 生产链路健康检查与 SLO 验收",
          description: "持续全链路观测跟踪调用链稳定性",
        },
        {
          id: "step-6",
          kind: "step",
          title: "步骤 6: 归档发布流水线并同步发布通告",
          description: "发布完成并发送钉钉/企微通知",
        },
      ],
    },
  ],
  flows: [
    // 阶段一内纵向流程连线
    { fromItemId: "doc-sop-guidelines", toItemId: "step-1" },
    { fromItemId: "step-1", toItemId: "step-2" },
    { fromItemId: "step-2", toItemId: "dec-1" },

    // 阶段一跨阶段推进至阶段二
    {
      fromItemId: "dec-1",
      toItemId: "step-3",
      label: "Pass (满足基线)",
      fromPort: "out",
    },

    // 阶段二内双轨流转：主干流 vs 容灾流
    { fromItemId: "step-3", toItemId: "dec-2" },
    {
      fromItemId: "dec-2",
      toItemId: "step-4",
      label: "Pass (探针就绪)",
    },
    {
      fromItemId: "dec-2",
      toItemId: "step-self-heal",
      label: "Fail (异常报警)",
    },
    {
      fromItemId: "step-self-heal",
      toItemId: "step-rollback",
    },

    // 阶段二推进至阶段三收尾
    { fromItemId: "step-4", toItemId: "step-5" },
    { fromItemId: "step-5", toItemId: "step-6" },
  ],
};

console.log(
  "===================================================================",
);
console.log(
  "   Workspace AI Builder - SOP Flowchart Layout & Routing Demo     ",
);
console.log(
  "===================================================================\n",
);

// 1. Validate Schema
console.log("[1] Validating Blueprint Schema with Zod...");
const parsed = WorkspaceBlueprintSchema.safeParse(sopBlueprint);
if (!parsed.success) {
  console.error("❌ Schema Validation Failed:", parsed.error);
  process.exit(1);
}
console.log(
  "✅ Schema Validated Successfully! Blueprint Name:",
  parsed.data.name,
);

// 2. Compile Layout
console.log("\n[2] Compiling Deterministic 2D Canvas Layout...");
const layout = compileBlueprintLayout(sopBlueprint);
console.log(
  `✅ Compiled ${layout.nodes.length} nodes, ${layout.edges.length} flow edges.`,
);
console.log(
  `Canvas Bounds: ${layout.bounds.width}px x ${layout.bounds.height}px (x: ${layout.bounds.minX}..${layout.bounds.maxX}, y: ${layout.bounds.minY}..${layout.bounds.maxY})`,
);
console.log(
  `Global Card Gap: ${LAYOUT_CONSTANTS.CARD_GAP}px | Column Gap: ${LAYOUT_CONSTANTS.COLUMN_GAP}px | Group Padding: ${LAYOUT_CONSTANTS.GROUP_PADDING}px\n`,
);

// 3. Inspect Node Hierarchy and Positions
console.log("[3] Node Layout Details:");
const nodesById = new Map<string, CompiledLayoutNode>(
  layout.nodes.map((n) => [n.id, n]),
);

const rows = layout.nodes.map((node) => {
  const abs = getNodeAbsoluteBounds(node, nodesById);
  const isMember = Boolean(node.groupId);
  return {
    ID: node.id,
    Kind: node.kind.toUpperCase(),
    Title: (node.title ?? "").slice(0, 32),
    "Parent Group": node.groupId ?? "(root)",
    "Relative Pos": isMember
      ? `(${node.position.x}, ${node.position.y})`
      : "N/A",
    "Canvas Abs Pos": `(${abs.x}, ${abs.y})`,
    Dimensions: `${node.width} x ${node.height} px`,
  };
});

console.table(rows);

// 4. Inspect Flow Edges
console.log("\n[4] Flow Connections & Handle Resolutions:");
for (const edge of layout.edges) {
  const labelStr = edge.label ? ` [${edge.label}]` : "";
  console.log(
    `  🔗 ${edge.sourceNodeId} (${edge.sourceHandle ?? "default"}) ---> ${edge.targetNodeId} (${edge.targetHandle ?? "default"})${labelStr}`,
  );
}

// 5. Invariant Checks
console.log("\n[5] Verifying Layout & Topological Invariants:");

// Check 5.1: Zero Overlapping Bounding Boxes
let collisionCount = 0;
for (let i = 0; i < layout.nodes.length; i++) {
  for (let j = i + 1; j < layout.nodes.length; j++) {
    const a = layout.nodes[i];
    const b = layout.nodes[j];
    if (a.groupId === b.id || b.groupId === a.id) continue;
    const bA = getNodeAbsoluteBounds(a, nodesById);
    const bB = getNodeAbsoluteBounds(b, nodesById);
    if (doBoundsOverlap(bA, bB)) {
      collisionCount++;
      console.error(`❌ Collision detected between ${a.id} and ${b.id}`);
    }
  }
}
if (collisionCount === 0) {
  console.log(
    "  ✅ Zero Collision: All peer nodes, inner cards, and cross-group elements have 0 overlap.",
  );
} else {
  console.error(
    `❌ Zero Collision Failed: Found ${collisionCount} overlapping nodes!`,
  );
  process.exit(1);
}

// Check 5.2: Strict Group Containment
let containmentPass = true;
for (const node of layout.nodes) {
  if (node.groupId) {
    const parent = nodesById.get(node.groupId)!;
    if (!isNodeWithinGroup(node, parent)) {
      containmentPass = false;
      console.error(`❌ Node ${node.id} exceeds bounds of parent ${parent.id}`);
    }
  }
}
if (containmentPass) {
  console.log(
    `  ✅ Group Containment: All member cards strictly fit within parent bounding boxes (${LAYOUT_CONSTANTS.GROUP_PADDING}px padding, ${LAYOUT_CONSTANTS.GROUP_HEADER_CLEARANCE}px header).`,
  );
} else {
  console.error("❌ Group Containment Failed!");
  process.exit(1);
}

// Check 5.3: Stage 1 Rich Markdown Document Node & Downstream Step Clearance
const docNode = nodesById.get("doc-sop-guidelines")!;
const step1 = nodesById.get("step-1")!;
if (!docNode || !step1) {
  console.error("❌ Stage 1 Doc or Step 1 node missing!");
  process.exit(1);
}
if (docNode.width !== 360) {
  console.error(`❌ DocNode width is ${docNode.width}, expected 360px!`);
  process.exit(1);
}
if (docNode.height < 300) {
  console.error(
    `❌ DocNode height ${docNode.height} underestimated Markdown content!`,
  );
  process.exit(1);
}
const step1Clearance = step1.position.y - (docNode.position.y + docNode.height);
if (step1Clearance < LAYOUT_CONSTANTS.CARD_GAP) {
  console.error(
    `❌ Step 1 clearance below DocNode is ${step1Clearance}px, expected >= ${LAYOUT_CONSTANTS.CARD_GAP}px!`,
  );
  process.exit(1);
}
console.log(
  `  ✅ Stage 1 Doc Decompression: DocNode height is ${docNode.height}px (width 360px), downstream Step 1 pushed down with clearance ${step1Clearance}px (>= ${LAYOUT_CONSTANTS.CARD_GAP}px).`,
);

// Check 5.4: Stage 2 Two-Track Branch Column Geometry & Lateral Handle Resolution
const stage2Group = nodesById.get("sec-stage-2")!;
const dec2 = nodesById.get("dec-2")!;
const step4 = nodesById.get("step-4")!;
const selfHeal = nodesById.get("step-self-heal")!;
const rollback = nodesById.get("step-rollback")!;

if (!stage2Group || !dec2 || !step4 || !selfHeal || !rollback) {
  console.error("❌ Stage 2 two-track nodes missing!");
  process.exit(1);
}

const branchXOffset = selfHeal.position.x - dec2.position.x;
if (branchXOffset < 300) {
  console.error(
    `❌ Branch column offset ${branchXOffset}px is less than 300px!`,
  );
  process.exit(1);
}

const failEdge = layout.edges.find(
  (e) => e.sourceNodeId === "dec-2" && e.targetNodeId === "step-self-heal",
);
if (
  !failEdge ||
  failEdge.sourceHandle !== "out" ||
  failEdge.targetHandle !== "in"
) {
  console.error(
    `❌ Decision branch flow failed handle resolution: ${JSON.stringify(failEdge)} (expected out -> in)`,
  );
  process.exit(1);
}

const passEdge = layout.edges.find(
  (e) => e.sourceNodeId === "dec-2" && e.targetNodeId === "step-4",
);
if (
  !passEdge ||
  passEdge.sourceHandle !== "out-bottom" ||
  passEdge.targetHandle !== "in-top"
) {
  console.error(
    `❌ Decision pass flow failed handle resolution: ${JSON.stringify(passEdge)} (expected out-bottom -> in-top)`,
  );
  process.exit(1);
}

const rbEdge = layout.edges.find(
  (e) =>
    e.sourceNodeId === "step-self-heal" && e.targetNodeId === "step-rollback",
);
if (
  !rbEdge ||
  rbEdge.sourceHandle !== "out-bottom" ||
  rbEdge.targetHandle !== "in-top"
) {
  console.error(
    `❌ Rollback sequential flow failed handle resolution: ${JSON.stringify(rbEdge)} (expected out-bottom -> in-top)`,
  );
  process.exit(1);
}

console.log(
  `  ✅ Stage 2 Two-Track Geometry: Group width expanded to ${stage2Group.width}px, branch offset ${branchXOffset}px, lateral decision handle correctly routed out -> in.`,
);

// Check 5.5: Decision Node Sizing & 2:1 Aspect Ratio
const decNodes = layout.nodes.filter((n) => n.kind === "decision");
for (const dec of decNodes) {
  if (dec.width !== 240 || dec.height !== 120) {
    console.error(
      `❌ Decision Node ${dec.id} has incorrect size: ${dec.width}x${dec.height} (expected 240x120)`,
    );
    process.exit(1);
  }
}
console.log(
  "  ✅ Decision Node Geometry: All decision nodes maintain 240x120px (2:1 golden ratio) geometry.",
);

// Check 5.6: Determinism
const layout2 = compileBlueprintLayout(sopBlueprint);
const isDeterministic = JSON.stringify(layout) === JSON.stringify(layout2);
if (isDeterministic) {
  console.log(
    `  ✅ Deterministic Output: Repeated compilation is 100% identical.`,
  );
} else {
  console.error("❌ Determinism check failed!");
  process.exit(1);
}

console.log(
  "\n✨ All SOP spatial layout, rich markdown doc clearance, and two-track branch checks PASSED flawlessly!\n",
);
