"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
export default function AIUsagePage(){
  const [schema,setSchema]=useState(true); const [values,setValues]=useState(true);
  return <AppLayout><div className="max-w-3xl"><h1 className="text-2xl font-semibold text-zinc-50">AI Usage</h1><p className="mt-1 text-sm text-zinc-400">Control what AgentFlow sends when using the AI Assistant and AI Builder</p>
  <div className="mt-6 space-y-3">
    <label className="flex gap-3 rounded-lg border border-white/10 bg-zinc-900/60 p-4 hover:border-white/15 cursor-pointer"><input type="checkbox" checked={schema} onChange={e=>setSchema(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-zinc-800 text-violet-600 accent-violet-600"/><div><p className="text-sm font-semibold text-zinc-100">Send field names and types (schema)</p><p className="mt-1 text-xs text-zinc-400">Allow AgentFlow to send key names and types of your data. This helps AI understand your data structure without sending values.</p></div></label>
    <label className="flex gap-3 rounded-lg border border-white/10 bg-zinc-900/60 p-4 hover:border-white/15 cursor-pointer"><input type="checkbox" checked={values} onChange={e=>setValues(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-white/20 bg-zinc-800 text-violet-600 accent-violet-600"/><div><p className="text-sm font-semibold text-zinc-100">Send actual data values</p><p className="mt-1 text-xs text-zinc-400">Allow AgentFlow to send real values from your executions which may include sensitive data. Turning this off reduces the accuracy of the AI Assistant and disables AI Workflow Builder.</p></div></label>
  </div>
  <p className="mt-6 text-xs text-zinc-500">Privacy Note: Your data is processed securely and is not used to train our models. These settings will help improve AI accuracy and provide context-aware responses. You can learn more <a href="https://docs.n8n.io/build/ways-of-building-workflows/use-the-ai-assistant" target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 hover:underline">here</a>.</p>
  </div></AppLayout>;
}
