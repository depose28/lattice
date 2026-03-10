# @lattice/mcp-server

An MCP (Model Context Protocol) server that exposes the Lattice mental models graph -- 700 mental models connected by 2796 typed edges -- as tools for any MCP-compatible AI agent. Search models, explore connections by type, browse disciplines, and consult the Oracle for situation-specific synthesis.

## Installation

```bash
cd packages/mcp-server
npm install
npm run build
```

## Usage with Claude Desktop

Add the following to your `claude_desktop_config.json` (typically at `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "lattice": {
      "command": "node",
      "args": ["/absolute/path/to/lattice/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Usage with Claude Code

```bash
claude mcp add lattice node /absolute/path/to/lattice/packages/mcp-server/dist/index.js
```

## Available Tools

### search_models

Fuzzy search across model names and summaries. Returns top 10 matches.

```
Input:  { "query": "sunk cost" }
Output: Array of { id, name, discipline, summary, degree }
```

### get_model

Get full details of a model by ID, including all its connections.

```
Input:  { "id": "m042" }
Output: Model details + connections array with neighbor names, edge types, and strengths
```

### get_connections

Get all models connected to a given model, sorted by connection strength.

```
Input:  { "id": "m042" }
Output: { model, connections: [{ id, name, discipline, edgeType, strength }] }
```

### list_disciplines

List all 10 disciplines with model counts.

```
Input:  {}
Output: [{ discipline: "Investing", count: 120 }, ...]
```

### get_models_by_discipline

Get all models in a specific discipline.

```
Input:  { "discipline": "Game Theory" }
Output: Array of { id, name, summary, degree }
```

### find_related

Find models connected by a specific relationship type (or all types).

```
Input:  { "id": "m042", "edge_type": "complementary" }
Output: { model, edgeTypeFilter, related: [...] }
```

Edge types: `complementary`, `structural_kinship`, `tensioning`, `prerequisite`, `inversion`, `cross_discipline_tfidf`, `same_discipline_tfidf`, `same_chapter`.

### oracle

Consult the Lattice Oracle with a decision or situation. Returns a synthesis weaving the most relevant models into a framework, plus 15 models classified by role (supporting, challenging, process).

```
Input:  { "situation": "Should I quit my job to start a company?", "api_key": "sk-ant-..." }
Output: { synthesis: "...", results: [{ nodeId, name, discipline, relevance, role, question, stance }] }
```

## Oracle Setup

The oracle tool calls the Anthropic API directly using `claude-sonnet-4-20250514`. It requires an API key passed per-call via the `api_key` parameter. No server-side key configuration is needed -- the key is never stored.
