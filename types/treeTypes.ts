// treeTypes.ts - Type definitions for tree operations

// Global namespace for Citation Linker types
declare global {
  namespace CitationLinker {
    interface TreeNode {
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

    interface Annotation {
      text: string;
      timestamp: string;
    }

    interface TreeData {
      nodes: TreeNode[];
      currentNodeId: number | null;
      uiOnlyChange?: boolean;
      repaired?: boolean;
      repairs?: any[];
      fromRepair?: boolean;
    }

    interface TreeRepairResult {
      nodes: TreeNode[];
      currentNodeId: number | null;
      repaired: boolean;
      repairs: any[];
    }
  }
}

// This export is needed to make this file a module for TypeScript
export {};
