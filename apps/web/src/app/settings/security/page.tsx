"use client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Shield, EyeOff, Share2 } from "lucide-react";
function Card({title,icon,children,badge}:{title:string;icon:React.ReactNode;children:React.ReactNode;badge?:string}){
  return <div className="rounded-lg border border-white/10 bg-zinc-900 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-zinc-400">{icon}</span><h3 className="text-sm font-semibold text-zinc-100">{title}</h3></div>{badge && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-400">{badge}</span>}</div><div className="mt-4">{children}</div></div>;
}
export default function SecurityPoliciesPage(){
  return <AppLayout><div className="max-w-3xl"><h1 className="text-2xl font-semibold text-zinc-50">Security &amp; policies</h1><p className="mt-1 text-sm text-zinc-400">Enterprise controls for authentication, data handling, and workspace governance.</p>
  <div className="mt-6 space-y-4">
    <Card title="Enforce two-factor authentication" icon={<Shield className="h-4 w-4"/>} badge="Upgrade"><p className="text-xs text-zinc-400">Require all members to enable 2FA before accessing the workspace.</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-zinc-500">Enforce 2FA</span><span className="h-5 w-9 rounded-full bg-zinc-700 opacity-60"/></div></Card>
    <Card title="Data redaction" icon={<EyeOff className="h-4 w-4"/>} badge="Upgrade"><p className="text-xs text-zinc-400">Redact sensitive fields from execution data. Choose scope and track redacted counters.</p><div className="mt-3 flex gap-2"><select className="rounded-md border border-white/10 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300"><option>All executions</option><option>Failed only</option></select><span className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-500">Redacted: 0</span></div></Card>
    <Card title="Personal Space" icon={<Share2 className="h-4 w-4"/>} badge="Upgrade"><p className="text-xs text-zinc-400">Govern workflow publishing and resource sharing between personal and project spaces.</p><div className="mt-3 flex items-center justify-between"><span className="text-xs text-zinc-500">Restrict publishing</span><span className="h-5 w-9 rounded-full bg-zinc-700 opacity-60"/></div></Card>
  </div>
  </div></AppLayout>;
}
