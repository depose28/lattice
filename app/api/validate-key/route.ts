import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

// Simple in-memory rate limiter: max 5 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
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

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return Response.json({ valid: false, error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const apiKey = request.headers.get("X-Anthropic-Api-Key");

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return Response.json({ valid: false, error: "No key provided" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey: apiKey.trim() });
    // Minimal API call to verify the key works
    await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    });
    return Response.json({ valid: true });
  } catch {
    // Always return generic error — never leak Anthropic SDK error details
    return Response.json(
      { valid: false, error: "Invalid API key" },
      { status: 401 },
    );
  }
}
