import type { BlueprintItemKind } from "../types";

export type MermaidShape =
  | "diamond" // {text} or {{text}}
  | "rect" // [text]
  | "round" // (text)
  | "stadium" // ([text])
  | "circle" // ((text))
  | "subroutine"; // [[text]]

export interface MermaidNodeAst {
  id: string;
  shape: MermaidShape;
  text: string;
  kind: BlueprintItemKind;
  subgraphId?: string;
  meta?: {
    priority?: 1 | 2 | 3 | 4;
    dueDate?: string;
    date?: string;
  };
}

export interface MermaidEdgeAst {
  from: string;
  to: string;
  label?: string;
  fromPort?: "out" | "out-top" | "out-bottom";
  toPort?: "in" | "in-top" | "in-bottom";
}

export interface MermaidSubgraphAst {
  id: string;
  title: string;
  nodeIds: string[];
}

export interface MermaidParsedAst {
  title?: string;
  direction: "LR" | "TD" | "RL" | "BT";
  nodes: Map<string, MermaidNodeAst>;
  edges: MermaidEdgeAst[];
  subgraphs: MermaidSubgraphAst[];
}
