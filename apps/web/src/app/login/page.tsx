"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Github } from "lucide-react";
import { loginSchema } from "@agentflow/shared";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse(form);
    setMessage(parsed.success ? "Demo sign-in accepted — welcome back." : "Enter a valid email and password to continue.");
  }

  return <AuthShell title="Welcome back" description="Sign in to continue building workflows that move your business forward." footer={<>New to AgentFlow? <Link href="/register" className="font-medium text-violet-300 hover:text-violet-200">Create an account</Link></>}><form onSubmit={submit} className="space-y-5"><Input label="Work email" name="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /><div className="space-y-2"><div className="flex items-center justify-between"><label htmlFor="password" className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Password</label><Link href="/forgot-password" className="text-xs text-violet-300 hover:text-violet-200">Forgot password?</Link></div><div className="relative"><Input id="password" name="password" type={passwordVisible ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="pr-10" autoComplete="current-password" required /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300" aria-label={passwordVisible ? "Hide password" : "Show password"}>{passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>{message ? <p role="status" className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-xs text-green-400">{message}</p> : null}<Button type="submit" className="w-full">Sign in <ArrowRight className="h-4 w-4" /></Button><div className="relative py-1"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div><div className="relative flex justify-center"><span className="bg-zinc-900 px-3 text-xs text-zinc-600">or continue with</span></div></div><button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"><Github className="h-4 w-4" /> GitHub</button></form></AuthShell>;
}
