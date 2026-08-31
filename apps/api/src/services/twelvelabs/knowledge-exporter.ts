/**
 * TwelveLabs Knowledge Exporter
 * Converte o resultado de análise profunda da live para:
 * - Markdown estruturado rico com timeline, diagramas Mermaid, logs e pitfalls (docs/overclock-bot-genesis-day69.md)
 * - JSON serializável pronto para ingestão em Vector Stores / RAG
 */
import fs from "node:fs/promises";
import path from "node:path";
import { GenesisAnalysisResult } from "./types.js";

export class TwelveLabsKnowledgeExporter {
  /**
   * Converte a análise estruturada em Markdown de alta fidelidade
   */
  static formatToMarkdown(data: GenesisAnalysisResult): string {
    const lines: string[] = [];

    lines.push(`# 🚀 ${data.title}`);
    lines.push(`\n**Data da Sessão:** ${data.date} | **Video ID:** \`${data.videoId}\``);
    lines.push(`\n## 📌 Resumo Executivo\n`);
    lines.push(data.summary);

    lines.push(`\n## 🏗️ Arquitetura do Overclock Bot\n`);
    lines.push("```mermaid");
    lines.push("graph TD");
    lines.push("  User[Web UI / Operator] -->|HTTP / REST| API[AgentFlow API]");
    lines.push("  User -->|WebSocket noVNC :6080| Stream[websockify Bridge]");
    lines.push("  Stream -->|RFB Protocol :5900| VNC[x11vnc Server]");
    lines.push("  VNC -->|Display :99| Xvfb[Xvfb Virtual Display]");
    lines.push("  Bot[Agentflowbot Daemon] -->|Playwright Chromium| Xvfb");
    lines.push("  AgentFlow[AgentFlow Engine] -->|MCP JSON-RPC| MCP[Bot MCP Tools]");
    lines.push("  MCP --> Bot");
    lines.push("  TwelveLabs[TwelveLabs Jockey MCP] -->|Multimodal AI| Bot");
    lines.push("```\n");

    lines.push(`- **Runtime:** ${data.architecture.runtime}`);
    lines.push(`- **Motor de Browser:** ${data.architecture.browserEngine}`);
    lines.push(`- **Display Virtual:** ${data.architecture.displayProtocol}`);
    lines.push(`- **Transmissão ao Vivo:** ${data.architecture.streamTransport}`);
    lines.push(`- **Integrações MCP:**`);
    for (const mcp of data.architecture.mcpIntegrations) {
      lines.push(`  * \`${mcp}\``);
    }
    lines.push(`- **Autonomous Loop:** ${data.architecture.autonomousLoop}`);

    lines.push(`\n## ⏱️ Linha do Tempo e Decisões de Código (Passo a Passo)\n`);
    lines.push("| Timestamp | Fase | Autor | Decisão de Engenharia | Contexto Técnico / Ação |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const step of data.stepByStepDecisions) {
      lines.push(
        `| \`${step.timestamp}\` | **${step.phase}** | ${step.author} | ${step.decision} | ${step.technicalContext} <br>\`\`\`${step.codeSnippetOrAction || ""}\`\`\` |`
      );
    }

    lines.push(`\n## 💻 Comandos Executados e Logs de Execução da Live\n`);
    for (const cmd of data.executionLogsAndCommands) {
      lines.push(`### 🔹 [${cmd.timestamp}] - ${cmd.intent}`);
      lines.push("```bash");
      lines.push(cmd.command);
      lines.push("```");
      lines.push(`**Resultado:** \`${cmd.outputOrResult}\`\n`);
    }

    lines.push(`\n## ⚠️ Armadilhas Encontradas & Resoluções (Troubleshooting)\n`);
    for (const pitfall of data.pitfallsAndTroubleshooting) {
      lines.push(`### 🔴 ${pitfall.issue}`);
      lines.push(`- **Sintoma:** ${pitfall.symptom}`);
      lines.push(`- **Resolução Aplicada:** ${pitfall.resolution}`);
      lines.push(`- **Lição Aprendida:** *${pitfall.lessonLearned}*\n`);
    }

    lines.push(`---\n*Gerado automaticamente pelo Pipeline TwelveLabs Multimodal AI (Marengo + Pegasus & Jockey MCP)*`);

    return lines.join("\n");
  }

  /**
   * Salva o arquivo de conhecimento no caminho especificado
   */
  static async exportToFile(
    data: GenesisAnalysisResult,
    targetPath?: string
  ): Promise<{ filePath: string; bytesWritten: number }> {
    const mdContent = this.formatToMarkdown(data);
    const resolvedPath =
      targetPath ||
      path.resolve(process.cwd(), "docs", "overclock-bot-genesis-day69.md");

    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolvedPath, mdContent, "utf-8");

    const stat = await fs.stat(resolvedPath);
    return {
      filePath: resolvedPath,
      bytesWritten: stat.size,
    };
  }
}
