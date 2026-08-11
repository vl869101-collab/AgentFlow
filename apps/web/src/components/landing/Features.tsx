"use client";

import { motion } from "framer-motion";
import { Bot, GitBranch, LockKeyhole, PlugZap, Radio, UsersRound } from "lucide-react";

const features = [
  { icon: GitBranch, title: "Visual by default", description: "Compose multi-step automations on a canvas that makes every decision and dependency obvious.", color: "text-violet-300 bg-violet-500/10" },
  { icon: Bot, title: "AI that takes action", description: "Add reasoning where rules stop working, with prompts, context, and outputs you can inspect.", color: "text-purple-300 bg-purple-500/10" },
  { icon: UsersRound, title: "Human-in-the-loop", description: "Pause for approval at the moments that matter, then resume without losing context.", color: "text-red-300 bg-red-500/10" },
  { icon: PlugZap, title: "Connect your stack", description: "Wire up APIs, email, chat, spreadsheets, and internal tools from one consistent interface.", color: "text-cyan-300 bg-cyan-500/10" },
  { icon: Radio, title: "See every execution", description: "Trace inputs, outputs, timing, and errors so your workflows stay trustworthy in production.", color: "text-green-300 bg-green-500/10" },
  { icon: LockKeyhole, title: "Built for teams", description: "Keep credentials scoped, approvals accountable, and collaboration fast as your team grows.", color: "text-amber-300 bg-amber-500/10" },
];

export function Features() {
  return <section id="features" className="border-b border-white/10 bg-zinc-950 px-6 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400">One calm surface</p><h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">The clarity your automations have been missing.</h2><p className="mt-4 text-base leading-7 text-zinc-500">AgentFlow turns scattered scripts and fragile handoffs into a system your entire team can understand.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map((feature, index) => { const Icon = feature.icon; return <motion.div key={feature.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.35, delay: index * 0.04 }} className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 transition-all duration-200 hover:scale-[1.02] hover:border-white/20"><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${feature.color}`}><Icon className="h-5 w-5" /></div><h3 className="mt-5 text-lg font-medium text-zinc-100">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{feature.description}</p></motion.div>; })}</div></div></section>;
}
