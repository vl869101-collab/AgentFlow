import type { WorkflowCanvasNode } from "./workflow";

export interface CanvasSnapshot {
  nodes: WorkflowCanvasNode[];
  edges: any[];
}

export interface WorkflowHistoryState {
  past: CanvasSnapshot[];
  future: CanvasSnapshot[];
}

export const MAX_WORKFLOW_HISTORY = 50;

/**
 * Initializes a blank undo/redo history state.
 */
export function createWorkflowHistory(): WorkflowHistoryState {
  return {
    past: [],
    future: [],
  };
}

/**
 * Deep clones a canvas snapshot so mutating live node or edge objects
 * does not compromise stored historical snapshots.
 */
export function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(snapshot);
    } catch {
      // Fallback if non-cloneable reference exists
    }
  }
  return JSON.parse(JSON.stringify(snapshot));
}

/**
 * Checks if undo is available in the current history state.
 */
export function canUndo(history: WorkflowHistoryState): boolean {
  return history.past.length > 0;
}

/**
 * Checks if redo is available in the current history state.
 */
export function canRedo(history: WorkflowHistoryState): boolean {
  return history.future.length > 0;
}

/**
 * Pushes the current pre-mutation snapshot to the `past` stack,
 * clears the `future` stack (branch invalidation on new action),
 * and caps the stack depth to prevent browser memory bloat.
 */
export function pushSnapshot(
  history: WorkflowHistoryState,
  currentSnapshot: CanvasSnapshot,
  maxLimit: number = MAX_WORKFLOW_HISTORY
): WorkflowHistoryState {
  const cloned = cloneSnapshot(currentSnapshot);
  const newPast = [...history.past, cloned];
  const trimmedPast =
    newPast.length > maxLimit ? newPast.slice(newPast.length - maxLimit) : newPast;

  return {
    past: trimmedPast,
    future: [],
  };
}

/**
 * Undoes the most recent action by popping the latest snapshot from `past`,
 * pushing the current live snapshot to `future`, and returning the restored state.
 */
export function undoHistory(
  history: WorkflowHistoryState,
  currentSnapshot: CanvasSnapshot,
  maxLimit: number = MAX_WORKFLOW_HISTORY
): { newHistory: WorkflowHistoryState; restored: CanvasSnapshot } | null {
  if (history.past.length === 0) return null;

  const newPast = history.past.slice(0, -1);
  const restored = cloneSnapshot(history.past[history.past.length - 1]);
  const currentCloned = cloneSnapshot(currentSnapshot);

  const newFuture = [...history.future, currentCloned];
  const trimmedFuture =
    newFuture.length > maxLimit ? newFuture.slice(newFuture.length - maxLimit) : newFuture;

  return {
    newHistory: {
      past: newPast,
      future: trimmedFuture,
    },
    restored,
  };
}

/**
 * Redoes the most recently undone action by popping the latest snapshot from `future`,
 * pushing the current live snapshot to `past`, and returning the restored state.
 */
export function redoHistory(
  history: WorkflowHistoryState,
  currentSnapshot: CanvasSnapshot,
  maxLimit: number = MAX_WORKFLOW_HISTORY
): { newHistory: WorkflowHistoryState; restored: CanvasSnapshot } | null {
  if (history.future.length === 0) return null;

  const newFuture = history.future.slice(0, -1);
  const restored = cloneSnapshot(history.future[history.future.length - 1]);
  const currentCloned = cloneSnapshot(currentSnapshot);

  const newPast = [...history.past, currentCloned];
  const trimmedPast =
    newPast.length > maxLimit ? newPast.slice(newPast.length - maxLimit) : newPast;

  return {
    newHistory: {
      past: trimmedPast,
      future: newFuture,
    },
    restored,
  };
}

/**
 * Detects if a DOM element or event target is an active input/form field
 * where standard text editing undo/redo should take precedence.
 */
export function isEditableElement(element: any): boolean {
  if (!element || typeof element !== "object") return false;

  if (element.isContentEditable) return true;

  const tagName = element.tagName ? String(element.tagName).toUpperCase() : "";
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  if (typeof element.closest === "function") {
    try {
      if (element.closest("input, textarea, select, [contenteditable='true']")) {
        return true;
      }
    } catch {
      // Safe ignore
    }
  }

  return false;
}
