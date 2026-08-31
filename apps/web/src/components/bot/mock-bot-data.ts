import type { BotChatMessage, BrowserAction, BotTask, McpInvocation } from "./bot-types";

export const initialMockChatMessages: BotChatMessage[] = [
  {
    id: "msg-1",
    sender: "system",
    content: "Agentflowbot v2.4 inicializado. Sessão do navegador Chromium sandbox conectada via WebRTC/noVNC com isolamento de segurança.",
    timestamp: "10:42:01",
  },
  {
    id: "msg-2",
    sender: "user",
    content: "Por favor, acesse o painel da AWS, verifique as instâncias EC2 ativas na região us-east-1 e faça uma captura dos alarmes em vermelho.",
    timestamp: "10:42:15",
  },
  {
    id: "msg-3",
    sender: "bot",
    content: "Com certeza! Estou inicializando a rotina de navegação segura com MCP Puppeteer / Playwright para autenticação e consulta de métricas.",
    timestamp: "10:42:18",
    thinking: "Planejando sequência: 1. Navegar até o console AWS 2. Executar login através do Vault MCP 3. Localizar página de instâncias EC2 4. Inspecionar CloudWatch alarms.",
    toolCall: {
      name: "browser_navigate",
      server: "mcp-puppeteer-cluster",
      args: { url: "https://us-east-1.console.aws.amazon.com/ec2/home", waitUntil: "networkidle0" },
      status: "success",
    },
  },
  {
    id: "msg-4",
    sender: "bot",
    content: "Navegação concluída. Identifiquei 4 instâncias em execução e 1 alarme do CloudWatch pendente de atenção (High CPU Utilization em i-0fa83c799a).",
    timestamp: "10:43:02",
    toolCall: {
      name: "cloudwatch_get_alarms",
      server: "aws-cloudwatch-mcp",
      args: { stateValue: "ALARM", region: "us-east-1" },
      status: "success",
    },
  },
];

export const initialMockActions: BrowserAction[] = [
  {
    id: "act-1",
    type: "navigate",
    target: "https://console.aws.amazon.com/ec2",
    timestamp: "10:42:20",
    durationMs: 840,
    status: "completed",
  },
  {
    id: "act-2",
    type: "wait",
    target: "selector(#ec2-dashboard-table)",
    timestamp: "10:42:25",
    durationMs: 320,
    status: "completed",
  },
  {
    id: "act-3",
    type: "click",
    target: "button[data-testid='region-selector']",
    value: "us-east-1 (N. Virginia)",
    timestamp: "10:42:32",
    durationMs: 150,
    status: "completed",
  },
  {
    id: "act-4",
    type: "extract",
    target: "table.instances-grid tbody tr",
    value: "4 instâncias mapeadas",
    timestamp: "10:42:48",
    durationMs: 410,
    status: "completed",
  },
  {
    id: "act-5",
    type: "screenshot",
    target: "viewport_full",
    value: "CloudWatch Alarm snapshot salvo",
    timestamp: "10:43:01",
    durationMs: 220,
    status: "completed",
  },
  {
    id: "act-6",
    type: "hover",
    target: "div.alarm-badge-danger",
    timestamp: "10:43:10",
    durationMs: 90,
    status: "running",
  },
];

export const initialMockTasks: BotTask[] = [
  {
    id: "task-1",
    title: "Auditoria de instâncias e alarmes EC2 us-east-1",
    description: "Extração de telemetria e captura visual de incidentes no console da nuvem.",
    status: "in_progress",
    progressPercent: 75,
    createdAt: "10:42:15",
    subtasks: [
      { id: "st-1", title: "Acessar console AWS us-east-1", completed: true },
      { id: "st-2", title: "Autenticar via credenciais isoladas do Vault", completed: true },
      { id: "st-3", title: "Extrair status das instâncias EC2", completed: true },
      { id: "st-4", title: "Gerar relatório e snapshot de alarmes ativos", completed: false },
    ],
  },
  {
    id: "task-2",
    title: "Notificar canal #infra-alerts no Slack",
    description: "Encaminhamento automático do resumo de incidentes via MCP Slack.",
    status: "pending",
    progressPercent: 0,
    createdAt: "10:43:05",
  },
];

export const initialMockMcpInvocations: McpInvocation[] = [
  {
    id: "mcp-inv-1",
    serverName: "mcp-puppeteer-cluster",
    toolName: "browser_navigate",
    arguments: { url: "https://console.aws.amazon.com/ec2", viewport: { width: 1920, height: 1080 } },
    response: { status: 200, pageTitle: "Amazon EC2 Management Console", loadTimeMs: 840 },
    executionTimeMs: 840,
    status: "success",
    timestamp: "10:42:20",
  },
  {
    id: "mcp-inv-2",
    serverName: "aws-cloudwatch-mcp",
    toolName: "get_metric_data",
    arguments: { metricName: "CPUUtilization", namespace: "AWS/EC2", period: 300 },
    response: { datapoints: 12, maxCpu: "94.8%", threshold: "80%" },
    executionTimeMs: 310,
    status: "success",
    timestamp: "10:42:55",
  },
  {
    id: "mcp-inv-3",
    serverName: "mcp-puppeteer-cluster",
    toolName: "capture_element_screenshot",
    arguments: { selector: "#alarm-widget-critical", format: "webp", quality: 90 },
    response: { url: "storage://snapshots/ec2-alarm-104301.webp", sizeKb: 142 },
    executionTimeMs: 220,
    status: "success",
    timestamp: "10:43:01",
  },
];
