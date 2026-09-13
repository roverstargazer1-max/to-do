import type { BlueprintItemKind } from "../types";
import type {
  MermaidNodeAst,
  MermaidEdgeAst,
  MermaidParsedAst,
  MermaidShape,
  MermaidSubgraphAst,
} from "./types";

/**
 * Regex for identifying all Mermaid flowchart arrows and extracting labels.
 */
const ARROW_PATTERN =
  /(?:-->\|([^|]+)\||--\s*([^-\n]+?)\s*-->|-->|-\.->\|([^|]+)\||-\.\s*([^.\n]+?)\s*\.->|-\.->|==>\|([^|]+)\||==\s*([^=\n]+?)\s*==>|==>|---\|([^|]+)\||--\s*([^-\n]+?)\s*---|---)/;

const GLOBAL_ARROW_REGEX = new RegExp(ARROW_PATTERN.source, "g");

/**
 * Parse a raw node segment (e.g. `A[任务: 写代码]`, `B{是否通过?}`, `C`)
 * into an ID, optional shape, and inner text.
 */
export function parseNodeSegment(rawSegment: string): {
  id: string;
  shape?: MermaidShape;
  text?: string;
} {
  const segment = rawSegment.trim();
  if (!segment) return { id: "" };

  const patterns: Array<{
    shape: MermaidShape;
    open: string;
    close: string;
  }> = [
    { shape: "diamond", open: "{{", close: "}}" },
    { shape: "stadium", open: "([", close: "])" },
    { shape: "subroutine", open: "[[", close: "]]" },
    { shape: "rect", open: "[(", close: ")]" },
    { shape: "circle", open: "((", close: "))" },
    { shape: "rect", open: "[", close: "]" },
    { shape: "diamond", open: "{", close: "}" },
    { shape: "round", open: "(", close: ")" },
  ];

  for (const { shape, open, close } of patterns) {
    const openIndex = segment.indexOf(open);
    if (openIndex > 0 && segment.endsWith(close)) {
      const id = segment.slice(0, openIndex).trim();
      let inner = segment
        .slice(openIndex + open.length, segment.length - close.length)
        .trim();

      // Unwrap quotes if present
      if (
        (inner.startsWith('"') && inner.endsWith('"')) ||
        (inner.startsWith("'") && inner.endsWith("'"))
      ) {
        inner = inner.slice(1, -1).trim();
      }

      return { id, shape, text: inner };
    }
  }

  // Bare node identifier
  const bareId = segment.replace(/["']/g, "").trim();
  return { id: bareId };
}

/**
 * Infer item kind, clean title/content, and metadata from shape and text.
 */
export function inferNodeKindAndData(
  shape: MermaidShape | undefined,
  text: string,
): {
  kind: BlueprintItemKind;
  cleanText: string;
  meta?: {
    priority?: 1 | 2 | 3 | 4;
    dueDate?: string;
    date?: string;
  };
} {
  const trimmed = text.trim();

  // Diamond shape is unconditionally a decision node
  if (shape === "diamond") {
    return { kind: "decision", cleanText: trimmed };
  }

  // Task check: [任务: ...] or [task: ...]
  const taskMatch = trimmed.match(/^(?:任务|task)\s*[:：]\s*(.*)$/i);
  if (taskMatch) {
    let content = taskMatch[1].trim();
    let priority: 1 | 2 | 3 | 4 | undefined;
    let dueDate: string | undefined;

    // Check for priority: P1-P4
    const pMatch = content.match(/[\(\[\s]?[Pp]([1-4])[\)\]]?/);
    if (pMatch) {
      priority = parseInt(pMatch[1], 10) as 1 | 2 | 3 | 4;
      content = content.replace(pMatch[0], "").trim();
    }

    // Check for due date: @2026-09-20 or due: 2026-09-20
    const dueMatch = content.match(
      /(?:@|due[:：]\s*)(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i,
    );
    if (dueMatch) {
      dueDate = dueMatch[1].replace(/\//g, "-");
      content = content.replace(dueMatch[0], "").trim();
    }

    return {
      kind: "task",
      cleanText: content || trimmed,
      meta: { priority, dueDate },
    };
  }

  // Doc check: [文档: ...] or [doc: ...]
  const docMatch = trimmed.match(/^(?:文档|doc)\s*[:：]\s*(.*)$/i);
  if (docMatch) {
    return { kind: "doc", cleanText: docMatch[1].trim() || trimmed };
  }

  // Habit check: [习惯: ...] or [habit: ...]
  const habitMatch = trimmed.match(/^(?:习惯|habit)\s*[:：]\s*(.*)$/i);
  if (habitMatch) {
    return { kind: "habit", cleanText: habitMatch[1].trim() || trimmed };
  }

  // Project check: [项目: ...] or [project: ...]
  const projMatch = trimmed.match(/^(?:项目|project)\s*[:：]\s*(.*)$/i);
  if (projMatch) {
    return { kind: "project", cleanText: projMatch[1].trim() || trimmed };
  }

  // Focus check: [聚焦] or [focus]
  const focusMatch = trimmed.match(/^(?:聚焦|focus)(?:\s*[:：]\s*(.*))?$/i);
  if (focusMatch) {
    return { kind: "focus", cleanText: focusMatch[1]?.trim() || "Focus Timer" };
  }

  // Event check:
  // 1. Explicit prefix: [事件: ...] or [event: ...]
  const eventMatch = trimmed.match(/^(?:事件|event)\s*[:：]\s*(.*)$/i);
  if (eventMatch) {
    const eventText = eventMatch[1].trim();
    const dateMatch = eventText.match(
      /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?|\d{1,2}[-/月]\d{1,2}(?:日)?)/,
    );
    return {
      kind: "event",
      cleanText: eventText,
      meta: { date: dateMatch ? dateMatch[1] : undefined },
    };
  }

  // 2. Shape is round/stadium/circle AND contains date pattern
  const datePatternMatch = trimmed.match(
    /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}(?:日)?|\d{1,2}[-/月]\d{1,2}(?:日)?)/,
  );
  if (
    datePatternMatch &&
    (shape === "round" || shape === "stadium" || shape === "circle")
  ) {
    return {
      kind: "event",
      cleanText: trimmed,
      meta: { date: datePatternMatch[1] },
    };
  }

  // Step check: default
  const stepMatch = trimmed.match(/^(?:步骤|step)\s*[:：]\s*(.*)$/i);
  const cleanStep = stepMatch ? stepMatch[1].trim() : trimmed;

  return { kind: "step", cleanText: cleanStep };
}

/**
 * Infer Decision Node source port from label (e.g. No/驳回 -> out-bottom, Yes/通过 -> out).
 */
export function inferDecisionPort(label?: string): "out" | "out-bottom" {
  if (!label) return "out";
  const normalized = label.trim().toLowerCase();
  const bottomKeywords = [
    "no",
    "否",
    "false",
    "reject",
    "rejected",
    "驳回",
    "拒绝",
    "fail",
    "failed",
    "失败",
    "error",
    "timeout",
    "rework",
    "重试",
    "未通过",
    "不通过",
  ];
  if (bottomKeywords.some((k) => normalized === k || normalized.includes(k))) {
    return "out-bottom";
  }
  return "out";
}

/**
 * Parse raw Mermaid text into a structured AST.
 */
export function parseMermaidFlowchart(rawText: string): MermaidParsedAst {
  const lines = rawText.split(/\r?\n/);
  const nodes = new Map<string, MermaidNodeAst>();
  const edges: MermaidEdgeAst[] = [];
  const subgraphs: MermaidSubgraphAst[] = [];

  let currentDirection: "LR" | "TD" | "RL" | "BT" = "LR";
  let extractedTitle: string | undefined;
  let activeSubgraph: MermaidSubgraphAst | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) continue;

    // Check workspace title comments: %% workspace: My Flowchart
    const wsTitleMatch = line.match(/^%%\s*workspace\s*[:：]\s*(.*)$/i);
    if (wsTitleMatch) {
      extractedTitle = wsTitleMatch[1].trim();
      continue;
    }

    // Ignore other comments
    if (line.startsWith("%%")) continue;

    // Check direction header: graph LR / flowchart TD
    const headerMatch = line.match(/^(?:graph|flowchart)\s+([A-Za-z]{2})/i);
    if (headerMatch) {
      const dir = headerMatch[1].toUpperCase();
      if (dir === "LR" || dir === "TD" || dir === "RL" || dir === "BT") {
        currentDirection = dir;
      }
      continue;
    }

    // Check subgraph start: subgraph Id [Title] / subgraph "Title" / subgraph Id
    const subMatch = line.match(
      /^subgraph\s+(?:([A-Za-z0-9_-]+)\s*\[([^\]]+)\]|["']([^"']+)["']|([A-Za-z0-9_-]+))/i,
    );
    if (subMatch) {
      const subId =
        subMatch[1] || subMatch[4] || `subgraph-${subgraphs.length + 1}`;
      const subTitle = subMatch[2] || subMatch[3] || subMatch[4] || subId;
      activeSubgraph = {
        id: subId,
        title: subTitle,
        nodeIds: [],
      };
      subgraphs.push(activeSubgraph);
      continue;
    }

    // Check subgraph end
    if (line === "end" || line.startsWith("end ")) {
      activeSubgraph = null;
      continue;
    }

    // Ignore styling directives: classDef, style, click, linkStyle
    if (/^(?:classDef|style|click|linkStyle|class)\b/i.test(line)) {
      continue;
    }

    // Register node helper
    const registerNode = (seg: {
      id: string;
      shape?: MermaidShape;
      text?: string;
    }) => {
      if (!seg.id) return;
      if (activeSubgraph && !activeSubgraph.nodeIds.includes(seg.id)) {
        activeSubgraph.nodeIds.push(seg.id);
      }

      const existing = nodes.get(seg.id);
      if (existing) {
        // If existing node was a bare ID and now has shape/text, update it
        if (seg.shape && seg.text) {
          const { kind, cleanText, meta } = inferNodeKindAndData(
            seg.shape,
            seg.text,
          );
          existing.shape = seg.shape;
          existing.text = cleanText;
          existing.kind = kind;
          existing.meta = meta;
        }
        if (activeSubgraph && !existing.subgraphId) {
          existing.subgraphId = activeSubgraph.id;
        }
      } else {
        const text = seg.text ?? seg.id;
        const shape = seg.shape ?? "rect";
        const { kind, cleanText, meta } = inferNodeKindAndData(shape, text);
        nodes.set(seg.id, {
          id: seg.id,
          shape,
          text: cleanText,
          kind,
          subgraphId: activeSubgraph?.id,
          meta,
        });
      }
    };

    // Check if line contains arrow operators
    GLOBAL_ARROW_REGEX.lastIndex = 0;
    const arrowMatches: Array<{
      index: number;
      length: number;
      label?: string;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = GLOBAL_ARROW_REGEX.exec(line)) !== null) {
      const label =
        match[1] ||
        match[2] ||
        match[3] ||
        match[4] ||
        match[5] ||
        match[6] ||
        match[7] ||
        match[8];
      arrowMatches.push({
        index: match.index,
        length: match[0].length,
        label: label?.trim(),
      });
    }

    if (arrowMatches.length > 0) {
      // Split line into node segments by arrow positions
      const segments: string[] = [];
      let lastIndex = 0;

      for (const arr of arrowMatches) {
        segments.push(line.slice(lastIndex, arr.index));
        lastIndex = arr.index + arr.length;
      }
      segments.push(line.slice(lastIndex));

      const parsedSegments = segments.map(parseNodeSegment);
      parsedSegments.forEach(registerNode);

      // Connect sequential segments with edges
      for (let i = 0; i < arrowMatches.length; i++) {
        const fromSeg = parsedSegments[i];
        const toSeg = parsedSegments[i + 1];
        if (!fromSeg.id || !toSeg.id) continue;
        if (fromSeg.id === toSeg.id) continue; // Skip self-loops

        const label = arrowMatches[i].label;
        const fromNode = nodes.get(fromSeg.id);
        const fromPort =
          fromNode?.kind === "decision" ? inferDecisionPort(label) : undefined;

        edges.push({
          from: fromSeg.id,
          to: toSeg.id,
          label,
          fromPort,
        });
      }
    } else {
      // Standalone node declaration (e.g. `A[任务: 准备环境]`)
      const parsed = parseNodeSegment(line);
      registerNode(parsed);
    }
  }

  return {
    title: extractedTitle,
    direction: currentDirection,
    nodes,
    edges,
    subgraphs,
  };
}
