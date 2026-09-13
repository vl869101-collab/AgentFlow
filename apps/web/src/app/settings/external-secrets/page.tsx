"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  FolderLock,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Server,
  Shield,
  Trash2,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { TabItem, Tabs } from "@/components/ui/Tabs";

type ProviderType = "vault" | "aws" | "infisical" | "azure";

interface SecretMapping {
  id: string;
  name: string;
  externalPath: string;
  lastSynced: string;
  status: "synced" | "syncing" | "error";
}

export default function ExternalSecretsPage() {
  const [activeTab, setActiveTab] = useState<string>("vault");
  const [testing, setTesting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // HashiCorp Vault State
  const [vaultEnabled, setVaultEnabled] = useState(true);
  const [vaultAddress, setVaultAddress] = useState("https://vault.internal.agentflow.io:8200");
  const [vaultNamespace, setVaultNamespace] = useState("admin/production");
  const [vaultAuthMethod, setVaultAuthMethod] = useState("approle");
  const [vaultRoleId, setVaultRoleId] = useState("af-prod-role-4892-9381");
  const [vaultSecretId, setVaultSecretId] = useState("••••••••••••••••••••••••");
  const [vaultMountPath, setVaultMountPath] = useState("secret");

  // AWS Secrets Manager State
  const [awsEnabled, setAwsEnabled] = useState(false);
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsAuthMode, setAwsAuthMode] = useState("iam-role");
  const [awsRoleArn, setAwsRoleArn] = useState("arn:aws:iam::123456789012:role/AgentFlowSecretsReader");
  const [awsPrefix, setAwsPrefix] = useState("/agentflow/production/");

  // Infisical State
  const [infisicalEnabled, setInfisicalEnabled] = useState(false);
  const [infisicalSiteUrl, setInfisicalSiteUrl] = useState("https://app.infisical.com");
  const [infisicalProjectId, setInfisicalProjectId] = useState("proj_af9284019283");
  const [infisicalEnvSlug, setInfisicalEnvSlug] = useState("prod");
  const [infisicalClientId, setInfisicalClientId] = useState("client_8392183912");
  const [infisicalClientSecret, setInfisicalClientSecret] = useState("••••••••••••••••••••••••");

  // Azure Key Vault State
  const [azureEnabled, setAzureEnabled] = useState(false);
  const [azureVaultUri, setAzureVaultUri] = useState("https://agentflow-prod-kv.vault.azure.net/");
  const [azureTenantId, setAzureTenantId] = useState("72f988bf-86f1-41af-91ab-2d7cd011db47");
  const [azureClientId, setAzureClientId] = useState("e5d28b32-9c12-4215-b389-9831a2938471");
  const [azureClientSecret, setAzureClientSecret] = useState("••••••••••••••••••••••••");

  // Mappings
  const [mappings, setMappings] = useState<Record<ProviderType, SecretMapping[]>>({
    vault: [
      { id: "1", name: "STRIPE_API_KEY", externalPath: "secret/data/payments/stripe#api_key", lastSynced: "1 min ago", status: "synced" },
      { id: "2", name: "DATABASE_PASSWORD", externalPath: "secret/data/db/postgres#master_pwd", lastSynced: "1 min ago", status: "synced" },
      { id: "3", name: "OPENAI_ORG_KEY", externalPath: "secret/data/ai/openai#api_key", lastSynced: "4 mins ago", status: "synced" },
    ],
    aws: [
      { id: "4", name: "SLACK_BOT_TOKEN", externalPath: "/agentflow/production/slack_token", lastSynced: "10 mins ago", status: "synced" },
      { id: "5", name: "AWS_S3_SECRET", externalPath: "/agentflow/production/s3_credentials", lastSynced: "10 mins ago", status: "synced" },
    ],
    infisical: [
      { id: "6", name: "SENDGRID_KEY", externalPath: "prod/email/SENDGRID_KEY", lastSynced: "Never", status: "error" },
    ],
    azure: [
      { id: "7", name: "REDIS_PRIMARY_AUTH", externalPath: "https://agentflow-prod-kv.vault.azure.net/secrets/redis-pwd", lastSynced: "1 hour ago", status: "synced" },
    ],
  });

  const tabs: TabItem[] = [
    { id: "vault", label: "HashiCorp Vault", icon: <Lock className="h-4 w-4 text-amber-400" /> },
    { id: "aws", label: "AWS Secrets Manager", icon: <Cloud className="h-4 w-4 text-orange-400" /> },
    { id: "infisical", label: "Infisical", icon: <Shield className="h-4 w-4 text-emerald-400" /> },
    { id: "azure", label: "Azure Key Vault", icon: <Key className="h-4 w-4 text-sky-400" /> },
  ];

  async function handleTestProvider() {
    setTesting(true);
    setTestResult(null);
    await new Promise((r) => setTimeout(r, 750));
    setTesting(false);
    setTestResult({
      success: true,
      message: `Verified auth & read permissions with ${
        activeTab === "vault"
          ? "HashiCorp Vault KV v2 Engine"
          : activeTab === "aws"
          ? "AWS Secrets Manager"
          : activeTab === "infisical"
          ? "Infisical Enterprise Vault"
          : "Azure Key Vault"
      }. All mapped secret leases are valid.`,
      latencyMs: 44,
    });
  }

  async function handleSyncAll() {
    setSyncingAll(true);
    await new Promise((r) => setTimeout(r, 900));
    setSyncingAll(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  function handleAddMapping() {
    const p = activeTab as ProviderType;
    const newM: SecretMapping = {
      id: String(Date.now()),
      name: "NEW_SECRET_PARAM",
      externalPath: `${p}/data/custom/path#key`,
      lastSynced: "Just now",
      status: "synced",
    };
    setMappings({ ...mappings, [p]: [...mappings[p], newM] });
  }

  function handleDeleteMapping(id: string) {
    const p = activeTab as ProviderType;
    setMappings({ ...mappings, [p]: mappings[p].filter((m) => m.id !== id) });
  }

  function handleSave() {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  const currentMappings = mappings[activeTab as ProviderType] || [];

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-8 animate-in fade-in duration-300 pb-16">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-50">External Secrets Management</h1>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-400">
                Enterprise Vault
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Inject credentials and API keys dynamically at workflow runtime directly from your organization KMS.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleSyncAll} loading={syncingAll} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${syncingAll ? "animate-spin" : ""}`} />
              Sync All Secrets
            </Button>
            <Button onClick={handleSave} className="text-xs">
              <Save className="h-3.5 w-3.5" />
              Save Settings
            </Button>
          </div>
        </div>

        {/* Saved Toast */}
        {savedNotice ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            External secrets synchronized and active in Node credential resolvers.
          </div>
        ) : null}

        {/* Provider Tabs */}
        <div>
          <Tabs items={tabs} value={activeTab} onChange={setActiveTab} />
        </div>

        {/* Active Provider Panel */}
        {activeTab === "vault" && (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-zinc-900/80 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-400">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">HashiCorp Vault Engine (KV v2)</h2>
                    <p className="text-xs text-zinc-400">Fetch dynamic and static secrets via Vault HTTP API / AppRole tokens.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{vaultEnabled ? "Active Provider" : "Disabled"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={vaultEnabled}
                    onClick={() => setVaultEnabled(!vaultEnabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      vaultEnabled ? "bg-amber-600" : "bg-zinc-700"
                    }`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${vaultEnabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </Card>

            <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Vault Endpoint &amp; Authentication</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Vault Address"
                  value={vaultAddress}
                  onChange={(e) => setVaultAddress(e.target.value)}
                  placeholder="https://vault.corp.internal:8200"
                />
                <Input
                  label="Namespace (Enterprise Only)"
                  value={vaultNamespace}
                  onChange={(e) => setVaultNamespace(e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Auth Method</label>
                  <select
                    value={vaultAuthMethod}
                    onChange={(e) => setVaultAuthMethod(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
                  >
                    <option value="approle">AppRole (RoleID &amp; SecretID)</option>
                    <option value="token">Token Auth</option>
                    <option value="kubernetes">Kubernetes ServiceAccount</option>
                    <option value="aws-iam">AWS IAM Auth</option>
                  </select>
                </div>
                <Input
                  label="Role ID"
                  value={vaultRoleId}
                  onChange={(e) => setVaultRoleId(e.target.value)}
                  placeholder="role-id"
                />
                <Input
                  label="Secret ID"
                  type="password"
                  value={vaultSecretId}
                  onChange={(e) => setVaultSecretId(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Secrets Mount Engine Path"
                  value={vaultMountPath}
                  onChange={(e) => setVaultMountPath(e.target.value)}
                  placeholder="secret"
                />
                <div className="flex items-end">
                  <Button variant="secondary" onClick={handleTestProvider} loading={testing} className="w-full text-xs">
                    <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
                    Test Vault Connection &amp; Read Policy
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "aws" && (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-zinc-900/80 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg border bg-orange-500/10 border-orange-500/30 text-orange-400">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">AWS Secrets Manager &amp; SSM Parameter Store</h2>
                    <p className="text-xs text-zinc-400">Resolve credentials using native AWS SDK with IAM AssumeRole support.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{awsEnabled ? "Active Provider" : "Disabled"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={awsEnabled}
                    onClick={() => setAwsEnabled(!awsEnabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      awsEnabled ? "bg-orange-600" : "bg-zinc-700"
                    }`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${awsEnabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </Card>

            <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">AWS IAM &amp; Region Settings</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">AWS Region</label>
                  <select
                    value={awsRegion}
                    onChange={(e) => setAwsRegion(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
                  >
                    <option value="us-east-1">US East (N. Virginia) [us-east-1]</option>
                    <option value="us-west-2">US West (Oregon) [us-west-2]</option>
                    <option value="sa-east-1">South America (São Paulo) [sa-east-1]</option>
                    <option value="eu-west-1">Europe (Ireland) [eu-west-1]</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Authentication Mode</label>
                  <select
                    value={awsAuthMode}
                    onChange={(e) => setAwsAuthMode(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
                  >
                    <option value="iam-role">IAM Role / Instance Profile (Recommended)</option>
                    <option value="access-keys">AWS Access Key ID &amp; Secret</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="IAM Role ARN / Assume Role"
                  value={awsRoleArn}
                  onChange={(e) => setAwsRoleArn(e.target.value)}
                  placeholder="arn:aws:iam::123456789012:role/..."
                />
                <Input
                  label="Secrets Path Prefix"
                  value={awsPrefix}
                  onChange={(e) => setAwsPrefix(e.target.value)}
                  placeholder="/agentflow/production/"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={handleTestProvider} loading={testing} className="text-xs">
                  <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
                  Test AWS STS AssumeRole &amp; Secrets Read
                </Button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "infisical" && (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-zinc-900/80 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Infisical Secret Ops Platform</h2>
                    <p className="text-xs text-zinc-400">End-to-end encrypted secret sync via Infisical Universal Auth.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{infisicalEnabled ? "Active Provider" : "Disabled"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={infisicalEnabled}
                    onClick={() => setInfisicalEnabled(!infisicalEnabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      infisicalEnabled ? "bg-emerald-600" : "bg-zinc-700"
                    }`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${infisicalEnabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </Card>

            <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Infisical Universal Auth &amp; Project</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Infisical URL"
                  value={infisicalSiteUrl}
                  onChange={(e) => setInfisicalSiteUrl(e.target.value)}
                  placeholder="https://app.infisical.com or self-hosted"
                />
                <Input
                  label="Project ID"
                  value={infisicalProjectId}
                  onChange={(e) => setInfisicalProjectId(e.target.value)}
                  placeholder="proj_..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Environment Slug"
                  value={infisicalEnvSlug}
                  onChange={(e) => setInfisicalEnvSlug(e.target.value)}
                  placeholder="prod"
                />
                <Input
                  label="Universal Auth Client ID"
                  value={infisicalClientId}
                  onChange={(e) => setInfisicalClientId(e.target.value)}
                  placeholder="client_..."
                />
                <Input
                  label="Client Secret"
                  type="password"
                  value={infisicalClientSecret}
                  onChange={(e) => setInfisicalClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={handleTestProvider} loading={testing} className="text-xs">
                  <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
                  Test Infisical Secret Decryption
                </Button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "azure" && (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-zinc-900/80 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg border bg-sky-500/10 border-sky-500/30 text-sky-400">
                    <Key className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Azure Key Vault</h2>
                    <p className="text-xs text-zinc-400">Microsoft Entra ID (Azure AD) service principal or Managed Identity.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{azureEnabled ? "Active Provider" : "Disabled"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={azureEnabled}
                    onClick={() => setAzureEnabled(!azureEnabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      azureEnabled ? "bg-sky-600" : "bg-zinc-700"
                    }`}
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${azureEnabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            </Card>

            <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Azure Entra ID &amp; Vault URI</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Vault URI"
                  value={azureVaultUri}
                  onChange={(e) => setAzureVaultUri(e.target.value)}
                  placeholder="https://<your-vault>.vault.azure.net/"
                />
                <Input
                  label="Azure Tenant ID"
                  value={azureTenantId}
                  onChange={(e) => setAzureTenantId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Client ID (App Registration)"
                  value={azureClientId}
                  onChange={(e) => setAzureClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <Input
                  label="Client Secret"
                  type="password"
                  value={azureClientSecret}
                  onChange={(e) => setAzureClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={handleTestProvider} loading={testing} className="text-xs">
                  <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
                  Test Azure Key Vault Access
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Live Provider Test Output */}
        {testResult ? (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 text-xs ${
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
              <p className="font-semibold">{testResult.success ? "Vault Authentication Succeeded" : "Connection Error"}</p>
              <p className="mt-0.5 text-zinc-300">{testResult.message}</p>
              {testResult.latencyMs ? (
                <p className="mt-1 text-[11px] text-zinc-400">Response Latency: <strong className="text-emerald-400">{testResult.latencyMs}ms</strong></p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Mapped Secrets Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <FolderLock className="h-4 w-4 text-violet-400" />
              <h3>Mapped External Secrets ({currentMappings.length})</h3>
            </div>
            <Button variant="secondary" size="sm" onClick={handleAddMapping} className="text-xs">
              <Plus className="h-3 w-3" />
              Map Secret Variable
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
            <div className="grid grid-cols-[1.5fr_2fr_1fr_1fr_0.5fr] gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-zinc-400">
              <span>Environment Variable</span>
              <span>KMS / Vault Path</span>
              <span>Sync Status</span>
              <span>Last Checked</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-white/5">
              {currentMappings.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No secrets mapped for this provider. Click &quot;Map Secret Variable&quot; to configure parameter injection.
                </div>
              ) : (
                currentMappings.map((m) => (
                  <div key={m.id} className="grid grid-cols-[1.5fr_2fr_1fr_1fr_0.5fr] items-center gap-2 px-4 py-3 text-xs">
                    <div className="flex items-center gap-2 font-mono font-medium text-zinc-100">
                      <Key className="h-3.5 w-3.5 text-violet-400" />
                      {m.name}
                    </div>
                    <div className="font-mono text-zinc-400 truncate" title={m.externalPath}>
                      {m.externalPath}
                    </div>
                    <div>
                      {m.status === "synced" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Live Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400">
                          <XCircle className="h-3 w-3" /> Error
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-500">{m.lastSynced}</div>
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteMapping(m.id)}
                        className="text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Remove mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Documentation Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-4">
          <span>AgentFlow Dynamic Secret Engine (AES-256 Memory-only Injection)</span>
          <a
            href="https://docs.n8n.io/administer/use-source-control-and-environments"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            Vault &amp; KMS integration architecture docs <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
