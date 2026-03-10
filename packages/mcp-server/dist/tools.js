import { searchModels, getModel, getConnections, listDisciplines, getModelsByDiscipline, findRelated, EDGE_TYPES, } from "./data.js";
import { queryOracle } from "./oracle.js";
// --- Tool definitions (JSON Schema for MCP) ---
export const toolDefinitions = [
    {
        name: "search_models",
        description: "Fuzzy search across 700 mental model names and summaries. Returns top 10 matches ranked by relevance.",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to match against model names and summaries",
                },
            },
            required: ["query"],
        },
    },
    {
        name: "get_model",
        description: "Get full details of a mental model by ID, including all its connections to other models.",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: 'Model ID (e.g. "m042")',
                },
            },
            required: ["id"],
        },
    },
    {
        name: "get_connections",
        description: "Get all models connected to a given model, sorted by connection strength (strongest first).",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: 'Model ID (e.g. "m042")',
                },
            },
            required: ["id"],
        },
    },
    {
        name: "list_disciplines",
        description: "List all 10 disciplines in the mental models graph with the number of models in each.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "get_models_by_discipline",
        description: "Get all mental models belonging to a specific discipline.",
        inputSchema: {
            type: "object",
            properties: {
                discipline: {
                    type: "string",
                    description: 'Discipline name (e.g. "Game Theory", "Probability", "Investing")',
                },
            },
            required: ["discipline"],
        },
    },
    {
        name: "find_related",
        description: "Find models connected to a given model, optionally filtered by edge type. Edge types: complementary, structural_kinship, tensioning, prerequisite, inversion, cross_discipline_tfidf, same_discipline_tfidf, same_chapter.",
        inputSchema: {
            type: "object",
            properties: {
                id: {
                    type: "string",
                    description: 'Model ID (e.g. "m042")',
                },
                edge_type: {
                    type: "string",
                    description: `Optional edge type filter. One of: ${EDGE_TYPES.join(", ")}`,
                },
            },
            required: ["id"],
        },
    },
    {
        name: "oracle",
        description: "Consult the Lattice Oracle: describe a decision, situation, or question, and get a synthesis of the most relevant mental models with their roles (supporting/challenging/process). Requires your own Anthropic API key.",
        inputSchema: {
            type: "object",
            properties: {
                situation: {
                    type: "string",
                    description: "The decision, situation, or question to analyze through the lens of mental models",
                },
                api_key: {
                    type: "string",
                    description: "Your Anthropic API key (required for this tool)",
                },
            },
            required: ["situation", "api_key"],
        },
    },
];
// --- Tool handlers ---
export async function handleTool(name, args) {
    switch (name) {
        case "search_models": {
            const query = args.query;
            if (!query)
                return JSON.stringify({ error: "query is required" });
            const results = searchModels(query);
            return JSON.stringify(results.map((n) => ({
                id: n.id,
                name: n.name,
                discipline: n.discipline,
                summary: n.summary,
                degree: n.degree,
            })), null, 2);
        }
        case "get_model": {
            const id = args.id;
            if (!id)
                return JSON.stringify({ error: "id is required" });
            const model = getModel(id);
            if (!model)
                return JSON.stringify({ error: `Model "${id}" not found` });
            const connections = getConnections(id);
            return JSON.stringify({
                ...model,
                connections: connections.map((c) => ({
                    id: c.neighbor.id,
                    name: c.neighbor.name,
                    discipline: c.neighbor.discipline,
                    edgeType: c.edgeType,
                    strength: c.strength,
                })),
            }, null, 2);
        }
        case "get_connections": {
            const id = args.id;
            if (!id)
                return JSON.stringify({ error: "id is required" });
            const model = getModel(id);
            if (!model)
                return JSON.stringify({ error: `Model "${id}" not found` });
            const connections = getConnections(id);
            return JSON.stringify({
                model: { id: model.id, name: model.name },
                connections: connections.map((c) => ({
                    id: c.neighbor.id,
                    name: c.neighbor.name,
                    discipline: c.neighbor.discipline,
                    edgeType: c.edgeType,
                    strength: c.strength,
                })),
            }, null, 2);
        }
        case "list_disciplines": {
            const disciplines = listDisciplines();
            return JSON.stringify(disciplines, null, 2);
        }
        case "get_models_by_discipline": {
            const discipline = args.discipline;
            if (!discipline)
                return JSON.stringify({ error: "discipline is required" });
            const models = getModelsByDiscipline(discipline);
            if (models.length === 0) {
                const available = listDisciplines().map((d) => d.discipline);
                return JSON.stringify({
                    error: `No models found for discipline "${discipline}". Available disciplines: ${available.join(", ")}`,
                });
            }
            return JSON.stringify(models.map((n) => ({
                id: n.id,
                name: n.name,
                summary: n.summary,
                degree: n.degree,
            })), null, 2);
        }
        case "find_related": {
            const id = args.id;
            const edgeType = args.edge_type;
            if (!id)
                return JSON.stringify({ error: "id is required" });
            const model = getModel(id);
            if (!model)
                return JSON.stringify({ error: `Model "${id}" not found` });
            if (edgeType && !EDGE_TYPES.includes(edgeType)) {
                return JSON.stringify({
                    error: `Invalid edge_type "${edgeType}". Must be one of: ${EDGE_TYPES.join(", ")}`,
                });
            }
            const related = findRelated(id, edgeType);
            return JSON.stringify({
                model: { id: model.id, name: model.name },
                edgeTypeFilter: edgeType ?? "all",
                related: related.map((c) => ({
                    id: c.neighbor.id,
                    name: c.neighbor.name,
                    discipline: c.neighbor.discipline,
                    edgeType: c.edgeType,
                    strength: c.strength,
                })),
            }, null, 2);
        }
        case "oracle": {
            const situation = args.situation;
            const apiKey = args.api_key;
            if (!situation)
                return JSON.stringify({ error: "situation is required" });
            if (!apiKey)
                return JSON.stringify({ error: "api_key is required" });
            try {
                const result = await queryOracle(situation, apiKey);
                return JSON.stringify(result, null, 2);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                return JSON.stringify({ error: `Oracle failed: ${message}` });
            }
        }
        default:
            return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
}
//# sourceMappingURL=tools.js.map