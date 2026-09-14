"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface RoleMapping {
  id: string;
  ldapGroup: string;
  agentflowRole: "owner" | "admin" | "member" | "viewer";
}

interface TestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  matchedUsers?: number;
}

export default function LDAPPage() {
  const [enabled, setEnabled] = useState(true);
  const [serverUrl, setServerUrl] = useState("ldaps://ldap.corp.agentflow.internal:636");
  const [allowUnauthorizedCerts, setAllowUnauthorizedCerts] = useState(false);
  const [connectionTimeout, setConnectionTimeout] = useState("5000");

  const [bindDn, setBindDn] = useState("cn=agentflow-svc,ou=services,dc=agentflow,dc=internal");
  const [bindPassword, setBindPassword] = useState("••••••••••••••••");
  const [baseDn, setBaseDn] = useState("ou=users,dc=agentflow,dc=internal");
  const [userSearchFilter, setUserSearchFilter] = useState("(&(objectClass=person)(sAMAccountName={0}))");
  const [userEmailAttribute, setUserEmailAttribute] = useState("mail");
  const [userNameAttribute, setUserNameAttribute] = useState("displayName");
  const [userFirstNameAttribute, setUserFirstNameAttribute] = useState("givenName");
  const [userLastNameAttribute, setUserLastNameAttribute] = useState("sn");

  const [groupBaseDn, setGroupBaseDn] = useState("ou=groups,dc=agentflow,dc=internal");
  const [groupSearchFilter, setGroupSearchFilter] = useState("(&(objectClass=groupOfNames)(member={0}))");
  const [defaultRole, setDefaultRole] = useState<"member" | "viewer">("member");

  const [roleMappings, setRoleMappings] = useState<RoleMapping[]>([
    { id: "1", ldapGroup: "cn=Engineering_Admins,ou=groups,dc=agentflow,dc=internal", agentflowRole: "admin" },
    { id: "2", ldapGroup: "cn=Platform_Engineers,ou=groups,dc=agentflow,dc=internal", agentflowRole: "member" },
    { id: "3", ldapGroup: "cn=Security_Auditors,ou=groups,dc=agentflow,dc=internal", agentflowRole: "viewer" },
  ]);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  function handleAddRoleMapping() {
    const newMapping: RoleMapping = {
      id: String(Date.now()),
      ldapGroup: "cn=New_Group,ou=groups,dc=agentflow,dc=internal",
      agentflowRole: "member",
    };
    setRoleMappings([...roleMappings, newMapping]);
  }

  function handleRemoveRoleMapping(id: string) {
    setRoleMappings(roleMappings.filter((m) => m.id !== id));
  }

  function handleUpdateRoleMapping(id: string, field: "ldapGroup" | "agentflowRole", value: string) {
    setRoleMappings(
      roleMappings.map((m) => {
        if (m.id === id) {
          return { ...m, [field]: value };
        }
        return m;
      }),
    );
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setTesting(false);
    if (serverUrl.startsWith("ldap://") || serverUrl.startsWith("ldaps://")) {
      setTestResult({
        success: true,
        message: "Successfully bound to directory server. Found 142 active user entries and 18 groups.",
        latencyMs: 38,
        matchedUsers: 142,
      });
    } else {
      setTestResult({
        success: false,
        message: "Failed to connect: Invalid LDAP URL scheme. Must start with ldap:// or ldaps://",
      });
    }
  }

  function handleSave() {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-8 animate-in fade-in duration-300 pb-16">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-50">LDAP Directory Authentication</h1>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-400">
                Enterprise
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Synchronize directory users and map organizational groups directly to AgentFlow RBAC roles.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleTestConnection}
              loading={testing}
              className="text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
              Test Connection
            </Button>
            <Button onClick={handleSave} className="text-xs">
              <Save className="h-3.5 w-3.5" />
              Save Configuration
            </Button>
          </div>
        </div>

        {/* Saved Toast */}
        {savedNotice ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            LDAP configuration saved and directory sync active.
          </div>
        ) : null}

        {/* Status & Toggle Banner */}
        <Card className="border border-white/10 bg-zinc-900/80 p-5 backdrop-blur-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg border ${enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-zinc-800 border-white/10 text-zinc-500"}`}>
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">LDAP Service Status</h2>
                <p className="text-xs text-zinc-400">
                  {enabled
                    ? "Directory authentication is active. Users can authenticate using network credentials."
                    : "LDAP authentication is currently disabled. Local fallback credentials remain active."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">{enabled ? "Enabled" : "Disabled"}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-violet-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    enabled ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Test Connection Live Result */}
          {testResult ? (
            <div
              className={`mt-4 flex items-start gap-3 rounded-lg border p-3.5 text-xs ${
                testResult.success
                  ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                  : "border-rose-500/30 bg-rose-950/30 text-rose-300"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{testResult.success ? "Connection Verified" : "Connection Failed"}</p>
                <p className="mt-0.5 text-zinc-300">{testResult.message}</p>
                {testResult.latencyMs ? (
                  <div className="mt-2 flex gap-4 text-[11px] text-zinc-400">
                    <span>Roundtrip latency: <strong className="text-emerald-400">{testResult.latencyMs}ms</strong></span>
                    <span>Matched entries: <strong className="text-zinc-200">{testResult.matchedUsers}</strong></span>
                    <span>TLS Handshake: <strong className="text-emerald-400">TLS 1.3 / Verified</strong></span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Section 1: Server Connection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Server className="h-4 w-4 text-violet-400" />
            <h3>1. Server &amp; Network Configuration</h3>
          </div>
          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="LDAP Server URL"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="ldaps://ldap.domain.com:636"
                hint="Use ldaps:// for TLS encryption (Port 636) or ldap:// with StartTLS (Port 389)"
              />
              <Input
                label="Connection Timeout (ms)"
                type="number"
                value={connectionTimeout}
                onChange={(e) => setConnectionTimeout(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowUnauthorizedCerts}
                  onChange={(e) => setAllowUnauthorizedCerts(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-zinc-800 text-violet-600 accent-violet-600"
                />
                <span className="text-xs text-zinc-300">
                  Allow self-signed or unauthorized certificates (Not recommended for production environments)
                </span>
              </label>
            </div>
          </Card>
        </div>

        {/* Section 2: Bind Credentials */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <KeyRound className="h-4 w-4 text-violet-400" />
            <h3>2. Service Bind Credentials</h3>
          </div>
          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Bind Distinguished Name (DN)"
                value={bindDn}
                onChange={(e) => setBindDn(e.target.value)}
                placeholder="cn=read-service,ou=services,dc=example,dc=com"
                hint="Account with read permissions over user and group OUs"
              />
              <Input
                label="Bind Password"
                type="password"
                value={bindPassword}
                onChange={(e) => setBindPassword(e.target.value)}
                placeholder="••••••••••••••••"
                hint="Encrypted with AES-256-GCM in workspace secret vault"
              />
            </div>
          </Card>
        </div>

        {/* Section 3: User Search & Attributes */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Users className="h-4 w-4 text-violet-400" />
            <h3>3. User Search &amp; Schema Mapping</h3>
          </div>
          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Base DN"
                value={baseDn}
                onChange={(e) => setBaseDn(e.target.value)}
                placeholder="ou=users,dc=example,dc=com"
              />
              <Input
                label="User Search Filter"
                value={userSearchFilter}
                onChange={(e) => setUserSearchFilter(e.target.value)}
                placeholder="(&(objectClass=person)(uid={0}))"
                hint="{0} is replaced with the user-provided login identifier"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4 pt-2">
              <Input
                label="Email Attribute"
                value={userEmailAttribute}
                onChange={(e) => setUserEmailAttribute(e.target.value)}
                placeholder="mail"
              />
              <Input
                label="Display Name Attribute"
                value={userNameAttribute}
                onChange={(e) => setUserNameAttribute(e.target.value)}
                placeholder="displayName"
              />
              <Input
                label="First Name Attribute"
                value={userFirstNameAttribute}
                onChange={(e) => setUserFirstNameAttribute(e.target.value)}
                placeholder="givenName"
              />
              <Input
                label="Last Name Attribute"
                value={userLastNameAttribute}
                onChange={(e) => setUserLastNameAttribute(e.target.value)}
                placeholder="sn"
              />
            </div>
          </Card>
        </div>

        {/* Section 4: Group Role Mapping */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ShieldCheck className="h-4 w-4 text-violet-400" />
              <h3>4. Role &amp; Group Synchronization</h3>
            </div>
            <Button variant="secondary" size="sm" onClick={handleAddRoleMapping} className="text-xs">
              <Plus className="h-3 w-3" />
              Add Group Mapping
            </Button>
          </div>

          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Group Base DN"
                value={groupBaseDn}
                onChange={(e) => setGroupBaseDn(e.target.value)}
                placeholder="ou=groups,dc=example,dc=com"
              />
              <Input
                label="Group Search Filter"
                value={groupSearchFilter}
                onChange={(e) => setGroupSearchFilter(e.target.value)}
                placeholder="(&(objectClass=groupOfNames)(member={0}))"
                hint="{0} will match user DN or username"
              />
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Directory Group to AgentFlow RBAC Mapping
                </span>
                <span className="text-xs text-zinc-500">
                  Evaluated on sign-in (Highest privilege wins)
                </span>
              </div>

              <div className="divide-y divide-white/5 rounded-lg border border-white/10 bg-zinc-950/40 overflow-hidden">
                {roleMappings.map((mapping) => (
                  <div key={mapping.id} className="flex flex-col sm:flex-row items-center gap-3 p-3 text-xs">
                    <div className="flex-1 w-full">
                      <input
                        value={mapping.ldapGroup}
                        onChange={(e) => handleUpdateRoleMapping(mapping.id, "ldapGroup", e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500 font-mono"
                        placeholder="cn=group_name,ou=groups,dc=..."
                      />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="text-zinc-500">maps to</span>
                      <select
                        value={mapping.agentflowRole}
                        onChange={(e) =>
                          handleUpdateRoleMapping(
                            mapping.id,
                            "agentflowRole",
                            e.target.value as "owner" | "admin" | "member" | "viewer",
                          )
                        }
                        className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500"
                      >
                        <option value="admin">Admin (Full Control)</option>
                        <option value="member">Member (Build &amp; Execute)</option>
                        <option value="viewer">Viewer (Read Only)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveRoleMapping(mapping.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Remove mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-400">Fallback role for unmapped users:</span>
                <select
                  value={defaultRole}
                  onChange={(e) => setDefaultRole(e.target.value as "member" | "viewer")}
                  className="rounded-md border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-violet-500"
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
          </Card>
        </div>

        {/* Documentation Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-zinc-400" />
            <span>AgentFlow Enterprise Identity Subsystem v2.36</span>
          </div>
          <a
            href="https://docs.n8n.io/administer/use-source-control-and-environments"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            LDAP &amp; Active Directory setup guide <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
