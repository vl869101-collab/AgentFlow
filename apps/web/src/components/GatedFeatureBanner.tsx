import Link from "next/link";
import { ExternalLink, Lock, Shield } from "lucide-react";
export function GatedFeatureBanner({ title="Available on the Enterprise plan", description, learnMoreUrl, showIlustrations=false }: {title?:string; description?:string; learnMoreUrl?:string; showIlustrations?:boolean}){
  return <div className="rounded-xl border border-dashed border-violet-500/20 bg-zinc-950/40 p-16 text-center">
    {showIlustrations && <div className="mx-auto mb-4 flex items-center justify-center gap-2"><div className="rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-zinc-400 shadow-md"><Lock className="h-5 w-5 text-violet-400"/></div><div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-violet-300 shadow-lg scale-110"><Shield className="h-6 w-6 text-violet-400"/></div><div className="rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-zinc-400 shadow-md"><Lock className="h-5 w-5 text-zinc-500"/></div></div>}
    <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
    {description && <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-zinc-400">{description}</p>}
    <div className="mt-6 flex items-center justify-center gap-3">
      {learnMoreUrl && <a href={learnMoreUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white">Learn more <ExternalLink className="h-3 w-3"/></a>}
      <Link href="/billing" className="inline-flex items-center rounded-md bg-violet-600 px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-violet-900/20 hover:bg-violet-500">{title.includes("Upgrade")? "View plans":"See plans"}</Link>
    </div>
  </div>;
}
