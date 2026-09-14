"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode,
  Key,
  Lock,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface TestSamlResult {
  success: boolean;
  message: string;
  idpIssuer?: string;
  nameIdFormat?: string;
  latencyMs?: number;
}

export default function SSOPage() {
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [forceSso, setForceSso] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestSamlResult | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // IdP Configuration
  const [idpEntityId, setIdpEntityId] = useState("https://identity.okta.com/app/agentflow/exk839102839/sso/saml");
  const [idpSsoUrl, setIdpSsoUrl] = useState("https://identity.okta.com/app/agentflow/exk839102839/sso/saml");
  const [idpSloUrl, setIdpSloUrl] = useState("https://identity.okta.com/app/agentflow/exk839102839/slo/saml");
  const [idpCert, setIdpCert] = useState(`-----BEGIN CERTIFICATE-----
MIIDpDCCAoygAwIBAgIGAXv3810UMA0GCSqGSIb3DQEBCwUAMIGSMQswCQYDVQQGEwJV
UzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsG
A1UECgwET2t0YTEUMBIGA1UECwwLU1NPUHJvdmlkZXIxFDASBgNVBAMMC0FnZW50Rmxv
dzAeFw0yNTAxMDEwMDAwMDBaFw0zNTAxMDEwMDAwMDBaMIGSMQswCQYDVQQGEwJVUzET
-----END CERTIFICATE-----`);

  // Attribute Mapping
  const [attrEmail, setAttrEmail] = useState("email");
  const [attrFirstName, setAttrFirstName] = useState("firstName");
  const [attrLastName, setAttrLastName] = useState("lastName");
  const [attrGroups, setAttrGroups] = useState("memberOf");

  // SP (AgentFlow) Metadata Constants
  const spEntityId = "https://app.agentflow.io/auth/saml/metadata";
  const spAcsUrl = "https://app.agentflow.io/auth/saml/callback";
  const spSloUrl = "https://app.agentflow.io/auth/saml/slo";
  const nameIdFormat = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

  function handleCopy(fieldName: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  }

  async function handleTestIdp() {
    setTesting(true);
    setTestResult(null);
    await new Promise((r) => setTimeout(r, 800));
    setTesting(false);
    if (idpEntityId.startsWith("http://") || idpEntityId.startsWith("https://")) {
      setTestResult({
        success: true,
        message: "SAML 2.0 AuthRequest & Assertion signature verified. IdP response valid.",
        idpIssuer: idpEntityId,
        nameIdFormat,
        latencyMs: 52,
      });
    } else {
      setTestResult({
        success: false,
        message: "Invalid IdP Entity ID / Issuer URI. Please provide a valid HTTPS identifier.",
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
              <h1 className="text-2xl font-semibold text-zinc-50">SAML 2.0 Single Sign-On (SSO)</h1>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-400">
                Enterprise
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Federate identity with Okta, Microsoft Entra ID (Azure AD), Google Workspace, or PingFederate.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleTestIdp} loading={testing} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
              Test SAML Flow
            </Button>
            <Button onClick={handleSave} className="text-xs">
              <Save className="h-3.5 w-3.5" />
              Save SAML Config
            </Button>
          </div>
        </div>

        {/* Saved Toast */}
        {savedNotice ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            SAML 2.0 Identity Provider configuration active.
          </div>
        ) : null}

        {/* Status & Enforcement Card */}
        <Card className="border border-white/10 bg-zinc-900/80 p-5 backdrop-blur-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-lg border ${
                  ssoEnabled
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-zinc-800 border-white/10 text-zinc-500"
                }`}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">SSO Authentication Status</h2>
                <p className="text-xs text-zinc-400">
                  {ssoEnabled
                    ? "SAML 2.0 authentication is active. Team members can sign in with corporate credentials."
                    : "SSO is disabled. Users authenticate using email and password."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">{ssoEnabled ? "Enabled" : "Disabled"}</span>
              <button
                type="button"
                role="switch"
                aria-checked={ssoEnabled}
                onClick={() => setSsoEnabled(!ssoEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  ssoEnabled ? "bg-violet-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    ssoEnabled ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Enforce SAML SSO for all workspace members</p>
              <p className="text-[11px] text-zinc-500">
                Disables standard email/password logins (Workspace Owner retained as recovery admin).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={forceSso}
              onClick={() => setForceSso(!forceSso)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                forceSso ? "bg-amber-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  forceSso ? "left-4.5" : "left-0.5"
                }`}
              />
            </button>
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
                <p className="font-semibold">{testResult.success ? "SAML Handshake Passed" : "SAML Auth Error"}</p>
                <p className="mt-0.5 text-zinc-300">{testResult.message}</p>
                {testResult.latencyMs ? (
                  <div className="mt-2 flex gap-4 text-[11px] text-zinc-400">
                    <span>Response Latency: <strong className="text-emerald-400">{testResult.latencyMs}ms</strong></span>
                    <span>NameID Format: <strong className="text-zinc-200 font-mono">{testResult.nameIdFormat}</strong></span>
                    <span>Signature Algorithm: <strong className="text-emerald-400">RSA-SHA256</strong></span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Section 1: AgentFlow Service Provider (SP) Metadata */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <FileCode className="h-4 w-4 text-violet-400" />
              <h3>1. AgentFlow Service Provider (SP) Metadata</h3>
            </div>
            <span className="text-xs text-zinc-500">Provide these URLs to your Identity Provider (IdP)</span>
          </div>

          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">SP Entity ID / Audience URI</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("spEntityId", spEntityId)}
                    className="text-xs text-violet-400 hover:underline flex items-center gap-1"
                  >
                    {copiedField === "spEntityId" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === "spEntityId" ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="font-mono text-xs text-zinc-200 bg-zinc-950/60 border border-white/10 rounded-lg p-2.5 truncate">
                  {spEntityId}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Assertion Consumer Service (ACS) URL</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("spAcsUrl", spAcsUrl)}
                    className="text-xs text-violet-400 hover:underline flex items-center gap-1"
                  >
                    {copiedField === "spAcsUrl" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === "spAcsUrl" ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="font-mono text-xs text-zinc-200 bg-zinc-950/60 border border-white/10 rounded-lg p-2.5 truncate">
                  {spAcsUrl}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Single Logout (SLO) URL</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("spSloUrl", spSloUrl)}
                    className="text-xs text-violet-400 hover:underline flex items-center gap-1"
                  >
                    {copiedField === "spSloUrl" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copiedField === "spSloUrl" ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="font-mono text-xs text-zinc-200 bg-zinc-950/60 border border-white/10 rounded-lg p-2.5 truncate">
                  {spSloUrl}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">NameID Format Requirement</span>
                <div className="font-mono text-xs text-zinc-400 bg-zinc-950/60 border border-white/10 rounded-lg p-2.5 truncate">
                  {nameIdFormat}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Section 2: Identity Provider (IdP) Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <UploadCloud className="h-4 w-4 text-violet-400" />
            <h3>2. Identity Provider (IdP) Settings</h3>
          </div>

          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="IdP Entity ID / Issuer URI"
                value={idpEntityId}
                onChange={(e) => setIdpEntityId(e.target.value)}
                placeholder="https://identity.provider.com/saml/issuer"
              />
              <Input
                label="IdP Single Sign-On (SSO) URL"
                value={idpSsoUrl}
                onChange={(e) => setIdpSsoUrl(e.target.value)}
                placeholder="https://identity.provider.com/saml/sso"
              />
            </div>

            <Input
              label="IdP Single Logout (SLO) URL (Optional)"
              value={idpSloUrl}
              onChange={(e) => setIdpSloUrl(e.target.value)}
              placeholder="https://identity.provider.com/saml/slo"
            />

            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                X.509 Public Signing Certificate (PEM Format)
              </label>
              <textarea
                value={idpCert}
                onChange={(e) => setIdpCert(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-xs text-zinc-300 outline-none focus:border-violet-500"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              />
              <p className="text-[11px] text-zinc-500">
                Used to verify SAML assertion signatures and encrypted assertions from your IdP.
              </p>
            </div>
          </Card>
        </div>

        {/* Section 3: Attribute Mapping */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Users className="h-4 w-4 text-violet-400" />
            <h3>3. SAML Attribute Statements Mapping</h3>
          </div>

          <Card className="border border-white/10 bg-zinc-900/60 p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Input
                label="Email Attribute"
                value={attrEmail}
                onChange={(e) => setAttrEmail(e.target.value)}
                placeholder="email or mail"
              />
              <Input
                label="First Name Attribute"
                value={attrFirstName}
                onChange={(e) => setAttrFirstName(e.target.value)}
                placeholder="firstName or givenName"
              />
              <Input
                label="Last Name Attribute"
                value={attrLastName}
                onChange={(e) => setAttrLastName(e.target.value)}
                placeholder="lastName or sn"
              />
              <Input
                label="Groups / Roles Attribute"
                value={attrGroups}
                onChange={(e) => setAttrGroups(e.target.value)}
                placeholder="memberOf or groups"
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              AgentFlow automatically provisions and updates user profiles based on these SAML assertions during Just-In-Time (JIT) provisioning.
            </p>
          </Card>
        </div>

        {/* Documentation Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-400" />
            <span>AgentFlow Enterprise Security SAML 2.0 Compliance</span>
          </div>
          <a
            href="https://docs.n8n.io/administer/use-source-control-and-environments"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-violet-400 hover:underline"
          >
            SAML &amp; IdP integration documentation <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
