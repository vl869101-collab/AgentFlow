import test from "node:test";
import assert from "node:assert/strict";
import { BotRuntimeEngine } from "../src/bot-engine.js";
import { BotModeSchema, BrowserActionSchema } from "../src/types.js";

test("BotModeSchema validates valid modes", () => {
  assert.equal(BotModeSchema.parse("ai_autonomous"), "ai_autonomous");
  assert.equal(BotModeSchema.parse("human_takeover"), "human_takeover");
  assert.equal(BotModeSchema.parse("paused"), "paused");
  assert.throws(() => BotModeSchema.parse("invalid_mode"));
});

test("BrowserActionSchema parses correctly", () => {
  const sample = {
    id: "act_1",
    type: "navigate",
    target: "https://agentflow.io",
    timestamp: new Date().toISOString(),
    status: "completed",
  };
  const parsed = BrowserActionSchema.parse(sample);
  assert.equal(parsed.type, "navigate");
  assert.equal(parsed.target, "https://agentflow.io");
});

test("BotRuntimeEngine state transitions and task management", async () => {
  const engine = new BotRuntimeEngine({ sessionId: "test_session_1" });
  await engine.start();

  const initialState = engine.getState();
  assert.equal(initialState.sessionId, "test_session_1");
  assert.equal(initialState.mode, "ai_autonomous");
  assert.equal(initialState.status, "idle");

  // Mode change to human takeover
  engine.setMode("human_takeover");
  const takeoverState = engine.getState();
  assert.equal(takeoverState.mode, "human_takeover");
  assert.equal(takeoverState.status, "waiting_user_input");

  // Autonomous action rejection during takeover
  await assert.rejects(
    async () => {
      await engine.executeBrowserAction({ type: "click", target: "#btn" });
    },
    { message: /Human Takeover/ }
  );

  // Resume autonomous mode
  engine.setMode("ai_autonomous");
  assert.equal(engine.getState().mode, "ai_autonomous");

  // Create and update task
  const task = engine.createTask("Pesquisar leads no LinkedIn", "Extrair 50 contatos", ["Acessar busca", "Coletar"]);
  assert.equal(task.title, "Pesquisar leads no LinkedIn");
  assert.equal(task.status, "pending");

  const updatedTask = engine.updateTaskProgress(task.id, 50, "in_progress");
  assert.equal(updatedTask.progressPercent, 50);
  assert.equal(updatedTask.status, "in_progress");

  const completedTask = engine.updateTaskProgress(task.id, 100);
  assert.equal(completedTask.status, "completed");

  // MCP tool call simulation
  const mcpRes = await engine.invokeMcpTool("apollo", "search_contacts", { domain: "anthropic.com" });
  assert.equal(mcpRes.status, "success");
  assert.equal(mcpRes.serverName, "apollo");

  await engine.stop();
});
