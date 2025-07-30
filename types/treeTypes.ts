// treeTypes.ts - Type definitions for tree operations

export interface TreeNode {
  id: number;
  text: string;
  url: string;
  timestamp: string;
  parentId: number | null;
  children: number[];
  deleted?: boolean;
  deletedAt?: string;
  annotations?: Annotation[];
  images?: string[];
}

export interface Annotation {
  text: string;
  timestamp: string;
}

export interface TreeData {
  nodes: TreeNode[];
  currentNodeId: number | null;
  uiOnlyChange?: boolean;
  repaired?: boolean;
  repairs?: any[];
  fromRepair?: boolean;
}

export interface TreeRepairResult {
  nodes: TreeNode[];
  currentNodeId: number | null;
  repaired: boolean;
  repairs: any[];
}
