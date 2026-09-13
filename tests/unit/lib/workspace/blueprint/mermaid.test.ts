import { describe, it, expect } from "vitest";
import {
  compileMermaidToBlueprint,
  parseMermaidFlowchart,
} from "@/lib/workspace/blueprint/mermaid";
import {
  compileBlueprintLayout,
  doBoundsOverlap,
  getNodeAbsoluteBounds,
} from "@/lib/workspace/blueprint/layout";
import { WorkspaceBlueprintSchema } from "@/lib/workspace/blueprint/types";

describe("Mermaid to Blueprint Semantic Transpiler (Ticket 04)", () => {
  it("parses node shapes to their appropriate BlueprintItem kinds", () => {
    const mermaid = `
graph LR
  d1{是否通过审查?}
  d2{{用户是否已登录?}}
  t1[任务: 编写单元测试 P1 @2026-09-20]
  t2[task: 重构领域命令层 P2]
  doc1[文档: 架构设计决策 0021]
  doc2[doc: API 接口规范]
  s1[发送邮件通知]
  s2([流程结束])
  e1(2026-09-25 季度发布会)
  e2[事件: 2026-10-01 国庆放假]
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    const parsedSchema = WorkspaceBlueprintSchema.safeParse(blueprint);
    expect(parsedSchema.success).toBe(true);

    const allItems = blueprint.sections.flatMap((s) => s.items);

    const d1 = allItems.find((i) => i.id === "d1");
    expect(d1?.kind).toBe("decision");
    if (d1?.kind === "decision") {
      expect(d1.question).toBe("是否通过审查?");
    }

    const d2 = allItems.find((i) => i.id === "d2");
    expect(d2?.kind).toBe("decision");
    if (d2?.kind === "decision") {
      expect(d2.question).toBe("用户是否已登录?");
    }

    const t1 = allItems.find((i) => i.id === "t1");
    expect(t1?.kind).toBe("task");
    if (t1?.kind === "task") {
      expect(t1.content).toBe("编写单元测试");
      expect(t1.priority).toBe(1);
      expect(t1.dueDate).toBe("2026-09-20");
    }

    const t2 = allItems.find((i) => i.id === "t2");
    expect(t2?.kind).toBe("task");
    if (t2?.kind === "task") {
      expect(t2.content).toBe("重构领域命令层");
      expect(t2.priority).toBe(2);
    }

    const doc1 = allItems.find((i) => i.id === "doc1");
    expect(doc1?.kind).toBe("doc");
    if (doc1?.kind === "doc") {
      expect(doc1.title).toBe("架构设计决策 0021");
    }

    const s1 = allItems.find((i) => i.id === "s1");
    expect(s1?.kind).toBe("step");
    if (s1?.kind === "step") {
      expect(s1.title).toBe("发送邮件通知");
    }

    const s2 = allItems.find((i) => i.id === "s2");
    expect(s2?.kind).toBe("step");
    if (s2?.kind === "step") {
      expect(s2.title).toBe("流程结束");
    }

    const e1 = allItems.find((i) => i.id === "e1");
    expect(e1?.kind).toBe("event");
    if (e1?.kind === "event") {
      expect(e1.date).toBe("2026-09-25");
    }

    const e2 = allItems.find((i) => i.id === "e2");
    expect(e2?.kind).toBe("event");
    if (e2?.kind === "event") {
      expect(e2.date).toBe("2026-10-01");
    }
  });

  it("extracts arrow labels and infers decision ports accurately", () => {
    const mermaid = `
flowchart LR
  start[用户提交表单] --> check{审核结果?}
  check -->|通过| approve[任务: 激活账户]
  check -- 驳回 --> reject[发送拒绝通知]
  check -. 补充资料 .-> update[step: 补充证明文件]
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    expect(blueprint.flows).toHaveLength(4);

    const approveFlow = blueprint.flows?.find(
      (f) => f.fromItemId === "check" && f.toItemId === "approve",
    );
    expect(approveFlow).toBeDefined();
    expect(approveFlow?.label).toBe("通过");
    expect(approveFlow?.fromPort).toBe("out");

    const rejectFlow = blueprint.flows?.find(
      (f) => f.fromItemId === "check" && f.toItemId === "reject",
    );
    expect(rejectFlow).toBeDefined();
    expect(rejectFlow?.label).toBe("驳回");
    expect(rejectFlow?.fromPort).toBe("out-bottom");

    const updateFlow = blueprint.flows?.find(
      (f) => f.fromItemId === "check" && f.toItemId === "update",
    );
    expect(updateFlow).toBeDefined();
    expect(updateFlow?.label).toBe("补充资料");
  });

  it("parses subgraphs into Group sections with isGroup: true", () => {
    const mermaid = `
graph LR
  subgraph Ingestion [数据接入阶段]
    s1[步骤: 校验源数据格式]
    s2[task: 写入 Kafka 消息队列]
  end

  subgraph Processing [核心处理引擎]
    d1{通过风控规则?}
    s3[任务: 清算入账]
  end

  s2 --> d1
  d1 -->|是| s3
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    expect(blueprint.sections).toHaveLength(2);

    const group1 = blueprint.sections.find((s) => s.id === "Ingestion");
    expect(group1).toBeDefined();
    expect(group1?.title).toBe("数据接入阶段");
    expect(group1?.isGroup).toBe(true);
    expect(group1?.items).toHaveLength(2);
    expect(group1?.items[0].kind).toBe("step");
    expect(group1?.items[1].kind).toBe("task");

    const group2 = blueprint.sections.find((s) => s.id === "Processing");
    expect(group2).toBeDefined();
    expect(group2?.title).toBe("核心处理引擎");
    expect(group2?.isGroup).toBe(true);
    expect(group2?.items).toHaveLength(2);
    expect(group2?.items[0].kind).toBe("decision");
    expect(group2?.items[1].kind).toBe("task");

    expect(blueprint.flows).toHaveLength(2);
  });

  it("handles chained arrow syntax across multiple nodes on a single line", () => {
    const mermaid = `
graph LR
  A[第一步] -->|步骤1-2| B{条件检验} -->|是| C[任务: 执行] --> D[流程完成]
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    const allItems = blueprint.sections.flatMap((s) => s.items);
    expect(allItems).toHaveLength(4);
    expect(blueprint.flows).toHaveLength(3);

    expect(blueprint.flows?.[0]).toEqual(
      expect.objectContaining({
        fromItemId: "A",
        toItemId: "B",
        label: "步骤1-2",
      }),
    );
    expect(blueprint.flows?.[1]).toEqual(
      expect.objectContaining({
        fromItemId: "B",
        toItemId: "C",
        label: "是",
        fromPort: "out",
      }),
    );
    expect(blueprint.flows?.[2]).toEqual(
      expect.objectContaining({
        fromItemId: "C",
        toItemId: "D",
      }),
    );
  });

  it("handles cyclic graphs and rework loops gracefully without infinite recursion", () => {
    const mermaid = `
graph LR
  stepA[编写代码] --> stepB[代码审查]
  stepB --> dec{通过评审?}
  dec -->|是| stepC[发布上线]
  dec -->|否| stepA
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    expect(blueprint.flows).toHaveLength(4);

    const reworkFlow = blueprint.flows?.find(
      (f) => f.fromItemId === "dec" && f.toItemId === "stepA",
    );
    expect(reworkFlow).toBeDefined();
    expect(reworkFlow?.label).toBe("否");
    expect(reworkFlow?.fromPort).toBe("out-bottom");

    // Must compile layout without infinite recursion or crashes
    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(4);
  });

  it("produces collision-free layout for multi-branch synthesized blueprint", () => {
    const mermaid = `
%% workspace: Payment Verification Engine
graph LR
  req[接收支付请求] --> auth{支付凭据有效?}
  auth -->|Yes| pay[任务: 扣款入账]
  auth -->|No| fail[记入失败日志]
  pay --> notify[发送交易回执]
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    expect(blueprint.name).toBe("Payment Verification Engine");

    const layout = compileBlueprintLayout(blueprint);
    expect(layout.nodes).toHaveLength(5);
    expect(layout.edges).toHaveLength(4);

    // Verify zero overlap between all top-level nodes
    const nodesById = new Map(layout.nodes.map((n) => [n.id, n]));
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const bA = getNodeAbsoluteBounds(layout.nodes[i], nodesById);
        const bB = getNodeAbsoluteBounds(layout.nodes[j], nodesById);
        expect(doBoundsOverlap(bA, bB)).toBe(false);
      }
    }
  });

  it("filters out self-loops to satisfy database constraints", () => {
    const mermaid = `
graph LR
  nodeA[初始化服务] --> nodeA
  nodeA --> nodeB[运行中]
`;

    const blueprint = compileMermaidToBlueprint(mermaid);
    expect(blueprint.flows).toHaveLength(1);
    expect(blueprint.flows?.[0].fromItemId).toBe("nodeA");
    expect(blueprint.flows?.[0].toItemId).toBe("nodeB");
  });
});
