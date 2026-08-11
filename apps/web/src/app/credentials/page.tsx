"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, LockKeyhole, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { credentials as credApi, type Credential } from "@/lib/api";

export default function CredentialsPage() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "Discord", value: "" });

  useEffect(() => {
    credApi.list().then(setCreds).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function toggleVisible(id: string) {
    setVisible((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
  }

  async function addCredential(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.value.trim()) return;
    try {
      const created = await credApi.create({ name: form.name, provider: form.provider, value: form.value, type: "api_key" });
      setCreds((prev) => [created, ...prev]);
      setForm({ name: "", provider: "Discord", value: "" });
      setOpen(false);
    } catch {}
  }

  async function deleteCredential(id: string) {
    try {
      await credApi.delete(id);
      setCreds((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-amber-400">Secure connections</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-50">Credentials</h1>
            <p className="mt-2 text-sm text-zinc-500">Keep the keys your workflows use encrypted and in one place.</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add credential</Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10 text-green-400"><LockKeyhole className="h-4 w-4" /></div>
            <div><p className="text-sm font-medium text-zinc-200">Encrypted at rest</p><p className="text-xs text-zinc-600">AES-256 vault</p></div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><ShieldCheck className="h-4 w-4" /></div>
            <div><p className="text-sm font-medium text-zinc-200">Scoped access</p><p className="text-xs text-zinc-600">Per workflow</p></div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><KeyRound className="h-4 w-4" /></div>
            <div><p className="text-sm font-medium text-zinc-200">{creds.length} active keys</p><p className="text-xs text-zinc-600">No expiring tokens</p></div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {creds.map((cred, index) => (
              <motion.div key={cred.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: index * 0.04 }}>
                <Card className="group transition-all duration-200 hover:scale-[1.02] hover:border-white/20">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                        <KeyRound className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="font-medium text-zinc-100">{cred.name}</p>
                        <p className="text-xs text-zinc-600">{cred.provider} · {cred.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleVisible(cred.id)} className="rounded-lg p-1.5 text-zinc-600 hover:bg-white/5 hover:text-zinc-300" aria-label={visible.includes(cred.id) ? "Hide" : "Reveal"}>
                        {visible.includes(cred.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => deleteCredential(cred.id)} className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                      <span className="font-mono text-xs text-zinc-600">{visible.includes(cred.id) ? cred.data : "••••••••"}</span>
                      <span className="text-[10px] text-zinc-700">{cred.updatedAt}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
          {creds.length === 0 && !loading && (
            <Card className="col-span-full p-8 text-center text-sm text-zinc-600">No credentials yet. Add one to get started.</Card>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add credential">
        <form onSubmit={addCredential} className="space-y-4">
          <Input label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Discord Bot Token" required />
          <Select label="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} options={[
            { value: "Discord", label: "Discord" },
            { value: "Google Sheets", label: "Google Sheets" },
            { value: "Slack", label: "Slack" },
            { value: "GitHub", label: "GitHub" },
            { value: "Custom API", label: "Custom API" },
          ]} />
          <Input label="Value" name="value" type="password" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Paste your API key or token" required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save credential</Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
