import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { type WorkflowTemplate, workflowTemplateSchema } from "@agentflow/shared";
import { recordAuditEvent } from "./audit-ledger.js";

/**
 * Catálogo Oficial de Templates de Alto Valor do AgentFlow
 */
export const PRECONFIGURED_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "rag-pdf-pinecone-ai",
    name: "Chat with a PDF using AI (RAG with Pinecone)",
    description: "Ingestão inteligente de PDFs e documentos do Google Drive, vetorização automática com embeddings e Pinecone, e agente de Q&A com IA generativa e memória contextual.",
    category: "IA & RAG",
    tags: ["RAG", "Embeddings", "Google Drive", "Pinecone", "AI Agent", "LLM"],
    icon: "Brain",
    color: "#a855f7",
    connectors: ["Google Drive", "Pinecone", "Claude Sonnet", "Google Docs"],
    difficulty: "Avançado",
    estimatedSetupMinutes: 5,
    featured: true,
    workflow: {
      name: "RAG & Document Intelligence Assistant",
      description: "Pipeline automatizado de RAG para busca semântica em base documental",
      nodes: [
        {
          id: "node-trigger",
          type: "googleDrive",
          label: "Google Drive File Ingest",
          data: {
            type: "googleDrive",
            label: "Google Drive File Ingest",
            description: "Dispara quando um novo PDF ou documento técnico é adicionado",
            config: {
              operation: "watchFolder",
              folderId: "knowledge-base-docs",
              fileTypes: ["pdf", "docx", "txt"],
            },
          },
          position: { x: 100, y: 200 },
        },
        {
          id: "node-vector-store",
          type: "vector_store",
          label: "VectorStore Knowledge Index",
          data: {
            type: "vector_store",
            label: "VectorStore Knowledge Index",
            description: "Gera embeddings dos chunks do documento e indexa no banco vetorial Pinecone",
            config: {
              collection: "enterprise-docs",
              chunkSize: 1000,
              chunkOverlap: 200,
              embeddingModel: "text-embedding-3-small",
            },
          },
          position: { x: 450, y: 200 },
        },
        {
          id: "node-ai-agent",
          type: "ai_agent",
          label: "Autonomous Q&A Agent",
          data: {
            type: "ai_agent",
            label: "Autonomous Q&A Agent",
            description: "Agente cognitivo para responder perguntas com citações da base vetorial",
            config: {
              model: "claude-sonnet-4-6",
              systemPrompt: "Você é um especialista técnico sênior da empresa. Responda baseado estritamente no contexto recuperado da base vetorial.",
              temperature: 0.2,
            },
          },
          position: { x: 800, y: 200 },
        },
        {
          id: "node-docs-output",
          type: "googleDocs",
          label: "Google Docs Synthesis",
          data: {
            type: "googleDocs",
            label: "Google Docs Synthesis",
            description: "Salva o resumo executivo e respostas no relatório corporativo",
            config: {
              documentTitle: "Resumo Executivo de IA",
              mode: "append",
            },
          },
          position: { x: 1150, y: 200 },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "node-trigger",
          target: "node-vector-store",
          label: "Extrair texto & Indexar",
        },
        {
          id: "edge-2",
          source: "node-vector-store",
          target: "node-ai-agent",
          label: "Embeddings & Retrieval",
        },
        {
          id: "edge-3",
          source: "node-ai-agent",
          target: "node-docs-output",
          label: "Relatório Consolidado",
        },
      ],
    },
  },
  {
    id: "lead-ingestion-crm-sync",
    name: "Lead Ingestion & CRM Sync",
    description: "Captura leads via Webhook de landing pages, enriquece via Hunter/Clearbit API, armazena no Google Sheets e HubSpot e notifica os closers no WhatsApp e Slack.",
    category: "Vendas & CRM",
    tags: ["Leads", "Enriquecimento", "Webhook", "Google Sheets", "HubSpot", "WhatsApp", "Slack"],
    icon: "Target",
    color: "#3b82f6",
    connectors: ["Webhook", "HTTP Request", "Google Sheets", "WhatsApp", "Slack", "HubSpot"],
    difficulty: "Iniciante",
    estimatedSetupMinutes: 3,
    featured: true,
    workflow: {
      name: "Lead Ingestion & Fast Enrichment Pipeline",
      description: "Captura de leads, enriquecimento de dados corporativos e disparo multicanal",
      nodes: [
        {
          id: "lead-webhook",
          type: "webhook",
          label: "Inbound Lead Webhook",
          data: {
            type: "webhook",
            label: "Inbound Lead Webhook",
            description: "Recebe submissão de formulário da Landing Page",
            config: {
              path: "inbound-lead",
              method: "POST",
            },
          },
          position: { x: 100, y: 250 },
        },
        {
          id: "lead-enrich-api",
          type: "http",
          label: "Hunter/Clearbit Enrichment",
          data: {
            type: "http",
            label: "Hunter/Clearbit Enrichment",
            description: "Busca cargo, tamanho da empresa e LinkedIn do lead",
            config: {
              url: "https://api.hunter.io/v2/email-verifier",
              method: "GET",
              queryParams: { email: "{{ $json.email }}" },
            },
          },
          position: { x: 450, y: 250 },
        },
        {
          id: "lead-sheets",
          type: "googleSheets",
          label: "Google Sheets Pipeline",
          data: {
            type: "googleSheets",
            label: "Google Sheets Pipeline",
            description: "Registra o lead qualificado na planilha de controle comercial",
            config: {
              spreadsheetId: "leads-crm-sheet",
              sheetName: "Leads_Qualificados",
              operation: "appendRow",
            },
          },
          position: { x: 800, y: 250 },
        },
        {
          id: "lead-notify-slack",
          type: "slack",
          label: "Slack Sales Alert",
          data: {
            type: "slack",
            label: "Slack Sales Alert",
            description: "Alerta em tempo real o canal #sales-leads sobre o novo lead",
            config: {
              channel: "#sales-leads",
              text: "🔥 Novo Lead Qualificado: {{ $json.name }} ({{ $json.company }})",
            },
          },
          position: { x: 1150, y: 150 },
        },
        {
          id: "lead-notify-whatsapp",
          type: "whatsapp",
          label: "WhatsApp SDR Ping",
          data: {
            type: "whatsapp",
            label: "WhatsApp SDR Ping",
            description: "Dispara mensagem via WhatsApp Cloud API para o closer de plantão",
            config: {
              recipientPhone: "{{ $env.SDR_PHONE }}",
              templateName: "lead_alert_instant",
            },
          },
          position: { x: 1150, y: 350 },
        },
      ],
      edges: [
        {
          id: "lead-edge-1",
          source: "lead-webhook",
          target: "lead-enrich-api",
        },
        {
          id: "lead-edge-2",
          source: "lead-enrich-api",
          target: "lead-sheets",
        },
        {
          id: "lead-edge-3",
          source: "lead-sheets",
          target: "lead-notify-slack",
        },
        {
          id: "lead-edge-4",
          source: "lead-sheets",
          target: "lead-notify-whatsapp",
        },
      ],
    },
  },
  {
    id: "support-ticket-auto-triage",
    name: "Support Ticket Auto-Triage & Sentiment Analysis",
    description: "Monitoramento de emails via IMAP/Gmail, classificação de sentimento e urgência com LLM Chain, abertura de ticket e envio de auto-resposta personalizada.",
    category: "Suporte & Atendimento",
    tags: ["Gmail", "IMAP", "LLM Chain", "Triagem", "Auto-reply", "Support"],
    icon: "Headphones",
    color: "#10b981",
    connectors: ["Gmail", "LLM Chain", "Condition", "Discord", "Zendesk"],
    difficulty: "Intermediário",
    estimatedSetupMinutes: 4,
    featured: true,
    workflow: {
      name: "Customer Support Intelligent Auto-Triage",
      description: "Classificação automática de tickets de suporte e resposta assistida",
      nodes: [
        {
          id: "support-trigger-gmail",
          type: "gmailTrigger",
          label: "Incoming Gmail Inbox",
          data: {
            type: "gmailTrigger",
            label: "Incoming Gmail Inbox",
            description: "Monitora emails recebidos na caixa de suporte@empresa.com",
            config: {
              filterQuery: "to:suporte@empresa.com is:unread",
            },
          },
          position: { x: 100, y: 220 },
        },
        {
          id: "support-llm-classifier",
          type: "llm_chain",
          label: "LLM Sentiment & Intent Classifier",
          data: {
            type: "llm_chain",
            label: "LLM Sentiment & Intent Classifier",
            description: "Analisa a intenção (Dúvida, Bug Crítico, Faturamento, Cancelamento) e urgência",
            config: {
              promptTemplate: "Classifique o seguinte email de suporte:\nAssunto: {{ $json.subject }}\nCorpo: {{ $json.body }}\nRetorne JSON com category, urgency (alta/media/baixa) e draftReply.",
              model: "claude-sonnet-4-6",
            },
          },
          position: { x: 450, y: 220 },
        },
        {
          id: "support-condition-urgency",
          type: "condition",
          label: "Urgency Router",
          data: {
            type: "condition",
            label: "Urgency Router",
            description: "Roteia incidentes críticos diretamente para a equipe de plantão",
            config: {
              field: "$json.urgency",
              operator: "equals",
              value: "alta",
            },
          },
          position: { x: 800, y: 220 },
        },
        {
          id: "support-auto-reply",
          type: "googleGmail",
          label: "Gmail Smart Auto-Reply",
          data: {
            type: "googleGmail",
            label: "Gmail Smart Auto-Reply",
            description: "Envia resposta contextualizada ao cliente confirmando o protocolo",
            config: {
              to: "{{ $json.from }}",
              subject: "Re: {{ $json.subject }} [Ticket #{{ $execution.id }}]",
              body: "{{ $json.draftReply }}",
            },
          },
          position: { x: 1150, y: 120 },
        },
        {
          id: "support-discord-alert",
          type: "discord",
          label: "Discord Urgent Ops Ping",
          data: {
            type: "discord",
            label: "Discord Urgent Ops Ping",
            description: "Notifica engenharia no Discord sobre incidente crítico",
            config: {
              channel: "support-war-room",
              content: "🚨 **Ticket Crítico Recebido!** Cliente: {{ $json.from }} - Categoria: {{ $json.category }}",
            },
          },
          position: { x: 1150, y: 320 },
        },
      ],
      edges: [
        {
          id: "support-edge-1",
          source: "support-trigger-gmail",
          target: "support-llm-classifier",
        },
        {
          id: "support-edge-2",
          source: "support-llm-classifier",
          target: "support-condition-urgency",
        },
        {
          id: "support-edge-3",
          source: "support-condition-urgency",
          target: "support-auto-reply",
          label: "Normal / Baixa",
        },
        {
          id: "support-edge-4",
          source: "support-condition-urgency",
          target: "support-discord-alert",
          label: "Urgência Alta",
        },
      ],
    },
  },
  {
    id: "devops-cicd-incident-alert",
    name: "DevOps CI/CD Incident Alert & Rollback Dispatcher",
    description: "Captura falhas de build/deploy do GitHub Webhook, processa logs de erro via Error Handler e aciona canais de alerta no Discord e PagerDuty com logs anexados.",
    category: "DevOps & Cloud",
    tags: ["DevOps", "GitHub", "CI/CD", "Incidentes", "Discord", "Monitoramento", "PagerDuty"],
    icon: "ShieldAlert",
    color: "#ef4444",
    connectors: ["GitHub Webhook", "Error Handler", "Code Sandbox", "Discord", "PagerDuty API"],
    difficulty: "Intermediário",
    estimatedSetupMinutes: 3,
    featured: true,
    workflow: {
      name: "DevOps CI/CD Build Failure & Incident Dispatcher",
      description: "Detecção e roteamento de falhas de pipeline e deploy com deduplicação",
      nodes: [
        {
          id: "devops-github-webhook",
          type: "webhook",
          label: "GitHub Actions Webhook",
          data: {
            type: "webhook",
            label: "GitHub Actions Webhook",
            description: "Recebe payload de workflow_run status completed/failure",
            config: {
              path: "github-actions-events",
              method: "POST",
            },
          },
          position: { x: 100, y: 200 },
        },
        {
          id: "devops-log-parser",
          type: "code",
          label: "Stack Trace Sanitizer",
          data: {
            type: "code",
            label: "Stack Trace Sanitizer",
            description: "Extrai as últimas 15 linhas do log de erro e omite credenciais",
            config: {
              language: "javascript",
              code: "const run = $json.workflow_run || {};\nreturn [{\n  repo: $json.repository?.full_name,\n  branch: run.head_branch,\n  commit: run.head_sha?.substring(0, 7),\n  conclusion: run.conclusion,\n  html_url: run.html_url,\n  title: run.display_title || 'CI Run'\n}];",
            },
          },
          position: { x: 450, y: 200 },
        },
        {
          id: "devops-discord-webhook",
          type: "discord",
          label: "Discord DevOps Channel",
          data: {
            type: "discord",
            label: "Discord DevOps Channel",
            description: "Publica card formatado de incidente de build",
            config: {
              channel: "devops-alerts",
              content: "💥 **CI/CD Pipeline Failed!**\n**Repo:** `{{ $json.repo }}`\n**Branch:** `{{ $json.branch }}` ({{ $json.commit }})\n**URL:** {{ $json.html_url }}",
            },
          },
          position: { x: 800, y: 120 },
        },
        {
          id: "devops-pagerduty-call",
          type: "http",
          label: "PagerDuty Incident Trigger",
          data: {
            type: "http",
            label: "PagerDuty Incident Trigger",
            description: "Cria evento de severidade crítica na API do PagerDuty v2",
            config: {
              url: "https://events.pagerduty.com/v2/enqueue",
              method: "POST",
              body: {
                routing_key: "{{ $env.PAGERDUTY_ROUTING_KEY }}",
                event_action: "trigger",
                payload: {
                  summary: "CI/CD Failure: {{ $json.repo }} on {{ $json.branch }}",
                  severity: "error",
                  source: "AgentFlow DevOps CI",
                },
              },
            },
          },
          position: { x: 800, y: 280 },
        },
      ],
      edges: [
        {
          id: "devops-edge-1",
          source: "devops-github-webhook",
          target: "devops-log-parser",
        },
        {
          id: "devops-edge-2",
          source: "devops-log-parser",
          target: "devops-discord-webhook",
        },
        {
          id: "devops-edge-3",
          source: "devops-log-parser",
          target: "devops-pagerduty-call",
        },
      ],
    },
  },
  {
    id: "ecommerce-cart-recovery",
    name: "E-commerce Abandoned Cart Recovery & Re-engagement",
    description: "Monitora carrinhos abandonados via Webhook da Stripe/Shopify, aguarda 1 hora pelo checkout e envia lembrete amigável com cupom exclusivo no WhatsApp.",
    category: "Marketing & Growth",
    tags: ["E-commerce", "Stripe", "WhatsApp", "Delay", "Carrinho Abandonado", "Vendas"],
    icon: "ShoppingCart",
    color: "#f59e0b",
    connectors: ["Stripe Webhook", "Delay Timer", "Stripe API", "Condition Filter", "WhatsApp API"],
    difficulty: "Iniciante",
    estimatedSetupMinutes: 3,
    featured: true,
    workflow: {
      name: "Stripe Abandoned Cart 1-Hour Recovery Workflow",
      description: "Recuperação automatizada de checkout abandonado via WhatsApp Cloud API",
      nodes: [
        {
          id: "cart-stripe-webhook",
          type: "webhook",
          label: "Stripe Checkout Initiated",
          data: {
            type: "webhook",
            label: "Stripe Checkout Initiated",
            description: "Disparado quando uma sessão de checkout é aberta e não concluída",
            config: {
              path: "stripe-cart-abandoned",
              method: "POST",
            },
          },
          position: { x: 100, y: 220 },
        },
        {
          id: "cart-delay-1h",
          type: "delay",
          label: "Wait 1 Hour",
          data: {
            type: "delay",
            label: "Wait 1 Hour",
            description: "Dá tempo hábil para o cliente concluir a compra espontaneamente",
            config: {
              unit: "hours",
              amount: 1,
            },
          },
          position: { x: 450, y: 220 },
        },
        {
          id: "cart-check-status",
          type: "http",
          label: "Check Stripe Session Status",
          data: {
            type: "http",
            label: "Check Stripe Session Status",
            description: "Verifica se o pagamento já foi efetuado na Stripe",
            config: {
              url: "https://api.stripe.com/v1/checkout/sessions/{{ $json.id }}",
              method: "GET",
              headers: {
                Authorization: "Bearer {{ $env.STRIPE_SECRET_KEY }}",
              },
            },
          },
          position: { x: 800, y: 220 },
        },
        {
          id: "cart-is-unpaid",
          type: "condition",
          label: "Is Still Unpaid?",
          data: {
            type: "condition",
            label: "Is Still Unpaid?",
            description: "Filtra apenas carrinhos que continuam com status unpaid/open",
            config: {
              field: "$json.payment_status",
              operator: "equals",
              value: "unpaid",
            },
          },
          position: { x: 1150, y: 220 },
        },
        {
          id: "cart-whatsapp-recovery",
          type: "whatsapp",
          label: "WhatsApp Recovery Message",
          data: {
            type: "whatsapp",
            label: "WhatsApp Recovery Message",
            description: "Envia link do carrinho com cupom de 10% de desconto",
            config: {
              recipientPhone: "{{ $json.customer_details.phone }}",
              templateName: "abandoned_cart_discount_10",
              variables: {
                customer_name: "{{ $json.customer_details.name }}",
                cart_url: "{{ $json.url }}",
                discount_code: "VOLTA10",
              },
            },
          },
          position: { x: 1500, y: 220 },
        },
      ],
      edges: [
        {
          id: "cart-edge-1",
          source: "cart-stripe-webhook",
          target: "cart-delay-1h",
        },
        {
          id: "cart-edge-2",
          source: "cart-delay-1h",
          target: "cart-check-status",
        },
        {
          id: "cart-edge-3",
          source: "cart-check-status",
          target: "cart-is-unpaid",
        },
        {
          id: "cart-edge-4",
          source: "cart-is-unpaid",
          target: "cart-whatsapp-recovery",
          label: "Não Pago",
        },
      ],
    },
  },
];

/**
 * Sanitiza um template para exportação segura (remove secrets, chaves privadas ou IDs locais)
 */
export function sanitizeTemplateForExport(template: WorkflowTemplate): WorkflowTemplate {
  const cloned = JSON.parse(JSON.stringify(template)) as WorkflowTemplate;

  // Sanitizar configs de nodes sensíveis
  cloned.workflow.nodes = cloned.workflow.nodes.map((node) => {
    const config = (node.config ?? node.data?.config ?? {}) as Record<string, unknown>;
    const sanitizedConfig: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      // Se for senha, token, autorização ou chave privada, zerar
      if (
        /token|password|secret|api_?key|private_?key|auth_?token|authorization/i.test(key) &&
        typeof value === "string"
      ) {
        sanitizedConfig[key] = "";
      } else {
        sanitizedConfig[key] = value;
      }
    }

    return {
      ...node,
      config: sanitizedConfig,
      data: {
        ...(node.data || {}),
        config: sanitizedConfig,
      },
    };
  });

  return cloned;
}

/**
 * Clona um template diretamente para o banco de dados do workspace do usuário
 */
export async function cloneTemplateToWorkspace(params: {
  templateId: string;
  userId: string;
  orgId: string;
  customName?: string;
  customDescription?: string;
  ip?: string;
  userAgent?: string;
}) {
  const template = PRECONFIGURED_TEMPLATES.find((t) => t.id === params.templateId);
  if (!template) {
    throw new Error(`Template com ID "${params.templateId}" não foi encontrado.`);
  }

  const workflowName = params.customName?.trim() || template.workflow.name || template.name;
  const workflowDescription = params.customDescription?.trim() || template.workflow.description || template.description;

  // Gerar novos IDs únicos para os nodes do canvas para evitar colisões
  const idMap = new Map<string, string>();
  const newNodes = template.workflow.nodes.map((node) => {
    const newId = randomUUID();
    if (node.id) idMap.set(node.id, newId);

    const nodeType = String(node.data?.type ?? node.type);
    const nodeLabel = String(node.data?.label ?? node.label ?? nodeType);
    const nodeDesc = String(node.data?.description ?? "");
    const nodeConfig = (node.data?.config ?? node.config ?? {}) as Record<string, any>;

    return {
      id: newId,
      type: nodeType,
      label: nodeLabel,
      config: nodeConfig,
      position: node.position ?? { x: 0, y: 0 },
      width: node.width,
      height: node.height,
      data: {
        type: nodeType,
        label: nodeLabel,
        description: nodeDesc,
        config: nodeConfig,
      },
    };
  });

  const newEdges = template.workflow.edges.map((edge) => {
    const sourceNodeId = String(edge.sourceNodeId ?? edge.source ?? "");
    const targetNodeId = String(edge.targetNodeId ?? edge.target ?? "");
    return {
      id: randomUUID(),
      sourceNodeId: idMap.get(sourceNodeId) ?? sourceNodeId,
      targetNodeId: idMap.get(targetNodeId) ?? targetNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
      condition: edge.condition,
    };
  });

  // Criar o workflow e seus nós na transação
  const createdWorkflow = await prisma.$transaction(async (tx: any) => {
    const wf = await tx.workflow.create({
      data: {
        name: workflowName,
        description: workflowDescription,
        ownerId: params.userId,
        orgId: params.orgId,
        status: "DRAFT",
      },
    });

    if (newNodes.length > 0) {
      await tx.workflowNode.createMany({
        data: newNodes.map((node) => ({
          id: node.id,
          workflowId: wf.id,
          type: node.type,
          label: node.label,
          config: node.config,
          position: node.position,
          width: node.width,
          height: node.height,
        })),
      });
    }

    if (newEdges.length > 0) {
      await tx.workflowEdge.createMany({
        data: newEdges.map((edge) => ({
          id: edge.id,
          workflowId: wf.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          label: edge.label,
          condition: edge.condition as any,
        })),
      });
    }

    await tx.workflowVersion.create({
      data: {
        workflowId: wf.id,
        version: 1,
        snapshot: {
          nodes: newNodes,
          edges: newEdges,
        } as any,
      },
    });

    return wf;
  });

  await recordAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: "template.cloned",
    resource: "workflow",
    resourceId: createdWorkflow.id,
    metadata: {
      templateId: template.id,
      templateName: template.name,
      workflowName: createdWorkflow.name,
    },
    ip: params.ip,
    userAgent: params.userAgent,
  });

  const fullWorkflow = await prisma.workflow.findUnique({
    where: { id: createdWorkflow.id },
    include: { nodes: true, edges: true },
  });

  return fullWorkflow;
}

/**
 * Importa um template JSON arbitrário para o workspace do usuário
 */
export async function importTemplateJsonToWorkspace(params: {
  templateData: unknown;
  userId: string;
  orgId: string;
  customName?: string;
  ip?: string;
  userAgent?: string;
}) {
  const parsed = workflowTemplateSchema.safeParse(params.templateData);
  let templateObj: WorkflowTemplate;

  if (parsed.success) {
    templateObj = parsed.data;
  } else {
    // Tenta interpretar estrutura simplificada { name, description, nodes, edges }
    const raw = params.templateData as any;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.nodes)) {
      throw new Error("Formato de template inválido. Esperava-se um JSON contendo nós e conexões.");
    }
    templateObj = {
      id: raw.id || randomUUID(),
      name: raw.name || "Workflow Importado",
      description: raw.description || "",
      category: raw.category || "Customizado",
      tags: Array.isArray(raw.tags) ? raw.tags : ["Importado"],
      connectors: Array.isArray(raw.connectors) ? raw.connectors : [],
      difficulty: "Intermediário",
      estimatedSetupMinutes: 5,
      workflow: {
        name: raw.name || "Workflow Importado",
        description: raw.description || "",
        nodes: raw.nodes,
        edges: Array.isArray(raw.edges) ? raw.edges : [],
      },
    };
  }

  // Gera o workflow
  const workflowName = params.customName?.trim() || templateObj.workflow.name || templateObj.name;
  const workflowDescription = templateObj.workflow.description || templateObj.description;

  const idMap = new Map<string, string>();
  const newNodes = templateObj.workflow.nodes.map((node: any) => {
    const newId = randomUUID();
    if (node.id) idMap.set(node.id, newId);

    const nodeType = String(node.data?.type ?? node.type);
    const nodeLabel = String(node.data?.label ?? node.label ?? nodeType);
    const nodeConfig = (node.data?.config ?? node.config ?? {}) as Record<string, any>;

    return {
      id: newId,
      type: nodeType,
      label: nodeLabel,
      config: nodeConfig,
      position: node.position ?? { x: 0, y: 0 },
      width: node.width,
      height: node.height,
      data: {
        type: nodeType,
        label: nodeLabel,
        config: nodeConfig,
      },
    };
  });

  const newEdges = templateObj.workflow.edges.map((edge: any) => {
    const sourceNodeId = String(edge.sourceNodeId ?? edge.source ?? "");
    const targetNodeId = String(edge.targetNodeId ?? edge.target ?? "");
    return {
      id: randomUUID(),
      sourceNodeId: idMap.get(sourceNodeId) ?? sourceNodeId,
      targetNodeId: idMap.get(targetNodeId) ?? targetNodeId,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
      condition: edge.condition,
    };
  });

  const createdWorkflow = await prisma.$transaction(async (tx: any) => {
    const wf = await tx.workflow.create({
      data: {
        name: workflowName,
        description: workflowDescription,
        ownerId: params.userId,
        orgId: params.orgId,
        status: "DRAFT",
      },
    });

    if (newNodes.length > 0) {
      await tx.workflowNode.createMany({
        data: newNodes.map((node) => ({
          id: node.id,
          workflowId: wf.id,
          type: node.type,
          label: node.label,
          config: node.config,
          position: node.position,
          width: node.width,
          height: node.height,
        })),
      });
    }

    if (newEdges.length > 0) {
      await tx.workflowEdge.createMany({
        data: newEdges.map((edge) => ({
          id: edge.id,
          workflowId: wf.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          label: edge.label,
          condition: edge.condition as any,
        })),
      });
    }

    await tx.workflowVersion.create({
      data: {
        workflowId: wf.id,
        version: 1,
        snapshot: {
          nodes: newNodes,
          edges: newEdges,
        } as any,
      },
    });

    return wf;
  });

  await recordAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: "template.imported",
    resource: "workflow",
    resourceId: createdWorkflow.id,
    metadata: {
      workflowName: createdWorkflow.name,
      nodeCount: newNodes.length,
      edgeCount: newEdges.length,
    },
    ip: params.ip,
    userAgent: params.userAgent,
  });

  return prisma.workflow.findUnique({
    where: { id: createdWorkflow.id },
    include: { nodes: true, edges: true },
  });
}
