import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/mcp/status`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "MCP status unavailable", code: "MCP_STATUS_ERROR" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "MCP status unavailable", code: "MCP_STATUS_ERROR" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", code: "INVALID_INPUT" }, { status: 400 });
  }
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required", code: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_BASE}/mcp/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: body.enabled }),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "MCP status update failed", code: "MCP_STATUS_ERROR" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "MCP status update failed", code: "MCP_STATUS_ERROR" }, { status: 502 });
  }
}
