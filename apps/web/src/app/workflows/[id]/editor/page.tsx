"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addEdge, useEdgesState, useNodesState, type OnConnect } from "@xyflow/react";
import { ArrowLeft, Check, Play, Redo2, Save, Sparkles, Undo2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AIGeneratorModal } from "@/components/workflow/AIGeneratorModal";
import { NodeConfigPanel } from "@/components/workflow/NodeConfigPanel";
import { NodePalette } from "@/components/workflow/NodePalette";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { WorkflowVersionPanel } from "@/components/workflow/WorkflowVersionPanel";
import {
  createCanvasNode,
  detectCycle,
  type NodeTypeKey,
  type WorkflowCanvasNode,
  type WorkflowNodeData,
} from "@/lib/workflow";
import {
  canRedo,
  canUndo,
  createWorkflowHistory,
  isEditableElement,
  pushSnapshot,
  redoHistory,
  undoHistory,
  type WorkflowHistoryState,
} from "@/lib/workflow-history";
import { workflows, executions, type Workflow } from "@/lib/api";

const defaultNodes: WorkflowCanvasNode[] = [];
const defaultEdges: any[] = [];

export default function WorkflowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [history, setHistory] = useState<WorkflowHistoryState>(createWorkflowHistory);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const isDraggingRef = useRef(false);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId]);

  const takeSnapshot = useCallback(() => {
    setHistory((curr) =>
      pushSnapshot(curr, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      })
    );
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      const result = undoHistory(curr, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
      if (!result) return curr;
      setNodes(result.restored.nodes);
      setEdges(result.restored.edges);
      setSaved(false);
      setToast("Alteração desfeita");
      window.setTimeout(() => setToast(""), 1800);
      return result.newHistory;
    });
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      const result = redoHistory(curr, {
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
      if (!result) return curr;
      setNodes(result.restored.nodes);
      setEdges(result.restored.edges);
      setSaved(false);
      setToast("Alteração refeita");
      window.setTimeout(() => setToast(""), 1800);
      return result.newHistory;
    });
  }, [setNodes, setEdges]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target)) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("agentflow_token")) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    workflows.get(workflowId).then((wf) => {
      setWorkflow(wf);
      setName(wf.name);
      setDescription(wf.description);
      if (wf.nodes && Array.isArray(wf.nodes)) {
        setNodes(wf.nodes as WorkflowCanvasNode[]);
      }
      if (wf.edges && Array.isArray(wf.edges)) {
        setEdges(wf.edges);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [workflowId, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const cycleCheck = detectCycle(connection.source, connection.target, edges);
      if (cycleCheck.hasCycle) {
        setToast(
          cycleCheck.reason ||
            "Ciclo detectado: conexões circulares não são permitidas no fluxo."
        );
        window.setTimeout(() => setToast(""), 4000);
        return;
      }
      takeSnapshot();
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "url(#edge-gradient)", strokeWidth: 2 },
          },
          current
        )
      );
      setSaved(false);
    },
    [edges, setEdges, takeSnapshot]
  );

  const handleCreateNode = useCallback((type: NodeTypeKey, position: { x: number; y: number }) => {
    takeSnapshot();
    setNodes((current) => [...current, createCanvasNode(type, position)]);
    setSaved(false);
  }, [setNodes, takeSnapshot]);

  const handleAddFromPalette = useCallback((type: NodeTypeKey) => {
    const index = nodes.length;
    handleCreateNode(type, { x: 160 + (index % 3) * 260, y: 120 + Math.floor(index / 3) * 180 });
  }, [handleCreateNode, nodes.length]);

  function handleNodeChange(id: string, data: Partial<WorkflowNodeData>) {
    takeSnapshot();
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...data, config: data.config ?? node.data.config } } : node));
    setSaved(false);
  }

  function handleDeleteNode(id: string) {
    takeSnapshot();
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(undefined);
    setSaved(false);
  }

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      let shouldSnapshot = false;
      for (const change of changes) {
        if (change.type === "remove") {
          shouldSnapshot = true;
          break;
        } else if (change.type === "position") {
          if (change.dragging && !isDraggingRef.current) {
            shouldSnapshot = true;
            isDraggingRef.current = true;
            break;
          } else if (change.dragging === false) {
            isDraggingRef.current = false;
          }
        }
      }
      if (shouldSnapshot) {
        takeSnapshot();
      }
      onNodesChange(changes);
      setSaved(false);
    },
    [onNodesChange, takeSnapshot]
  );

  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      const hasRemove = changes.some((c) => c.type === "remove");
      if (hasRemove) {
        takeSnapshot();
      }
      onEdgesChange(changes);
      setSaved(false);
    },
    [onEdgesChange, takeSnapshot]
  );

  async function saveWorkflow() {
    setSaving(true);
    try {
      await workflows.update(workflowId, { name, description, nodes: nodes as any, edges: edges as any });
      setSaved(true);
      setToast("Workflow saved");
      window.setTimeout(() => setToast(""), 2200);
    } catch (e: any) {
      setToast("Save failed: " + (e.message || "unknown error"));
      window.setTimeout(() => setToast(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function executeWorkflow() {
    setExecuting(true);
    setToast("Triggering execution...");
    try {
      const exec = await executions.trigger(workflowId);
      if (!exec?.id) {
        setToast("Execution started");
        window.setTimeout(() => setToast(""), 2400);
        return;
      }

      let currentStatus = exec.status || "PENDING";
      setToast(`Execution status: ${currentStatus}...`);

      const streamUrl = executions.getStreamUrl(exec.id);

      const handleNodeUpdate = (nodeId: string, status?: string, duration?: number) => {
        if (!nodeId) return;
        setNodes((current) =>
          current.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    ...(status ? { status: status as any } : {}),
                    ...(duration !== undefined ? { duration } : {}),
                  },
                }
              : n
          )
        );
      };

      const runPollingFallback = async () => {
        const pollInterval = 1000;
        const maxAttempts = 60;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (
            currentStatus === "SUCCESS" ||
            currentStatus === "COMPLETED" ||
            currentStatus === "FAILED" ||
            currentStatus === "CANCELLED"
          ) {
            break;
          }

          await new Promise((resolve) => window.setTimeout(resolve, pollInterval));
          try {
            const latest = await executions.get(exec.id);
            if (latest?.status) {
              currentStatus = latest.status;
              if (currentStatus === "PENDING" || currentStatus === "RUNNING") {
                setToast(`Execution status: ${currentStatus}...`);
              }
            }
            if (latest?.nodes && Array.isArray(latest.nodes)) {
              for (const tn of latest.nodes) {
                if (tn.nodeId) {
                  handleNodeUpdate(tn.nodeId, tn.status, tn.duration);
                }
              }
            }
          } catch {
            // Ignore transient polling errors and continue
          }
        }
      };

      const listenToSSE = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if (typeof window === "undefined" || !window.EventSource) {
            resolve(false);
            return;
          }

          let es: EventSource | null = null;
          let settled = false;

          const cleanup = () => {
            if (es) {
              es.close();
              es = null;
            }
          };

          try {
            es = new EventSource(streamUrl);
          } catch {
            resolve(false);
            return;
          }

          const timeoutId = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanup();
              resolve(false);
            }
          }, 5000);

          es.addEventListener("execution_started", (e) => {
            window.clearTimeout(timeoutId);
            try {
              const data = JSON.parse(e.data);
              currentStatus = data.status || "RUNNING";
              setToast(`Execution status: ${currentStatus}...`);
            } catch {}
          });

          es.addEventListener("node_started", (e) => {
            window.clearTimeout(timeoutId);
            try {
              const data = JSON.parse(e.data);
              if (data?.nodeId) {
                handleNodeUpdate(data.nodeId, data.status || "RUNNING", data.duration);
              }
            } catch {}
          });

          es.addEventListener("node_finished", (e) => {
            window.clearTimeout(timeoutId);
            try {
              const data = JSON.parse(e.data);
              if (data?.nodeId) {
                handleNodeUpdate(data.nodeId, data.status, data.duration);
              }
            } catch {}
          });

          es.addEventListener("execution_finished", (e) => {
            window.clearTimeout(timeoutId);
            try {
              const data = JSON.parse(e.data);
              currentStatus = data.status || "SUCCESS";
            } catch {}
            if (!settled) {
              settled = true;
              cleanup();
              resolve(true);
            }
          });

          es.onerror = () => {
            if (!settled) {
              settled = true;
              cleanup();
              resolve(false);
            }
          };
        });
      };

      const sseReceived = await listenToSSE();
      if (!sseReceived) {
        await runPollingFallback();
      }

      if (currentStatus === "SUCCESS" || currentStatus === "COMPLETED") {
        setToast("Execution completed successfully");
        window.setTimeout(() => setToast(""), 3000);
      } else if (currentStatus === "FAILED") {
        setToast("Execution failed");
        window.setTimeout(() => setToast(""), 3500);
      } else if (currentStatus === "CANCELLED") {
        setToast("Execution cancelled");
        window.setTimeout(() => setToast(""), 3000);
      } else {
        setToast(`Execution ${currentStatus.toLowerCase()} (timed out waiting for completion)`);
        window.setTimeout(() => setToast(""), 3500);
      }
    } catch (e: any) {
      setToast("Execution failed: " + (e.message || "unknown error"));
      window.setTimeout(() => setToast(""), 3000);
    } finally {
      setExecuting(false);
    }
  }

  function generateWorkflow(nextDescription: string) {
    takeSnapshot();
    setDescription(nextDescription);
    setAiOpen(false);
    setSaved(false);
    setToast("AI draft mapped to your canvas");
    window.setTimeout(() => setToast(""), 2400);
  }

  if (!authed) return null;

  return (
    <AppLayout fullWidth>
      <div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/workflows"
              className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white"
              aria-label="Back to workflows"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                  className="w-36 truncate bg-transparent text-sm font-medium text-zinc-100 outline-none sm:w-64"
                  aria-label="Workflow name"
                />
                <Badge status="success">Active</Badge>
                {!saved ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-400"
                    title="Unsaved changes"
                  />
                ) : null}
              </div>
              <p className="hidden max-w-lg truncate text-[11px] text-zinc-600 sm:block">
                {description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/80 p-0.5"
              role="group"
              aria-label="Ações de desfazer e refazer"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={!canUndo(history)}
                aria-label="Desfazer alteração"
                title="Desfazer (Ctrl+Z)"
                className="h-8 w-8 p-0"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                disabled={!canRedo(history)}
                aria-label="Refazer alteração"
                title="Refazer (Ctrl+Y ou Ctrl+Shift+Z)"
                className="h-8 w-8 p-0"
              >
                <Redo2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <WorkflowVersionPanel workflowId={workflowId} workflowName={name} />
            <Button variant="ghost" size="sm" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              <span className="hidden sm:inline">Generate with AI</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={saveWorkflow} loading={saving}>
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
            </Button>
            <Button size="sm" onClick={executeWorkflow} loading={executing}>
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Run</span>
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="hidden h-full lg:flex">
            <NodePalette onAddNode={handleAddFromPalette} />
          </div>
          <div className="min-w-0 flex-1">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onSelectNode={setSelectedId}
              onCreateNode={handleCreateNode}
            />
          </div>
          <div className="hidden h-full xl:flex">
            <NodeConfigPanel
              node={selectedNode}
              onChange={handleNodeChange}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedId(undefined)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/10 bg-zinc-950 p-2 lg:hidden">
          <span className="shrink-0 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
            Quick add
          </span>
          <Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("http")}>
            HTTP
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("condition")}>
            Condition
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("ai_agent")}>
            AI agent
          </Button>
        </div>
        <div className="border-t border-white/10 bg-zinc-950 xl:hidden">
          {selectedNode ? (
            <div className="max-h-[360px] overflow-y-auto">
              <NodeConfigPanel
                node={selectedNode}
                onChange={handleNodeChange}
                onDelete={handleDeleteNode}
                onClose={() => setSelectedId(undefined)}
              />
            </div>
          ) : null}
        </div>
      </div>
      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-green-500/20 bg-zinc-900 px-4 py-2.5 text-xs text-green-300 shadow-2xl shadow-black/40">
          <Check className="h-3.5 w-3.5" />
          {toast}
        </div>
      ) : null}
      <AIGeneratorModal open={aiOpen} onClose={() => setAiOpen(false)} onGenerate={generateWorkflow} />
    </AppLayout>
  );
}
