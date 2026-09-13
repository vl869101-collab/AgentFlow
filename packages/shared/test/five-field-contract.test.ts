import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fiveFieldContractSchema,
  validateFiveFieldContract,
} from "../src/five-field-contract.js";

describe("5-Field Contract Schema (Job, Sources, Judgment, Output, Forbidden)", () => {
  it("accepts valid internal action with all 5 fields", () => {
    const validInternal = {
      job: "Extract customer intent from support message",
      sources: ["node-webhook", "node-history"],
      judgment: { confidenceThreshold: 0.85, reasoning: "chain-of-thought" },
      output: { intent: "string", urgency: "number" },
      forbidden: ["Do not disclose internal API keys"],
      isExternalAction: false,
    };

    const parsed = validateFiveFieldContract(validInternal);
    assert.equal(parsed.job, "Extract customer intent from support message");
    assert.deepEqual(parsed.sources, ["node-webhook", "node-history"]);
    assert.equal(parsed.isExternalAction, false);
  });

  it("accepts valid internal action with empty forbidden array", () => {
    const valid = {
      job: "Format data to markdown table",
      sources: ["node-1"],
      judgment: "Standard markdown formatting",
      output: "markdown string",
      forbidden: [],
      isExternalAction: false,
    };

    const parsed = validateFiveFieldContract(valid);
    assert.equal(parsed.job, "Format data to markdown table");
    assert.deepEqual(parsed.forbidden, []);
  });

  it("accepts valid external action when forbidden rules are provided", () => {
    const validExternal = {
      job: "Send automated notification email to customer",
      sources: ["node-order-status"],
      judgment: "Only send if order is finalized and customer opted in",
      output: { messageId: "string", delivered: "boolean" },
      forbidden: [
        "Do not send marketing content without opt-in",
        "Do not email unsubscribed users",
      ],
      isExternalAction: true,
    };

    const parsed = validateFiveFieldContract(validExternal);
    assert.equal(parsed.isExternalAction, true);
    assert.equal(parsed.forbidden.length, 2);
  });

  it("rejects external action when forbidden array is missing or empty", () => {
    const invalidExternalEmpty = {
      job: "Charge credit card via Stripe API",
      sources: ["node-cart"],
      judgment: "Verify funds and fraud risk < 0.1",
      output: { transactionId: "string" },
      forbidden: [],
      isExternalAction: true,
    };

    assert.throws(
      () => validateFiveFieldContract(invalidExternalEmpty),
      /Autonomous nodes performing external actions must define at least one 'forbidden' rule/
    );

    const invalidExternalOmitted = {
      job: "Charge credit card via Stripe API",
      sources: ["node-cart"],
      judgment: "Verify funds",
      output: { transactionId: "string" },
      isExternalAction: true,
    };

    assert.throws(
      () => validateFiveFieldContract(invalidExternalOmitted),
      /Autonomous nodes performing external actions must define at least one 'forbidden' rule/
    );
  });

  it("supports capitalized field aliases (Job, Sources, Judgment, Output, Forbidden, IsExternalAction)", () => {
    const capitalized = {
      Job: "Execute database mutation",
      Sources: ["node-input"],
      Judgment: "Check foreign key constraints",
      Output: { updatedRows: 1 },
      Forbidden: ["Do not drop tables", "Do not truncate"],
      IsExternalAction: true,
    };

    const parsed = validateFiveFieldContract(capitalized);
    assert.equal(parsed.job, "Execute database mutation");
    assert.deepEqual(parsed.sources, ["node-input"]);
    assert.deepEqual(parsed.forbidden, ["Do not drop tables", "Do not truncate"]);
    assert.equal(parsed.isExternalAction, true);
  });

  it("rejects invalid contracts missing job or judgment or output", () => {
    assert.throws(() =>
      validateFiveFieldContract({
        sources: [],
        judgment: "test",
        output: "test",
      })
    );

    assert.throws(() =>
      validateFiveFieldContract({
        job: "Test",
        sources: [],
        output: "test",
      })
    );

    assert.throws(() =>
      validateFiveFieldContract({
        job: "Test",
        sources: [],
        judgment: "test",
      })
    );
  });
});
