"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

const plans = [
  { name: "Starter", price: "$0", detail: "For curious builders", description: "Everything you need to automate your first process.", features: ["1 workflow", "100 executions / month", "Webhook, HTTP and email integrations", "Workflow templates", "Community support"], featured: false },
  { name: "Basic", price: "$9", detail: "Per month", description: "A practical step up for dependable personal automation.", features: ["3 workflows", "500 executions / month", "Core integrations", "Workflow templates", "Email support"], featured: false },
  { name: "Growth", price: "$19", detail: "Per month", description: "More capacity for growing automation workloads.", features: ["10 workflows", "2,000 executions / month", "Advanced integrations", "Execution history", "Priority support"], featured: false },
  { name: "Pro", price: "$39", detail: "Per user / month", description: "For teams building a reliable automation layer.", features: ["Unlimited executions / month", "Unlimited workflows", "All integrations", "AI agents + approvals", "Execution replay", "Advanced analytics", "Priority support"], featured: true },
];

export function Pricing() {
  return <section id="pricing" className="border-b border-white/10 bg-zinc-950 px-6 py-20 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><div className="mx-auto max-w-2xl text-center"><p className="text-xs font-medium uppercase tracking-[0.2em] text-fuchsia-400">Simple, honest pricing</p><h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Start small. Scale when the work does.</h2><p className="mt-4 text-base leading-7 text-zinc-500">Bring your first workflow to life today. Upgrade when the team is ready.</p></div><div className="mt-12 grid gap-4 lg:grid-cols-3">{plans.map((plan) => <div key={plan.name} className={`relative bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 ${plan.featured ? "border-violet-400/40 shadow-2xl shadow-violet-950/30" : ""}`}>{plan.featured ? <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Most popular</span> : null}<div className="flex items-start justify-between"><div><h3 className="text-lg font-medium text-zinc-100">{plan.name}</h3><p className="mt-1 text-xs text-zinc-600">{plan.detail}</p></div><span className="text-2xl font-semibold text-zinc-50">{plan.price}</span></div><p className="mt-5 min-h-12 text-sm leading-6 text-zinc-500">{plan.description}</p><Link href="/register" className="mt-6 block"><Button variant={plan.featured ? "primary" : "secondary"} className="w-full">{plan.name === "Scale" ? "Talk to sales" : "Get started"}</Button></Link><div className="mt-6 space-y-3 border-t border-white/10 pt-6">{plan.features.map((feature) => <div key={feature} className="flex items-center gap-2 text-sm text-zinc-400"><Check className="h-4 w-4 text-green-400" />{feature}</div>)}</div></div>)}</div></div></section>;
}
