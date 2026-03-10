import Anthropic from "@anthropic-ai/sdk";
import { getAllNodes } from "./data.js";
// Build compact node list matching the web app format
function buildNodeList() {
    return getAllNodes()
        .map((n) => `${n.id}|${n.name}|${n.discipline}`)
        .join("\n");
}
const SYSTEM_PROMPT = `You are the Oracle of a neural graph of 700 mental models. A user describes a decision, situation, or question. Your job is to:

1. SYNTHESIZE: Write 3-5 sentences that weave the most relevant models into a cohesive framework for their specific situation. This is the primary insight — connect the models, show how they interact, don't just list them. Be opinionated and direct.

2. IDENTIFY: Select the 15 most relevant mental models and classify each by its ROLE in the decision:
   - "supporting": Models that argue FOR a direction, validate an approach, or provide positive evidence
   - "challenging": Models that argue AGAINST, warn of risks, present counterpoints, or urge caution
   - "process": Models about timing, method, sequencing, or HOW to think about the decision

3. For each model, provide:
   - "question": One specific, concrete question this model prompts the user to ask about their situation. Make it pointed and useful, not generic.
   - "stance": What this model argues for or against in this specific decision. Be direct — "Argues for X because Y" or "Warns against X because Y". 1-2 sentences max.

MENTAL MODELS (format: id|name|discipline):
${buildNodeList()}`;
export async function queryOracle(situation, apiKey) {
    const anthropic = new Anthropic({ apiKey });
    const userMessage = `USER QUERY: "${situation.trim()}"

Return a JSON object with this exact structure:
{
  "synthesis": "3-5 sentences weaving the most relevant models into a framework for this specific decision.",
  "results": [
    {
      "nodeId": "m042",
      "name": "Model Name",
      "discipline": "Discipline",
      "relevance": 0.95,
      "role": "supporting",
      "question": "One concrete question this model prompts you to ask.",
      "stance": "What this model argues for or against. Be direct."
    }
  ]
}

Return EXACTLY 15 results sorted by relevance descending. Top result should have relevance ~1.0, decreasing meaningfully.
Respond with ONLY the JSON object, no other text.`;
    const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
        throw new Error("No response from Oracle");
    }
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
    }
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
        return { synthesis: "", results: parsed };
    }
    return {
        synthesis: parsed.synthesis ?? "",
        results: parsed.results ?? [],
    };
}
//# sourceMappingURL=oracle.js.map