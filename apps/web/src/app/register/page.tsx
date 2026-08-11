"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { signupSchema } from "@agentflow/shared";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", terms: false });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ name: form.name, email: form.email, password: form.password });
    if (!parsed.success || form.password !== form.confirm || !form.terms) { setMessage("Check your details, matching passwords, and terms consent."); return; }
    setMessage("Workspace created — your Pro trial is ready.");
  }
  return <AuthShell title="Create your workspace" description="Bring your team’s most important work into one clear, intelligent system." footer={<>Already have an account? <Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">Sign in</Link></>}><form onSubmit={submit} className="space-y-4"><Input label="Full name" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required /><Input label="Work email" name="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /><div className="space-y-2"><label htmlFor="register-password" className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Password</label><div className="relative"><Input id="register-password" name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} hint="At least 8 characters" className="pr-10" autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div><Input label="Confirm password" name="confirm" type={showPassword ? "text" : "password"} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} autoComplete="new-password" required /><label className="flex items-start gap-2.5 pt-1 text-xs leading-5 text-zinc-500"><input type="checkbox" checked={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-white/10 bg-zinc-900 accent-violet-500" />I agree to the <a href="#terms" className="text-violet-300 hover:text-violet-200">Terms of Service</a> and <a href="#privacy" className="text-violet-300 hover:text-violet-200">Privacy Policy</a>.</label>{message ? <p role="status" className={message.startsWith("Workspace") ? "rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-xs text-green-400" : "rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400"}>{message}</p> : null}<Button type="submit" className="mt-2 w-full">Create workspace <ArrowRight className="h-4 w-4" /></Button><div className="flex items-center gap-2 text-xs text-zinc-600"><Check className="h-3.5 w-3.5 text-green-400" /> Your 14-day Pro trial starts immediately.</div></form></AuthShell>;
}
