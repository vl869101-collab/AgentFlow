import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExpression,
  evaluateInnerExpression,
  buildExpressionContext,
  ExpressionSecurityError,
  getByPath,
} from "../src/services/expressions.js";

describe("AST Expression Evaluator (acorn whitelist)", () => {
  const baseContext = buildExpressionContext({
    item: {
      json: {
        user: { name: "Alice", role: "admin", age: 30 },
        scores: [10, 20, 30],
        active: true,
        settings: { theme: "dark" },
      },
    },
    executionId: "exec-123",
    workflowId: "wf-456",
    workflowName: "Demo Workflow",
  });

  it("evaluates valid benign expressions and preserves primitive types", () => {
    assert.equal(evaluateExpression("{{ $json.user.name }}", baseContext), "Alice");
    assert.equal(evaluateExpression("{{ $json.user.age }}", baseContext), 30);
    assert.equal(evaluateExpression("{{ $json.active }}", baseContext), true);
    assert.deepEqual(evaluateExpression("{{ $json.scores }}", baseContext), [10, 20, 30]);
    assert.equal(evaluateExpression("{{ $json.user.age * 2 }}", baseContext), 60);
    assert.equal(
      evaluateExpression("{{ $json.user.age > 18 ? 'adult' : 'minor' }}", baseContext),
      "adult"
    );
  });

  it("interpolates multiple expressions within text", () => {
    const text = "Hello {{ $json.user.name }}, your score is {{ $json.scores[0] + 5 }}!";
    assert.equal(evaluateExpression(text, baseContext), "Hello Alice, your score is 15!");
  });

  it("supports safe standard built-ins (Math, JSON, Date, String, Number, Boolean)", () => {
    assert.equal(evaluateExpression("{{ Math.max(10, 50, 25) }}", baseContext), 50);
    assert.equal(evaluateExpression("{{ String($json.user.age).padStart(4, '0') }}", baseContext), "0030");
    assert.equal(evaluateExpression("{{ Boolean($json.user.name) }}", baseContext), true);
    assert.equal(evaluateExpression("{{ parseInt('42px', 10) }}", baseContext), 42);
    assert.equal(
      evaluateExpression("{{ JSON.stringify({ a: 1 }) }}", baseContext),
      '{"a":1}'
    );
  });

  it("provides standard context variables ($executionId, $workflowId, $workflow, $now, $today)", () => {
    assert.equal(evaluateExpression("{{ $executionId }}", baseContext), "exec-123");
    assert.equal(evaluateExpression("{{ $workflowId }}", baseContext), "wf-456");
    assert.equal(evaluateExpression("{{ $workflow.name }}", baseContext), "Demo Workflow");
    assert.ok(typeof evaluateExpression("{{ $now }}", baseContext) === "string");
    assert.ok(typeof evaluateExpression("{{ $today }}", baseContext) === "string");
  });

  it("blocks dangerous global identifiers with ExpressionSecurityError", () => {
    const forbiddenIdentifiers = [
      "process",
      "globalThis",
      "global",
      "eval",
      "Function",
      "fetch",
      "import",
      "require",
      "window",
      "document",
      "this",
    ];

    for (const ident of forbiddenIdentifiers) {
      assert.throws(
        () => evaluateExpression(`{{ ${ident} }}`, baseContext),
        (err: any) => {
          return (
            err instanceof ExpressionSecurityError &&
            (err.code === "FORBIDDEN_IDENTIFIER" || err.code === "DISALLOWED_SYNTAX" || err.code === "SYNTAX_ERROR")
          );
        },
        `Expected identifier '${ident}' to be blocked`
      );
    }
  });

  it("blocks prototype pollution and prototype traversal properties", () => {
    const forbiddenProps = [
      "__proto__",
      "constructor",
      "prototype",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__",
    ];

    for (const prop of forbiddenProps) {
      assert.throws(
        () => evaluateExpression(`{{ $json.${prop} }}`, baseContext),
        (err: any) => err instanceof ExpressionSecurityError && err.code === "FORBIDDEN_PROPERTY",
        `Expected property '${prop}' access via dot notation to be blocked`
      );

      assert.throws(
        () => evaluateExpression(`{{ $json['${prop}'] }}`, baseContext),
        (err: any) => err instanceof ExpressionSecurityError && err.code === "FORBIDDEN_PROPERTY",
        `Expected property '${prop}' access via bracket notation to be blocked`
      );

      assert.throws(
        () => getByPath({ a: 1 }, `a.${prop}`),
        (err: any) => err instanceof ExpressionSecurityError && err.code === "FORBIDDEN_PROPERTY"
      );
    }
  });

  it("rejects statement execution, loops, assignments, and variable declarations", () => {
    const maliciousCodes = [
      "let x = 10",
      "const y = 20",
      "var z = 30",
      "while(true) {}",
      "for(let i=0; i<10; i++) {}",
      "$json.user.age = 100",
      "$json.user.age++",
      "return 42",
      "throw new Error('boom')",
      "1; 2; 3",
    ];

    for (const code of maliciousCodes) {
      assert.throws(
        () => evaluateExpression(`{{ ${code} }}`, baseContext),
        (err: any) => err instanceof ExpressionSecurityError,
        `Expected statement '${code}' to be rejected`
      );
    }
  });

  it("supports safe chained calls and optional member access", () => {
    assert.equal(evaluateExpression("{{ $json.user?.name }}", baseContext), "Alice");
    assert.equal(evaluateExpression("{{ $json.nonExistent?.prop }}", baseContext), undefined);
    assert.equal(evaluateExpression("{{ $json.user.name.toUpperCase() }}", baseContext), "ALICE");
  });
});
