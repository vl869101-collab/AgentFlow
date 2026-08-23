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

  const fieldClass = "rounded-md border-white/10 bg-white/5 focus:border-violet-500 focus:ring-0";

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Credentials</h1>
            <p className="mt-1 text-sm text-zinc-500">API keys and service connections used by your workflows</p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="bg-none bg-violet-500 hover:bg-violet-600 hover:opacity-100 text-white rounded-md px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add credential
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="bg-zinc-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500"><LockKeyhole className="h-4 w-4" /></div>
              <div><p className="text-sm font-medium text-zinc-200">Encrypted at rest</p><p className="text-xs text-zinc-500">AES-256 vault</p></div>
            </div>
          </Card>
          <Card className="bg-zinc-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2 text-violet-500"><ShieldCheck className="h-4 w-4" /></div>
              <div><p className="text-sm font-medium text-zinc-200">Scoped access</p><p className="text-xs text-zinc-500">Per workflow</p></div>
            </div>
          </Card>
          <Card className="bg-zinc-900 border border-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/5 p-2 text-zinc-300"><KeyRound className="h-4 w-4" /></div>
              <div><p className="text-sm font-medium text-zinc-200">{creds.length} active keys</p><p className="text-xs text-zinc-500">No expiring tokens</p></div>
            </div>
          </Card>
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg border border-white/5 bg-white/5" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {creds.map((cred, index) => (
                  <motion.div key={cred.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ delay: index * 0.04 }}>
                    <div className="group flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 transition-colors hover:border-white/20">
                      <div className="rounded-lg bg-violet-500/10 p-2 text-violet-500"><KeyRound className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-50">{cred.name}</p>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{cred.provider} · {cred.type} · {cred.updatedAt}</p>
                      </div>
                      <span className="hidden max-w-40 truncate font-mono text-xs text-zinc-500 sm:block">{visible.includes(cred.id) ? cred.data : "••••••••"}</span>
                      <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button onClick={() => toggleVisible(cred.id)} className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100" aria-label={visible.includes(cred.id) ? "Hide" : "Reveal"}>
                          {visible.includes(cred.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => deleteCredential(cred.id)} className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {creds.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-12 text-center">
                  <p className="text-sm text-zinc-400">No credentials yet</p>
                  <p className="mt-1 text-xs text-zinc-600">Add one to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add credential" className="rounded-lg bg-zinc-900">
        <form onSubmit={addCredential} className="space-y-4">
          <Input label="Name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Discord Bot Token" required className={fieldClass} />
          <Select label="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={fieldClass} options={[
            { value: "Discord", label: "Discord" },
            { value: "Google Sheets", label: "Google Sheets" },
            { value: "Slack", label: "Slack" },
            { value: "GitHub", label: "GitHub" },
            { value: "Custom API", label: "Custom API" },
          ]} />
          <Input label="Value" name="value" type="password" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Paste your API key or token" required className={fieldClass} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-md">Cancel</Button>
            <Button type="submit" className="bg-none bg-violet-500 hover:bg-violet-600 hover:opacity-100 text-white rounded-md px-4 py-2 text-sm font-medium">Save credential</Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
