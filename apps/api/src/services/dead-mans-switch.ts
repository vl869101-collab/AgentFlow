import { safeFetch } from "../lib/ssrf.js";
import type { DLQIncidentRecord } from "./queue.js";

export interface DeadMansSwitchConfig {
  /**
   * Discord webhook URL to send alerts to
   */
  discordWebhookUrl?: string;
  /**
   * Slack webhook URL to send alerts to
   */
  slackWebhookUrl?: string;
  /**
   * Frequency threshold: alert if DLQ errors exceed this number in windowMs
   */
  thresholdCount?: number;
  /**
   * Time window in milliseconds (default: 60,000ms = 1 min)
   */
  windowMs?: number;
  /**
   * Minimum cooldown between repeated alerts in milliseconds (default: 30,000ms)
   */
  cooldownMs?: number;
}

export interface DeadMansSwitchAlertResult {
  triggered: boolean;
  reason?: string;
  errorCount: number;
  discordDelivered?: boolean;
  slackDelivered?: boolean;
  alertPayloads?: {
    discord?: Record<string, unknown>;
    slack?: Record<string, unknown>;
  };
}

export class DeadMansSwitchService {
  private recentFailures: Array<{ timestamp: number; incident: DLQIncidentRecord }> = [];
  private lastAlertTimestamp = 0;
  private config: DeadMansSwitchConfig;

  constructor(config: DeadMansSwitchConfig = {}) {
    this.config = {
      thresholdCount: config.thresholdCount ?? 3,
      windowMs: config.windowMs ?? 60_000,
      cooldownMs: config.cooldownMs ?? 30_000,
      discordWebhookUrl: config.discordWebhookUrl ?? process.env.ALERT_DISCORD_WEBHOOK_URL,
      slackWebhookUrl: config.slackWebhookUrl ?? process.env.ALERT_SLACK_WEBHOOK_URL,
    };
  }

  public updateConfig(newConfig: Partial<DeadMansSwitchConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  public getConfig(): DeadMansSwitchConfig {
    return { ...this.config };
  }

  /**
   * Formats a structured Discord embed payload for a DLQ incident / recurring failures alert
   */
  public formatDiscordAlert(incident: DLQIncidentRecord, countInWindow: number): Record<string, unknown> {
    const isCritical = incident.severity === "CRITICAL" || countInWindow >= 5;
    const color = isCritical ? 0xef4444 : 0xf59e0b; // Red or Orange

    return {
      username: "AgentFlow Dead Man's Switch",
      avatar_url: "https://agentflow.io/static/alert-bot.png",
      content: `🚨 **[DEAD MAN'S SWITCH] Recurring Worker DLQ Failures Detected** (${countInWindow} failures in window)`,
      embeds: [
        {
          title: `DLQ Alert: ${incident.severity} Severity Failure on Execution`,
          description: `The worker Dead Letter Queue has registered recurring failures. Investigation or replay action required.`,
          color,
          fields: [
            { name: "Execution ID", value: `\`${incident.executionId}\``, inline: true },
            { name: "Incident ID", value: `\`${incident.id}\``, inline: true },
            { name: "Severity", value: incident.severity, inline: true },
            { name: "Workflow ID", value: incident.workflowId ? `\`${incident.workflowId}\`` : "N/A", inline: true },
            { name: "Organization ID", value: incident.orgId ? `\`${incident.orgId}\`` : "N/A", inline: true },
            { name: "Failures in Window", value: String(countInWindow), inline: true },
            { name: "Error Message", value: `\`\`\`\n${incident.error.slice(0, 1000)}\n\`\`\``, inline: false },
          ],
          footer: {
            text: "AgentFlow Observability & Dead Letter Queue Monitor",
          },
          timestamp: incident.timestamp,
        },
      ],
    };
  }

  /**
   * Formats a structured Slack block kit payload for a DLQ incident / recurring failures alert
   */
  public formatSlackAlert(incident: DLQIncidentRecord, countInWindow: number): Record<string, unknown> {
    const isCritical = incident.severity === "CRITICAL" || countInWindow >= 5;
    const alertPrefix = isCritical ? "🚨 *[CRITICAL DEAD MAN'S SWITCH ALERT]*" : "⚠️ *[DEAD MAN'S SWITCH WARNING]*";

    return {
      text: `DLQ Worker Alert: ${incident.error}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 AgentFlow DLQ Alert — Recurring Failures",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${alertPrefix}\n*The worker Dead Letter Queue reached ${countInWindow} failures in the current observation window.*`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Execution ID:*\n\`${incident.executionId}\`` },
            { type: "mrkdwn", text: `*Incident ID:*\n\`${incident.id}\`` },
            { type: "mrkdwn", text: `*Severity:*\n${incident.severity}` },
            { type: "mrkdwn", text: `*Workflow:*\n${incident.workflowId ? `\`${incident.workflowId}\`` : "N/A"}` },
            { type: "mrkdwn", text: `*Org:*\n${incident.orgId ? `\`${incident.orgId}\`` : "N/A"}` },
            { type: "mrkdwn", text: `*Timestamp:*\n${incident.timestamp}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Error Detail:*\n\`\`\`${incident.error.slice(0, 800)}\`\`\``,
          },
        },
      ],
    };
  }

  /**
   * Record a new failure incident, check thresholds and automatically notify configured webhooks
   */
  public async recordFailureAndCheckAlert(incident: DLQIncidentRecord): Promise<DeadMansSwitchAlertResult> {
    const now = Date.now();
    const windowStart = now - (this.config.windowMs ?? 60_000);

    // Prune stale failures outside window
    this.recentFailures = this.recentFailures.filter((f) => f.timestamp >= windowStart);
    this.recentFailures.push({ timestamp: now, incident });

    const countInWindow = this.recentFailures.length;
    const threshold = this.config.thresholdCount ?? 3;
    const cooldown = this.config.cooldownMs ?? 30_000;

    // Check if threshold breached
    if (countInWindow >= threshold) {
      // Check cooldown to avoid alert spamming
      if (now - this.lastAlertTimestamp < cooldown) {
        return {
          triggered: false,
          reason: "COOLDOWN_ACTIVE",
          errorCount: countInWindow,
        };
      }

      this.lastAlertTimestamp = now;

      const discordPayload = this.formatDiscordAlert(incident, countInWindow);
      const slackPayload = this.formatSlackAlert(incident, countInWindow);

      let discordDelivered = false;
      let slackDelivered = false;

      const isMock = process.env.MOCK_SERVICES === "true" || process.env.NODE_ENV === "test";

      // 1. Dispatch Discord Alert
      const discordUrl = this.config.discordWebhookUrl || process.env.ALERT_DISCORD_WEBHOOK_URL;
      if (discordUrl) {
        if (isMock) {
          discordDelivered = true;
        } else {
          try {
            const res = await safeFetch(discordUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(discordPayload),
            });
            discordDelivered = res.ok;
          } catch (err) {
            console.error("[DeadMansSwitch] Failed to deliver Discord webhook:", err);
          }
        }
      }

      // 2. Dispatch Slack Alert
      const slackUrl = this.config.slackWebhookUrl || process.env.ALERT_SLACK_WEBHOOK_URL;
      if (slackUrl) {
        if (isMock) {
          slackDelivered = true;
        } else {
          try {
            const res = await safeFetch(slackUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(slackPayload),
            });
            slackDelivered = res.ok;
          } catch (err) {
            console.error("[DeadMansSwitch] Failed to deliver Slack webhook:", err);
          }
        }
      }

      return {
        triggered: true,
        reason: "THRESHOLD_BREACHED",
        errorCount: countInWindow,
        discordDelivered,
        slackDelivered,
        alertPayloads: {
          discord: discordPayload,
          slack: slackPayload,
        },
      };
    }

    return {
      triggered: false,
      reason: "BELOW_THRESHOLD",
      errorCount: countInWindow,
    };
  }

  public reset() {
    this.recentFailures = [];
    this.lastAlertTimestamp = 0;
  }
}

export const deadMansSwitch = new DeadMansSwitchService();
