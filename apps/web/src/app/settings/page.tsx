"use client";

import { useEffect, useState } from "react";
import { CreditCard, Gauge, Mail, Save, Settings2, UsersRound } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Progress } from "@/components/ui/Progress";
import { Select } from "@/components/ui/Select";
import { TabItem, Tabs } from "@/components/ui/Tabs";

const tabs: TabItem[] = [
  { id: "personal", label: "Personal", icon: <UsersRound className="h-3.5 w-3.5" /> },
  { id: "general", label: "General", icon: <Settings2 className="h-3.5 w-3.5" /> },
  { id: "team", label: "Team", icon: <UsersRound className="h-3.5 w-3.5" /> },
  { id: "billing", label: "Billing", icon: <CreditCard className="h-3.5 w-3.5" /> },
  { id: "usage", label: "Usage", icon: <Gauge className="h-3.5 w-3.5" /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("personal");
  const [message, setMessage] = useState("");
  function save() { setMessage("Settings saved"); window.setTimeout(() => setMessage(""), 2200); }
  return <AppLayout><div className="animate-in fade-in duration-300"><div className="flex justify-between"><div><h1 className="text-2xl font-semibold text-zinc-50">Settings</h1><p className="mt-1 text-sm text-zinc-500">Manage your workspace and account preferences</p></div></div><div className="mt-8"><Tabs items={tabs} value={tab} onChange={setTab} /></div><div className="mt-8 max-w-3xl">{tab === "personal" ? <PersonalSettings onSave={save} /> : tab === "general" ? <GeneralSettings onSave={save} /> : tab === "team" ? <TeamSettings onSave={save} /> : tab === "billing" ? <BillingSettings /> : <UsageSettings />}</div>{message ? <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-green-500/20 bg-zinc-900 px-4 py-2.5 text-xs text-green-300 shadow-2xl shadow-black/40"><Save className="h-3.5 w-3.5" />{message}</div> : null}</div></AppLayout>;
}

function PersonalSettings({ onSave }: { onSave: () => void }) {
  const [firstName, setFirstName] = useState("Victor");
  const [lastName, setLastName] = useState("Lima");
  const [email, setEmail] = useState("vl6675116@gmail.com");
  const [theme, setTheme] = useState("dark");
  const [twoFA, setTwoFA] = useState(false);
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("agentflow_user") : null;
      if (raw) {
        const u = JSON.parse(raw);
        const full = (u.name || "Victor Lima").split(" ");
        setFirstName(full[0] || "Victor");
        setLastName(full.slice(1).join(" ") || "Lima");
        if (u.email) setEmail(u.email);
      }
    } catch {}
  }, []);
  const initials = `${firstName[0] || "V"}${lastName[0] || "L"}`.toUpperCase();
  return <div className="space-y-8">
    <div className="flex items-center justify-between border-b border-white/10 pb-6">
      <div><h2 className="text-2xl font-semibold text-white tracking-tight">Personal Settings</h2><p className="mt-1 text-sm text-zinc-500">Profile varies per logged-in user</p></div>
      <div className="flex items-center gap-3">
        <div className="text-right"><p className="text-sm font-semibold text-white">{firstName} {lastName}</p><p className="text-xs text-zinc-400">Owner</p></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 to-blue-500 text-xs font-bold text-white">{initials}</span>
      </div>
    </div>
    <div><h3 className="text-base font-semibold text-white">Basic Information</h3><div className="mt-4 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2"><label className="block"><span className="text-xs font-medium text-zinc-300">First Name <span className="text-violet-500">*</span></span><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-[#1c1c1f] px-3 text-sm text-zinc-100 outline-none focus:border-violet-500" /></label><label className="block"><span className="text-xs font-medium text-zinc-300">Last Name <span className="text-violet-500">*</span></span><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-[#1c1c1f] px-3 text-sm text-zinc-100 outline-none focus:border-violet-500" /></label></div><label className="mt-4 block max-w-md"><span className="text-xs font-medium text-zinc-300">Email <span className="text-violet-500">*</span></span><input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-[#1c1c1f] px-3 text-sm text-zinc-100 outline-none focus:border-violet-500" /></label></div>
    <div><h3 className="text-base font-semibold text-white">Security</h3><div className="mt-4 space-y-5"><div><p className="text-sm font-medium text-zinc-200">Password</p><button type="button" className="mt-1 text-sm font-medium text-violet-500 hover:text-violet-400">Change password</button></div><div><p className="text-sm font-medium text-zinc-200">Two-factor authentication (2FA)</p><p className="mt-1 text-xs text-zinc-400">Two-factor authentication is currently {twoFA ? "enabled." : "disabled."} <a className="font-medium text-violet-500 hover:underline">Learn more</a></p><button type="button" onClick={() => setTwoFA((v) => !v)} className="mt-3 inline-flex items-center rounded-md border border-white/10 bg-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700">{twoFA ? "Disable 2FA" : "Enable 2FA"}</button></div></div></div>
    <div><h3 className="text-base font-semibold text-white">Personalisation</h3><label className="mt-4 block max-w-md"><span className="text-xs font-medium text-zinc-300">Theme</span><select value={theme} onChange={(e) => setTheme(e.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-white/10 bg-[#1c1c1f] px-3 text-sm text-zinc-200 outline-none focus:border-violet-500"><option value="dark">Dark theme</option><option value="light">Light theme</option><option value="system">System</option></select></label></div>
    <div className="flex items-center gap-3 pt-2"><Button onClick={() => { try { localStorage.setItem("agentflow_user", JSON.stringify({ name: `${firstName} ${lastName}`.trim(), email })); } catch {} onSave(); }} className="bg-violet-500 hover:bg-violet-600 text-white rounded-md px-5 py-2 text-sm font-semibold">Save</Button><span className="text-xs text-zinc-600">Version 2.36.5</span></div>
  </div>;
}

function GeneralSettings({ onSave }: { onSave: () => void }) {
  return <Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div><h2 className="text-lg font-medium text-zinc-100">Workspace profile</h2><p className="mt-1 text-sm text-zinc-500">The identity your team sees across AgentFlow.</p></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Input label="Workspace name" defaultValue="Northstar Labs" /><Input label="Workspace slug" defaultValue="northstar-labs" /><Select label="Default timezone" defaultValue="America/Sao_Paulo" options={[{ value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" }, { value: "America/New_York", label: "New York (GMT-4)" }, { value: "Europe/London", label: "London (GMT+1)" }, { value: "UTC", label: "UTC" }]} /><Select label="Default execution mode" defaultValue="safe" options={[{ value: "safe", label: "Safe — confirm external writes" }, { value: "live", label: "Live — run immediately" }]} /></div><div className="mt-6 border-t border-white/10 pt-6"><h3 className="text-sm font-medium text-zinc-200">Notifications</h3><div className="mt-4 space-y-4"><ToggleRow title="Execution failures" description="Email workspace admins when a workflow fails." defaultChecked /><ToggleRow title="Approval requests" description="Send a digest when human decisions are waiting." defaultChecked /><ToggleRow title="Weekly summary" description="Receive a Monday summary of workspace activity." /></div></div><div className="mt-6 flex justify-end"><Button onClick={onSave} className="bg-violet-500 hover:bg-violet-600 text-white rounded-md px-4 py-2 text-sm font-medium"><Save className="h-3.5 w-3.5" /> Save changes</Button></div></Card>;
}

function TeamSettings({ onSave }: { onSave: () => void }) {
  return <div className="space-y-6"><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div className="flex items-start justify-between"><div><h2 className="text-lg font-medium text-zinc-100">Team members</h2><p className="mt-1 text-sm text-zinc-500">8 of 15 seats are assigned.</p></div><Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-white rounded-md px-4 py-2 text-sm font-medium">Invite member</Button></div><div className="mt-6 divide-y divide-white/10">{[{ name: "Victor Silva", email: "victor@northstar.dev", role: "Owner", initials: "VS" }, { name: "Maya Chen", email: "maya@northstar.dev", role: "Admin", initials: "MC" }, { name: "Jules Martin", email: "jules@northstar.dev", role: "Member", initials: "JM" }, { name: "Priya Shah", email: "priya@northstar.dev", role: "Viewer", initials: "PS" }].map((member) => <div key={member.email} className="flex items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-zinc-300">{member.initials}</span><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-200">{member.name}</p><p className="truncate text-xs text-zinc-600">{member.email}</p></div></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-500">{member.role}</span></div>)}</div></Card><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><h2 className="text-lg font-medium text-zinc-100">Invite defaults</h2><p className="mt-1 text-sm text-zinc-500">Choose the permission new teammates receive.</p><div className="mt-5 max-w-xs"><Select label="Default role" defaultValue="MEMBER" options={[{ value: "MEMBER", label: "Member — can build and run" }, { value: "VIEWER", label: "Viewer — read only" }]} /></div><div className="mt-6 flex justify-end"><Button onClick={onSave} className="bg-violet-500 hover:bg-violet-600 text-white rounded-md px-4 py-2 text-sm font-medium"><Save className="h-3.5 w-3.5" /> Save team settings</Button></div></Card></div>;
}

function BillingSettings() {
  return <div className="space-y-6"><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-500">Pro plan</span><h2 className="mt-4 text-2xl font-semibold text-zinc-50">$39 <span className="text-sm font-normal text-zinc-500">/ user / month</span></h2><p className="mt-2 text-sm text-zinc-500">Your next invoice is Sep 01, 2026.</p></div><Button variant="secondary" className="bg-violet-500 hover:bg-violet-600 text-white rounded-md px-4 py-2 text-sm font-medium">Manage subscription</Button></div><div className="mt-6 border-t border-white/10 pt-5"><Progress value={71} label="Monthly execution usage" helper="7,120 of 10,000" /></div></Card><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-zinc-400" /><h2 className="text-lg font-medium text-zinc-100">Payment method</h2></div><div className="mt-5 flex items-center justify-between rounded-lg border border-white/10 bg-zinc-950/60 p-4"><div className="flex items-center gap-3"><span className="rounded bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-400">VISA</span><div><p className="text-sm text-zinc-200">•••• 4242</p><p className="text-xs text-zinc-600">Expires 08/28</p></div></div><button type="button" className="text-xs text-violet-500 hover:text-violet-600">Update</button></div></Card></div>;
}

function UsageSettings() {
  return <div className="space-y-6"><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div className="flex items-start justify-between"><div><h2 className="text-lg font-medium text-zinc-100">Usage overview</h2><p className="mt-1 text-sm text-zinc-500">A clear view of what your workspace is consuming.</p></div><Gauge className="h-5 w-5 text-violet-500" /></div><div className="mt-7 space-y-6"><Progress value={71} label="Executions" helper="7,120 / 10,000" /><Progress value={53} label="AI tokens" helper="5.3M / 10M" /><Progress value={34} label="Storage" helper="3.4 GB / 10 GB" /></div></Card><Card className="bg-zinc-900 border border-white/10 rounded-lg p-5"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-zinc-400" /><h2 className="text-lg font-medium text-zinc-100">Usage alerts</h2></div><p className="mt-1 text-sm text-zinc-500">Get a heads-up before limits affect your flows.</p><div className="mt-5 max-w-xs"><Select label="Alert threshold" defaultValue="80" options={[{ value: "70", label: "70% of allowance" }, { value: "80", label: "80% of allowance" }, { value: "90", label: "90% of allowance" }]} /></div></Card></div>;
}

function ToggleRow({ title, description, defaultChecked = false }: { title: string; description: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return <div className="flex items-center justify-between gap-4"><div><p className="text-sm text-zinc-300">{title}</p><p className="mt-1 text-xs text-zinc-600">{description}</p></div><button type="button" role="switch" aria-checked={checked} onClick={() => setChecked((value) => !value)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-violet-500" : "bg-zinc-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "left-6" : "left-1"}`} /></button></div>;
}
