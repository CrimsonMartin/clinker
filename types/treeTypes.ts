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
      tabId?: string;
      /** Page title at the time of saving (set by the content script). */
      title?: string;
      /** Bibliographic metadata for reference export (CSL-JSON shaped). */
      citation?: CitationMetadata;
    }

    interface Annotation {
      text: string;
      timestamp: string;
    }

    /** CSL-JSON name: personal ({family, given}) or corporate ({literal}). */
    interface CslName {
      family?: string;
      given?: string;
      literal?: string;
      suffix?: string;
    }

    /** CSL-JSON date: [[year, month?, day?]] or a free-form literal. */
    interface CslDate {
      'date-parts'?: Array<Array<number>>;
      literal?: string;
    }

    type CslType =
      | 'article' | 'article-journal' | 'article-magazine' | 'article-newspaper'
      | 'book' | 'chapter' | 'paper-conference' | 'report' | 'thesis'
      | 'webpage' | 'post-weblog' | 'dataset' | 'software' | 'manuscript' | 'patent'
      | 'entry-encyclopedia' | 'review' | 'motion_picture' | 'broadcast' | 'speech' | 'document';

    /** Bibliographic metadata for a saved node, modelled on CSL-JSON. */
    interface CitationMetadata {
      type: CslType;
      id?: string;
      title?: string;
      'title-short'?: string;
      author?: CslName[];
      editor?: CslName[];
      issued?: CslDate;
      accessed?: CslDate;
      'container-title'?: string;
      'collection-title'?: string;
      'event-title'?: string;
      volume?: string;
      issue?: string;
      page?: string;
      edition?: string;
      number?: string;
      genre?: string;
      DOI?: string;
      ISBN?: string;
      ISSN?: string;
      PMID?: string;
      PMCID?: string;
      URL?: string;
      publisher?: string;
      'publisher-place'?: string;
      abstract?: string;
      language?: string;
      keyword?: string;
      note?: string;
      /** Where the metadata came from, e.g. "highwire", "json-ld", "doi.org", "manual". */
      source?: string;
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

// ES6 module exports for test compatibility
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
  tabId?: string;
  title?: string;
  citation?: CitationMetadata;
}

export interface Annotation {
  text: string;
  timestamp: string;
}

/** CSL-JSON name: personal ({family, given}) or corporate ({literal}). */
export interface CslName {
  family?: string;
  given?: string;
  literal?: string;
  suffix?: string;
}

/** CSL-JSON date: [[year, month?, day?]] or a free-form literal. */
export interface CslDate {
  'date-parts'?: Array<Array<number>>;
  literal?: string;
}

export type CslType =
  | 'article' | 'article-journal' | 'article-magazine' | 'article-newspaper'
  | 'book' | 'chapter' | 'paper-conference' | 'report' | 'thesis'
  | 'webpage' | 'post-weblog' | 'dataset' | 'software' | 'manuscript' | 'patent'
  | 'entry-encyclopedia' | 'review' | 'motion_picture' | 'broadcast' | 'speech' | 'document';

/** Bibliographic metadata for a saved node, modelled on CSL-JSON. */
export interface CitationMetadata {
  type: CslType;
  id?: string;
  title?: string;
  'title-short'?: string;
  author?: CslName[];
  editor?: CslName[];
  issued?: CslDate;
  accessed?: CslDate;
  'container-title'?: string;
  'collection-title'?: string;
  'event-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  edition?: string;
  number?: string;
  genre?: string;
  DOI?: string;
  ISBN?: string;
  ISSN?: string;
  PMID?: string;
  PMCID?: string;
  URL?: string;
  publisher?: string;
  'publisher-place'?: string;
  abstract?: string;
  language?: string;
  keyword?: string;
  note?: string;
  /** Where the metadata came from, e.g. "highwire", "json-ld", "doi.org", "manual". */
  source?: string;
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
