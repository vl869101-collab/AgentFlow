"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, PencilRuler, Rocket, Sparkles } from "lucide-react";

const steps = [
  { number: "01", icon: PencilRuler, title: "Map the work", text: "Start from a trigger and add the actions, logic, and human decisions your process needs." },
  { number: "02", icon: Sparkles, title: "Add intelligence", text: "Give an AI agent the context it needs to classify, transform, and choose the next best step." },
  { number: "03", icon: Rocket, title: "Ship with confidence", text: "Test on real-looking data, inspect each execution, and activate when the path feels right." },
];

export function HowItWorks() {
  return <section id="how-it-works" className="border-b border-white/10 bg-zinc-900/20 px-6 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400">From idea to impact</p><h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">A workflow builder that feels like a thinking partner.</h2></div><div className="flex items-center gap-2 text-sm text-zinc-500"><CheckCircle2 className="h-4 w-4 text-green-400" /> Average time to first live workflow: 11 minutes</div></div><div className="mt-14 grid gap-6 lg:grid-cols-3">{steps.map((step, index) => { const Icon = step.icon; return <motion.div key={step.number} initial={{ opacity: 0, x: index === 0 ? -12 : 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative"><div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 h-full"><div className="flex items-start justify-between"><span className="text-3xl font-semibold tracking-tight text-zinc-700">{step.number}</span><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-zinc-300"><Icon className="h-5 w-5" /></div></div><h3 className="mt-8 text-lg font-medium text-zinc-100">{step.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{step.text}</p></div>{index < steps.length - 1 ? <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-zinc-700 lg:block" /> : null}</motion.div>; })}</div></div></section>;
}
