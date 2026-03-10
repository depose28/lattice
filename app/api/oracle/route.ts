import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import nodesJson from "@/public/data/nodes.json";
import edgesJson from "@/public/data/edges.json";
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

// ─── Pre-computed data ───

type NodeRecord = { id: string; name: string; discipline: string; summary: string };
const nodes = nodesJson as NodeRecord[];
const nodeMap = new Map(nodes.map((n) => [n.id, n]));

type EdgeRecord = { source: string; target: string; type: string; strength: number };
const edgesByNode = new Map<string, Array<{ neighborId: string; type: string; strength: number }>>();
for (const e of edgesJson as EdgeRecord[]) {
  if (!edgesByNode.has(e.source)) edgesByNode.set(e.source, []);
  if (!edgesByNode.has(e.target)) edgesByNode.set(e.target, []);
  edgesByNode.get(e.source)!.push({ neighborId: e.target, type: e.type, strength: e.strength });
  edgesByNode.get(e.target)!.push({ neighborId: e.source, type: e.type, strength: e.strength });
}

const EDGE_TYPE_LABELS: Record<string, string> = {
  cross_discipline_tfidf: "cross-discipline",
  structural_kinship: "structural kinship",
  complementary: "complementary",
  tensioning: "tension",
  inversion: "inversion",
  prerequisite: "prerequisite",
  same_chapter: "same chapter",
  same_discipline_tfidf: "same discipline",
};

function buildSystemPrompt(candidateIds: string[]): string {
  const candidateSet = new Set(candidateIds);

  const profiles = candidateIds.map((id) => {
    const node = nodeMap.get(id);
    if (!node) return null;

    // Edges between this candidate and other candidates
    const connections = (edgesByNode.get(id) ?? [])
      .filter((e) => candidateSet.has(e.neighborId))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6)
      .map((e) => {
        const neighbor = nodeMap.get(e.neighborId);
        const typeLabel = EDGE_TYPE_LABELS[e.type] ?? e.type;
        return `  → ${neighbor?.name ?? e.neighborId} (${typeLabel}, ${Math.round(e.strength * 100)}%)`;
      });

    let profile = `[${node.id}] ${node.name} — ${node.discipline}\n${node.summary}`;
    if (connections.length > 0) {
      profile += `\nConnections to other candidates:\n${connections.join("\n")}`;
    }
    return profile;
  }).filter(Boolean);

  return `You are the Oracle of a neural graph of 700 mental models. Below are 25 candidate models pre-selected for relevance to the user's situation. Each includes its description and graph connections to other candidates.

The connection types tell you how models relate:
- complementary: strengthen each other when combined
- tension: create productive friction — opposing perspectives
- structural kinship: similar structure across different domains
- cross-discipline: share concepts across fields
- prerequisite: one builds understanding for the other
- inversion: direct opposites

Your job:

1. SYNTHESIZE: Write 3-5 sentences weaving models into a cohesive thinking framework. Show how models interact — which reinforce each other (complementary connections), which create productive tension, which sequence matters (prerequisites). Be opinionated and direct. Don't hedge. Don't just list models — connect them.

2. SELECT the 15 most relevant and classify each by ROLE:
   - "supporting": Argues FOR a direction, validates, provides evidence
   - "challenging": Argues AGAINST, warns of risks, counterpoints
   - "process": About timing, method, sequencing, HOW to think about it

3. For each model:
   - "question": One pointed question this model forces you to confront. Not generic. Specific to the situation. Vary your openings: "If...", "What happens when...", "Have you considered...", "At what point does..."
   - "stance": What this model argues here. If it interacts with another selected model (tension, complement), reference that. Direct: "Argues X because Y" or "Warns that X, especially given [other model]'s insight about Y." 1-2 sentences.

CANDIDATE MODELS:
${profiles.join("\n\n")}`;
}

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
    const { query, candidates, history } = await request.json();

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    // Validate candidates
    const candidateIds: string[] = Array.isArray(candidates)
      ? candidates.filter((id: unknown) => typeof id === "string" && nodeMap.has(id as string)).slice(0, 25) as string[]
      : [];

    if (candidateIds.length === 0) {
      return Response.json({ error: "No valid candidate models provided" }, { status: 400 });
    }

    const trimmedQuery = query.trim();
    const isFollowUp = history && Array.isArray(history) && history.length > 0;

    const systemPrompt = buildSystemPrompt(candidateIds);

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (isFollowUp) {
      const trimmed = (history as OracleMessage[]).slice(-8);
      for (const msg of trimmed) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({
      role: "user",
      content: `${isFollowUp ? "FOLLOW-UP QUERY" : "USER QUERY"}: "${trimmedQuery}"

Return a JSON object with this exact structure:
{
  "synthesis": "3-5 sentences weaving models into a framework. Reference how models interact.",
  "results": [
    {
      "nodeId": "m042",
      "name": "Model Name",
      "discipline": "Discipline",
      "relevance": 0.95,
      "role": "supporting",
      "question": "One concrete question this model forces you to confront.",
      "stance": "What this model argues. Reference connections to other models."
    }
  ]
}

Return EXACTLY 15 results from the candidates, sorted by relevance descending.
Respond with ONLY the JSON object, no other text.`,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3500,
      system: systemPrompt,
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

    const parsed = JSON.parse(jsonStr);

    if (Array.isArray(parsed)) {
      return Response.json({ query: trimmedQuery, synthesis: "", results: parsed });
    }

    return Response.json({
      query: trimmedQuery,
      synthesis: (parsed as { synthesis?: string }).synthesis ?? "",
      results: (parsed as { results?: unknown[] }).results ?? [],
    });
  } catch (error) {
    console.error("Oracle API error:", error);
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
