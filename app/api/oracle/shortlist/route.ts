import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import nodesJson from "@/public/data/nodes.json";
import type { OracleMessage } from "@/lib/graph/types";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

type NodeRecord = { id: string; name: string; discipline: string };
const nodes = nodesJson as NodeRecord[];
const nodeIds = new Set(nodes.map((n) => n.id));

const compactNodeList = nodes.map((n) => `${n.id}|${n.name}|${n.discipline}`).join("\n");

const SYSTEM_PROMPT = `You are the Oracle of a neural graph of 700 mental models spanning probability, investing, behavioral economics, algorithms, philosophy, game theory, and more.

A user describes a decision, situation, or question. Your job is to select the 25 most relevant mental models for their specific situation.

Think broadly across disciplines. Include models that:
- SUPPORT a direction (provide positive evidence or validation)
- CHALLENGE assumptions (warn of risks, present counterpoints)
- Shape the PROCESS (timing, method, sequencing, how to think about it)

MENTAL MODELS (format: id|name|discipline):
${compactNodeList}`;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  try {
    const clientKey = request.headers.get("X-Anthropic-Api-Key");
    const envKey = process.env.ANTHROPIC_API_KEY;
    const activeKey = clientKey || envKey;

    if (!activeKey) {
      return Response.json(
        { error: "No API key configured. Add your Anthropic API key in Settings." },
        { status: 401 },
      );
    }

    const anthropic = new Anthropic({ apiKey: activeKey });
    const { query, history } = await request.json();

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    const isFollowUp = history && Array.isArray(history) && history.length > 0;

    if (isFollowUp) {
      const trimmed = (history as OracleMessage[]).slice(-8);
      for (const msg of trimmed) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({
      role: "user",
      content: `${isFollowUp ? "FOLLOW-UP QUERY" : "USER QUERY"}: "${query.trim()}"

Return a JSON array of exactly 25 model IDs most relevant to this situation, sorted by relevance:
["m042", "m108", ...]

Respond with ONLY the JSON array, no other text.`,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "No response from Oracle" }, { status: 500 });
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    }

    const candidateIds = JSON.parse(jsonStr) as string[];
    if (!Array.isArray(candidateIds)) {
      return Response.json({ error: "Invalid response format" }, { status: 500 });
    }

    // Filter to valid IDs
    const valid = candidateIds.filter((id) => nodeIds.has(id)).slice(0, 25);

    return Response.json({ candidates: valid });
  } catch (error) {
    console.error("Oracle shortlist error:", error);
    const isAuthError = error instanceof Error && (
      error.message.toLowerCase().includes("auth") ||
      error.message.toLowerCase().includes("key") ||
      error.message.toLowerCase().includes("401")
    );
    return Response.json(
      { error: isAuthError ? "Invalid API key" : "Failed to process request" },
      { status: isAuthError ? 401 : 500 },
    );
  }
}
