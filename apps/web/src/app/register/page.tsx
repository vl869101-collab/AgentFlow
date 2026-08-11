"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { auth, setToken } from "@/lib/api";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", terms: false });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords don't match."); return; }
    if (!form.terms) { setError("You must accept the terms."); return; }
    setLoading(true);
    try {
      const { token } = await auth.register(form.email, form.password, form.name);
      setToken(token);
      window.location.href = "/dashboard";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      description="Bring your team's most important work into one clear, intelligent system."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-violet-300 hover:text-violet-200">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Full name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required />
        <Input label="Work email" name="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
        <div className="space-y-2">
          <label htmlFor="register-password" className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Password</label>
          <div className="relative">
            <Input
              id="register-password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              hint="At least 8 characters"
              className="pr-10"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Input label="Confirm password" name="confirm" type={showPassword ? "text" : "password"} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
        <label className="flex items-start gap-2.5 pt-1 text-xs leading-5 text-zinc-500">
          <input type="checkbox" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-white/10 bg-zinc-900 accent-violet-500" />
          I agree to the <a href="#terms" className="text-violet-300 hover:text-violet-200">Terms of Service</a> and <a href="#privacy" className="text-violet-300 hover:text-violet-200">Privacy Policy</a>.
        </label>
        {error && <p role="status" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : <>"Create account <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
    </AuthShell>
  );
}
