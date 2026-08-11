"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addEdge, useEdgesState, useNodesState, type OnConnect } from "@xyflow/react";
import { ArrowLeft, Check, Play, Save, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AIGeneratorModal } from "@/components/workflow/AIGeneratorModal";
import { NodeConfigPanel } from "@/components/workflow/NodeConfigPanel";
import { NodePalette } from "@/components/workflow/NodePalette";
import { WorkflowCanvas } from "@/components/workflow/WorkflowCanvas";
import { createCanvasNode, type NodeTypeKey, type WorkflowCanvasNode, type WorkflowNodeData } from "@/lib/workflow";
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
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId]);

  useEffect(() => {
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

  const onConnect: OnConnect = useCallback((connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true, style: { stroke: "url(#edge-gradient)", strokeWidth: 2 } }, current));
    setSaved(false);
  }, [setEdges]);

  const handleCreateNode = useCallback((type: NodeTypeKey, position: { x: number; y: number }) => {
    setNodes((current) => [...current, createCanvasNode(type, position)]);
    setSaved(false);
  }, [setNodes]);

  const handleAddFromPalette = useCallback((type: NodeTypeKey) => {
    const index = nodes.length;
    handleCreateNode(type, { x: 160 + (index % 3) * 260, y: 120 + Math.floor(index / 3) * 180 });
  }, [handleCreateNode, nodes.length]);

  function handleNodeChange(id: string, data: Partial<WorkflowNodeData>) {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...data, config: data.config ?? node.data.config } } : node));
    setSaved(false);
  }

  function handleDeleteNode(id: string) {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(undefined);
    setSaved(false);
  }

  async function saveWorkflow() {
    setSaving(true);
    try {
      await workflows.update(workflowId, { name, description, nodes: nodes as unknown, edges: edges as unknown });
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
    setToast("Execution started...");
    try {
      await executions.trigger(workflowId);
      setToast("Execution completed successfully");
      window.setTimeout(() => setToast(""), 2400);
    } catch (e: any) {
      setToast("Execution failed: " + (e.message || "unknown error"));
      window.setTimeout(() => setToast(""), 3000);
    } finally {
      setExecuting(false);
    }
  }

  function generateWorkflow(nextDescription: string) {
    setDescription(nextDescription);
    setAiOpen(false);
    setSaved(false);
    setToast("AI draft mapped to your canvas");
    window.setTimeout(() => setToast(""), 2400);
  }

  return <AppLayout fullWidth><div className="flex h-[calc(100vh-4rem)] min-h-[640px] flex-col overflow-hidden"><div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl sm:px-5"><div className="flex min-w-0 items-center gap-3"><Link href="/workflows" className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Back to workflows"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0"><div className="flex items-center gap-2"><input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} className="w-36 truncate bg-transparent text-sm font-medium text-zinc-100 outline-none sm:w-64" aria-label="Workflow name" /><Badge status="success">Active</Badge>{!saved ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" /> : null}</div><p className="hidden max-w-lg truncate text-[11px] text-zinc-600 sm:block">{description}</p></div></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => setAiOpen(true)}><Sparkles className="h-3.5 w-3.5 text-violet-300" /><span className="hidden sm:inline">Generate with AI</span></Button><Button variant="secondary" size="sm" onClick={saveWorkflow} loading={saving}><Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span></Button><Button size="sm" onClick={executeWorkflow} loading={executing}><Play className="h-3.5 w-3.5" /><span className="hidden sm:inline">Run</span></Button></div></div><div className="flex min-h-0 flex-1 overflow-hidden"><div className="hidden h-full lg:flex"><NodePalette onAddNode={handleAddFromPalette} /></div><div className="min-w-0 flex-1"><WorkflowCanvas nodes={nodes} edges={edges} onNodesChange={(changes) => { onNodesChange(changes); setSaved(false); }} onEdgesChange={(changes) => { onEdgesChange(changes); setSaved(false); }} onConnect={onConnect} onSelectNode={setSelectedId} onCreateNode={handleCreateNode} /></div><div className="hidden h-full xl:flex"><NodeConfigPanel node={selectedNode} onChange={handleNodeChange} onDelete={handleDeleteNode} /></div></div><div className="flex items-center gap-2 overflow-x-auto border-t border-white/10 bg-zinc-950 p-2 lg:hidden"><span className="shrink-0 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Quick add</span><Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("http")}>HTTP</Button><Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("condition")}>Condition</Button><Button variant="secondary" size="sm" onClick={() => handleAddFromPalette("ai_agent")}>AI agent</Button></div><div className="border-t border-white/10 bg-zinc-950 xl:hidden">{selectedNode ? <div className="max-h-[360px] overflow-y-auto"><NodeConfigPanel node={selectedNode} onChange={handleNodeChange} onDelete={handleDeleteNode} /></div> : null}</div></div>{toast ? <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-green-500/20 bg-zinc-900 px-4 py-2.5 text-xs text-green-300 shadow-2xl shadow-black/40"><Check className="h-3.5 w-3.5" />{toast}</div> : null}<AIGeneratorModal open={aiOpen} onClose={() => setAiOpen(false)} onGenerate={generateWorkflow} /></AppLayout>;
}
