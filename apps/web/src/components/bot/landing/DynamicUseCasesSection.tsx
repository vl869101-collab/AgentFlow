"use client";

import { useState } from "react";
import {
  TrendingUp,
  FileSpreadsheet,
  CheckCircle,
  FileText,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Database,
  Search,
} from "lucide-react";
import Link from "next/link";

export function DynamicUseCasesSection() {
  const [activeTab, setActiveTab] = useState<"scraping" | "rpa" | "testing" | "harvesting">("scraping");

  const useCases = {
    scraping: {
      title: "Competitor Reconnaissance & Real-Time Price Scraping",
      kicker: "Dynamic E-Commerce & Intelligence",
      icon: Search,
      challenge:
        "Plataformas concorrentes bloqueiam scrapers estáticos via Cloudflare Turnstile, Shadow-DOM dinâmico e geofencing de preços por IP.",
      solution:
        "O AgentFlow Bot inicializa sessões com proxies residenciais dedicados, renderiza o DOM completo em Xvfb, resolve JavaScript dinâmico, extrai tabelas de SKU e emite alertas estruturados no Slack.",
      outcome: "99.4% extraction success rate across 10,000+ daily SKU scans.",
      metrics: [
        { label: "Taxa de Sucesso", value: "99.4%" },
        { label: "Bypass Cloudflare", value: "100%" },
        { label: "Tempo por SKU", value: "1.2s" },
      ],
      sampleOutput: `[
  { "sku": "GPU-RTX-5090-OC", "competitor": "Shop A", "priceBRL": 12499.00, "stock": "IN_STOCK" },
  { "sku": "GPU-RTX-5090-OC", "competitor": "Shop B", "priceBRL": 12890.00, "stock": "LOW_STOCK" }
]`,
    },
    rpa: {
      title: "Automated Back-Office & ERP Data Entry",
      kicker: "Legacy SaaS & Municipal Portals",
      icon: FileSpreadsheet,
      challenge:
        "Sistemas legados de cadeia de suprimentos e portais municipais não possuem API, obrigando operadores a copiar e colar dados manualmente em mais de 15 telas.",
      solution:
        "O Bot autentica via certificados e credenciais injetadas pelo Vault, valida formulários dinâmicos, realiza upload de planilhas e salva comprovantes fiscais em PDF.",
      outcome: "Zero manual data entry errors; 18 hours saved per operator weekly.",
      metrics: [
        { label: "Erros de Digitação", value: "0.0%" },
        { label: "Horas Economizadas", value: "18h / sem" },
        { label: "Velocidade de Processo", value: "8x faster" },
      ],
      sampleOutput: `{
  "invoiceId": "NF-2026-09884",
  "status": "SUBMITTED_AND_CONFIRMED",
  "portal": "SEFAZ Municipal SP",
  "protocol": "PROT-88492019",
  "pdfReceipt": "s3://agentflow-receipts/2026/09/nf-09884.pdf"
}`,
    },
    testing: {
      title: "Synthetic User Flow & E2E Checkout Auditing",
      kicker: "24/7 Production QA & E-Commerce",
      icon: CheckCircle,
      challenge:
        "Bugs silenciosos no checkout e falhas no gateway de pagamento passam despercebidos por testes unitários, gerando prejuízos antes que a equipe de engenharia note.",
      solution:
        "Jornadas autônomas agendadas a cada 15 minutos que realizam cadastro, adição ao carrinho, pagamento via sandbox Stripe e auditoria de e-mails de confirmação 24/7.",
      outcome: "Mean time to detection (MTTD) cut from 4 hours to under 3 minutes.",
      metrics: [
        { label: "MTTD Incidentes", value: "< 3 min" },
        { label: "Frequência de Teste", value: "A cada 15m" },
        { label: "Cobertura de Gateway", value: "100%" },
      ],
      sampleOutput: `{
  "flow": "E2E_CHECKOUT_STRIPE",
  "testedAt": "2026-09-01T10:45:00Z",
  "durationMs": 8420,
  "stepsPassed": 6,
  "stepsFailed": 0,
  "gatewayResponseTimeMs": 240
}`,
    },
    harvesting: {
      title: "Multi-Platform Research & Document Harvester",
      kicker: "Regulatory, Legal & S3 Indexing",
      icon: FileText,
      challenge:
        "Extrair PDFs regulatórios trimestrais, patentes e relatórios de diários oficiais exige horas de download manual e categorização em pastas.",
      solution:
        "Navegação autônoma que autentica em múltiplos órgãos governamentais, faz download dos binários, executa OCR em tabelas e sincroniza diretamente com buckets S3.",
      outcome: "Over 500+ multi-page filings processed and indexed per hour.",
      metrics: [
        { label: "Documentos / Hora", value: "500+ PDFs" },
        { label: "Precisão OCR", value: "99.8%" },
        { label: "Destino Automático", value: "S3 / VectorDB" },
      ],
      sampleOutput: `{
  "filingId": "REG-2026-Q3",
  "pagesProcessed": 84,
  "extractedTables": 12,
  "syncDestination": "s3://vault-regulatory/q3-2026-report.json",
  "status": "INDEXED_IN_VECTOR_STORE"
}`,
    },
  };

  const current = useCases[activeTab];
  const Icon = current.icon;

  return (
    <section id="use-cases" className="py-24 bg-zinc-950/80 border-t border-white/5 relative scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/50 border border-violet-500/30 text-violet-300 text-xs font-mono mb-4">
            <Globe className="w-3.5 h-3.5 text-violet-400" />
            <span>SOLUTIONS IN ACTION</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
            Where autonomous browser agents create an{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400">
              unfair advantage.
            </span>
          </h2>
        </div>

        {/* Dynamic Scenario Tabs */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          <button
            type="button"
            onClick={() => setActiveTab("scraping")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "scraping"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25 border border-violet-400/40"
                : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10"
            }`}
          >
            Price Scraping & Recon
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rpa")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "rpa"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25 border border-violet-400/40"
                : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10"
            }`}
          >
            Back-Office & ERP Entry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("testing")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "testing"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25 border border-violet-400/40"
                : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10"
            }`}
          >
            Synthetic E2E Checkout
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("harvesting")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "harvesting"
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25 border border-violet-400/40"
                : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10"
            }`}
          >
            Document Harvester
          </button>
        </div>

        {/* Selected Scenario Detailed Showcase */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-zinc-900/60 border border-white/10 rounded-2xl p-6 sm:p-10 shadow-2xl">
          {/* Left Context & Solution Breakdown (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-zinc-800 border border-white/10 text-xs font-mono text-violet-300 mb-3">
                <Icon className="w-4 h-4 text-violet-400" />
                <span>{current.kicker}</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">
                {current.title}
              </h3>

              <div className="space-y-4 text-xs sm:text-sm text-zinc-300">
                <div className="p-3.5 rounded-lg bg-red-500/5 border border-red-500/20">
                  <span className="font-semibold text-red-400 block mb-1">O Desafio Tradicional:</span>
                  <p className="text-zinc-400">{current.challenge}</p>
                </div>

                <div className="p-3.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <span className="font-semibold text-violet-300 block mb-1">A Solução AgentFlow Bot:</span>
                  <p className="text-zinc-300">{current.solution}</p>
                </div>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
              {current.metrics.map((m, idx) => (
                <div key={idx} className="bg-zinc-950/80 p-3 rounded-lg border border-white/5 text-center">
                  <div className="text-base sm:text-xl font-bold font-mono text-emerald-400">{m.value}</div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Live JSON Payload Output (5 cols) */}
          <div className="lg:col-span-5 bg-zinc-950 rounded-xl border border-white/10 p-4 sm:p-6 flex flex-col justify-between font-mono text-xs shadow-inner">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 text-zinc-400">
                <span className="flex items-center gap-2 text-violet-400">
                  <Database className="w-4 h-4" />
                  <span>Structured Extraction Output</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  SCHEMA_VALID
                </span>
              </div>
              <pre className="text-[11px] text-emerald-300/90 leading-relaxed overflow-x-auto select-all">
                {current.sampleOutput}
              </pre>
            </div>

            <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">Auto-synced to PostgreSQL & S3</span>
              <Link
                href="/bot"
                className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <span>Executar no Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
