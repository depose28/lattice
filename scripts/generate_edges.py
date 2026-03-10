#!/usr/bin/env python3
"""
Generate high-quality edges.json for Lattice using semantic embeddings + Claude classification.

Pipeline:
1. Load nodes.json, clean summaries
2. Embed all 700 models with voyage-3
3. Compute cosine similarity matrix
4. Select top candidate pairs (adaptive threshold)
5. Classify edge types with Claude haiku
6. Build final edge list
7. Save edges.json + update node degrees

Requirements: pip install voyageai anthropic numpy
Environment: VOYAGE_API_KEY, ANTHROPIC_API_KEY
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from collections import Counter

import numpy as np

# ── Config ──────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "public" / "data"
MODELS_PATH = Path(__file__).parent.parent / "public" / "data" / "mental-models-700.json"
NODES_PATH = DATA_DIR / "nodes.json"
EDGES_OUTPUT = DATA_DIR / "edges.json"

EMBED_MODEL = "voyage-3"
EMBED_BATCH_SIZE = 10  # small batches to stay under free-tier 10K TPM / 3 RPM
EMBED_DELAY = 21       # seconds between batches (3 RPM = 1 per 20s)

CLASSIFY_MODEL = "claude-haiku-4-5-20251001"
CLASSIFY_BATCH_SIZE = 40  # pairs per Claude call

# Adaptive thresholds — take top-K pairs rather than fixed similarity cutoff
CROSS_DISCIPLINE_CANDIDATES = 4000   # top N cross-discipline pairs to classify
SAME_DISCIPLINE_CANDIDATES = 1500    # top N same-discipline pairs to classify
MIN_SIMILARITY = 0.55                # absolute floor — ignore below this

# Target edge budget
TARGET_EDGES_MIN = 3500
TARGET_EDGES_MAX = 5500

# Edge types that match lib/constants.ts EDGE_PARTICLE_COLORS
VALID_EDGE_TYPES = {
    "structural_kinship",
    "complementary",
    "tensioning",
    "inversion",
    "prerequisite",
    "cross_discipline_tfidf",
    "same_discipline_tfidf",
    "same_chapter",
}

# Type mapping from Claude's response to our canonical types
TYPE_ALIASES = {
    "cross_discipline": "cross_discipline_tfidf",
    "same_domain": "same_discipline_tfidf",
    "same_discipline": "same_discipline_tfidf",
    "kinship": "structural_kinship",
}


def clean_description(description: str) -> str:
    """Remove 'Title\\n[name]Model' prefix from raw description."""
    # Pattern: "Title\n<title text>Model<actual content>"
    text = re.sub(r"^Title\s*\n.*?Model", "", description, count=1).strip()
    if not text:
        text = description  # fallback
    return text


def load_models() -> list[dict]:
    """Load models from mental-models-700.json (rich descriptions) with IDs from nodes.json."""
    print(f"Loading models from {MODELS_PATH}...")
    with open(MODELS_PATH) as f:
        raw_models = json.load(f)

    # Load nodes.json for ID mapping (m000, m001, ...) and to verify alignment
    with open(NODES_PATH) as f:
        nodes = json.load(f)

    # Build name→id lookup from nodes.json
    node_by_name = {n["name"]: n for n in nodes}

    models = []
    unmatched = []
    for i, raw in enumerate(raw_models):
        name = raw["Name"]
        node = node_by_name.get(name)
        if not node:
            unmatched.append(name)
            model_id = f"m{i:03d}"  # fallback: positional ID
        else:
            model_id = node["id"]

        cleaned = clean_description(raw["Description"])

        # For embedding: name + first 1000 chars of description (rich context)
        embed_text = f"{name}: {cleaned[:1000]}"

        # For classification: name + discipline + first 300 chars
        classify_text = f"{name} ({raw['Discipline']}): {cleaned[:300]}"

        models.append(
            {
                "id": model_id,
                "name": name,
                "discipline": raw["Discipline"],
                "chapter": raw["Chapter"],
                "properties": raw.get("Properties", ""),
                "description": cleaned,
                "embed_text": embed_text,
                "classify_text": classify_text,
            }
        )

    if unmatched:
        print(f"  ⚠ {len(unmatched)} models not found in nodes.json: {unmatched[:5]}...")

    print(f"  Loaded {len(models)} models across {len(set(m['discipline'] for m in models))} disciplines")
    desc_lengths = [len(m['description']) for m in models]
    print(f"  Description lengths: min={min(desc_lengths)}, avg={sum(desc_lengths)//len(desc_lengths)}, max={max(desc_lengths)}")
    return models


def embed_models(models: list[dict]) -> np.ndarray:
    """Embed all models using voyage-3. Returns (N, D) matrix."""
    import voyageai

    client = voyageai.Client()
    texts = [m["embed_text"] for m in models]
    all_embeddings = []

    total_batches = (len(texts) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE
    print(f"\nEmbedding {len(texts)} models with {EMBED_MODEL} ({total_batches} batches, ~{total_batches * EMBED_DELAY // 60}min)...")
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i : i + EMBED_BATCH_SIZE]
        result = client.embed(batch, model=EMBED_MODEL, input_type="document")
        all_embeddings.extend(result.embeddings)
        done = min(i + EMBED_BATCH_SIZE, len(texts))
        print(f"  Embedded {done}/{len(texts)}")
        # Rate limit: wait between batches (free tier = 3 RPM)
        if done < len(texts):
            time.sleep(EMBED_DELAY)

    embeddings = np.array(all_embeddings, dtype=np.float32)
    print(f"  Embedding matrix: {embeddings.shape}")
    return embeddings


def compute_similarities(embeddings: np.ndarray) -> np.ndarray:
    """Compute cosine similarity matrix. Returns (N, N) matrix."""
    print("\nComputing cosine similarity matrix...")
    # Normalize rows
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normed = embeddings / norms
    # Cosine similarity = dot product of normalized vectors
    sim_matrix = normed @ normed.T
    # Zero out diagonal (no self-edges)
    np.fill_diagonal(sim_matrix, 0)

    total_pairs = len(embeddings) * (len(embeddings) - 1) // 2
    above_floor = np.sum(sim_matrix > MIN_SIMILARITY) // 2  # each pair counted twice
    print(f"  Total pairs: {total_pairs:,}")
    print(f"  Pairs above {MIN_SIMILARITY} threshold: {above_floor:,}")
    return sim_matrix


def select_candidates(
    models: list[dict], sim_matrix: np.ndarray
) -> tuple[list[tuple], list[tuple]]:
    """Select top candidate pairs for classification, split by cross/same discipline."""
    print("\nSelecting candidate pairs...")
    n = len(models)

    cross_pairs = []  # (i, j, similarity)
    same_pairs = []

    for i in range(n):
        for j in range(i + 1, n):
            sim = float(sim_matrix[i, j])
            if sim < MIN_SIMILARITY:
                continue
            if models[i]["discipline"] != models[j]["discipline"]:
                cross_pairs.append((i, j, sim))
            else:
                same_pairs.append((i, j, sim))

    # Sort by similarity descending
    cross_pairs.sort(key=lambda x: -x[2])
    same_pairs.sort(key=lambda x: -x[2])

    # Take top-K
    cross_selected = cross_pairs[:CROSS_DISCIPLINE_CANDIDATES]
    same_selected = same_pairs[:SAME_DISCIPLINE_CANDIDATES]

    print(f"  Cross-discipline candidates: {len(cross_selected)} (from {len(cross_pairs)} above floor)")
    if cross_selected:
        print(f"    Similarity range: {cross_selected[-1][2]:.3f} – {cross_selected[0][2]:.3f}")
    print(f"  Same-discipline candidates: {len(same_selected)} (from {len(same_pairs)} above floor)")
    if same_selected:
        print(f"    Similarity range: {same_selected[-1][2]:.3f} – {same_selected[0][2]:.3f}")

    return cross_selected, same_selected


def classify_pairs(
    models: list[dict],
    pairs: list[tuple],
    pair_context: str,
) -> dict[tuple, str]:
    """Classify pairs using Claude haiku. Returns {(i,j): edge_type}."""
    import anthropic

    client = anthropic.Anthropic()
    results = {}
    total = len(pairs)

    if total == 0:
        return results

    print(f"\nClassifying {total} {pair_context} pairs with {CLASSIFY_MODEL}...")

    for batch_start in range(0, total, CLASSIFY_BATCH_SIZE):
        batch = pairs[batch_start : batch_start + CLASSIFY_BATCH_SIZE]

        # Build pair descriptions
        pair_lines = []
        for idx, (i, j, sim) in enumerate(batch):
            pair_lines.append(
                f"PAIR {idx}:\n"
                f"  A: {models[i]['classify_text']}\n"
                f"  B: {models[j]['classify_text']}\n"
                f"  Similarity: {sim:.3f}"
            )

        prompt = f"""Classify each pair of mental models into exactly one relationship type.

RELATIONSHIP TYPES:
- structural_kinship: Deep structural parallel — same underlying pattern, different domains (e.g., "Power Laws" and "Network Effects" share scale-free dynamics)
- complementary: Models that work together — using one naturally leads to or enhances the other (e.g., "Bayes Theorem" and "Base Rate Neglect")
- tensioning: Models that pull in opposite directions or create productive tension (e.g., "Sunk Cost" vs "Option Value")
- inversion: One model is essentially the inverse/negation of the other (e.g., "Margin of Safety" vs "Overconfidence")
- prerequisite: Understanding model A is necessary to properly understand model B (e.g., "Probability Basics" → "Bayesian Updating")
- {"cross_discipline_tfidf: General thematic similarity across disciplines — related but no deep structural connection" if "cross" in pair_context else "same_discipline_tfidf: General similarity within the same discipline — related but no deep structural connection"}
- skip: No meaningful relationship despite surface similarity

IMPORTANT: Be selective with the rich types (kinship, complementary, tensioning, inversion, prerequisite). Only use them when there's a genuine deep connection. Most pairs will be {"cross_discipline_tfidf" if "cross" in pair_context else "same_discipline_tfidf"} or skip.

{chr(10).join(pair_lines)}

Return ONLY a JSON array of objects, one per pair, in order:
[{{"pair": 0, "type": "structural_kinship"}}, {{"pair": 1, "type": "skip"}}, ...]"""

        try:
            response = client.messages.create(
                model=CLASSIFY_MODEL,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )

            text = response.content[0].text.strip()
            # Handle markdown code blocks
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\s*", "", text)
                text = re.sub(r"```\s*$", "", text)

            classifications = json.loads(text)

            for entry in classifications:
                pair_idx = entry["pair"]
                edge_type = entry["type"]

                # Map aliases
                if edge_type in TYPE_ALIASES:
                    edge_type = TYPE_ALIASES[edge_type]

                if pair_idx < len(batch) and edge_type != "skip" and edge_type in VALID_EDGE_TYPES:
                    i, j, sim = batch[pair_idx]
                    results[(i, j)] = edge_type

        except (json.JSONDecodeError, KeyError, anthropic.APIError) as e:
            print(f"    ⚠ Batch error at {batch_start}: {e}")
            # On error, fall back to generic type for this batch
            default_type = "cross_discipline_tfidf" if "cross" in pair_context else "same_discipline_tfidf"
            for i, j, sim in batch:
                results[(i, j)] = default_type

        done = min(batch_start + CLASSIFY_BATCH_SIZE, total)
        print(f"  Classified {done}/{total} ({len(results)} kept so far)")

        # Rate limit: ~50 req/min for haiku
        if batch_start + CLASSIFY_BATCH_SIZE < total:
            time.sleep(0.5)

    return results


def build_edges(
    models: list[dict],
    cross_classified: dict[tuple, str],
    same_classified: dict[tuple, str],
    sim_matrix: np.ndarray,
    same_pairs_sorted: list[tuple],
) -> list[dict]:
    """Build final edge list."""
    print("\nBuilding edge list...")
    edges = []
    seen = set()

    def add_edge(i: int, j: int, edge_type: str, strength: float):
        key = (min(i, j), max(i, j))
        if key in seen:
            return
        seen.add(key)
        edges.append(
            {
                "source": models[i]["id"],
                "target": models[j]["id"],
                "type": edge_type,
                "strength": round(strength, 3),
                "label": "",
            }
        )

    # 1. Add all classified cross-discipline edges
    for (i, j), edge_type in cross_classified.items():
        add_edge(i, j, edge_type, float(sim_matrix[i, j]))

    # 2. Add all classified same-discipline edges
    for (i, j), edge_type in same_classified.items():
        add_edge(i, j, edge_type, float(sim_matrix[i, j]))

    # 3. Add same-chapter edges (only for non-"General" chapters)
    chapter_edges = 0
    for i in range(len(models)):
        if models[i]["chapter"] == "General":
            continue
        for j in range(i + 1, len(models)):
            if models[j]["chapter"] == models[i]["chapter"]:
                add_edge(i, j, "same_chapter", float(sim_matrix[i, j]))
                chapter_edges += 1

    print(f"  Same-chapter edges added: {chapter_edges}")

    # 4. If under target, fill with top unclassified same-discipline pairs
    if len(edges) < TARGET_EDGES_MIN:
        fill_count = 0
        for i, j, sim in same_pairs_sorted:
            if len(edges) >= TARGET_EDGES_MIN:
                break
            key = (min(i, j), max(i, j))
            if key not in seen:
                add_edge(i, j, "same_discipline_tfidf", sim)
                fill_count += 1
        print(f"  Fill edges added: {fill_count}")

    return edges


def update_node_degrees(edges: list[dict]):
    """Update degree field in nodes.json based on new edges."""
    print("\nUpdating node degrees in nodes.json...")
    with open(NODES_PATH) as f:
        nodes = json.load(f)

    degree_count = Counter()
    for edge in edges:
        degree_count[edge["source"]] += 1
        degree_count[edge["target"]] += 1

    for node in nodes:
        node["degree"] = degree_count.get(node["id"], 0)

    with open(NODES_PATH, "w") as f:
        json.dump(nodes, f, indent=2)

    print(f"  Updated {len(nodes)} nodes")


def print_summary(edges: list[dict], models: list[dict]):
    """Print final summary."""
    print("\n" + "=" * 60)
    print("EDGE GENERATION COMPLETE")
    print("=" * 60)

    print(f"\nTotal edges: {len(edges)}")

    type_counts = Counter(e["type"] for e in edges)
    print("\nBy type:")
    for t, c in type_counts.most_common():
        pct = c / len(edges) * 100
        print(f"  {t:30s} {c:5d}  ({pct:.1f}%)")

    # Strength stats
    strengths = [e["strength"] for e in edges]
    print(f"\nStrength: min={min(strengths):.3f}, max={max(strengths):.3f}, "
          f"mean={sum(strengths)/len(strengths):.3f}")

    # Top hub nodes
    degree = Counter()
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1

    model_lookup = {m["id"]: m["name"] for m in models}
    print("\nTop 10 hub nodes by degree:")
    for node_id, deg in degree.most_common(10):
        print(f"  {node_id} | {model_lookup.get(node_id, '?'):40s} | degree {deg}")

    # Discipline coverage
    disc_edges = Counter()
    for e in edges:
        src_disc = next((m["discipline"] for m in models if m["id"] == e["source"]), "?")
        tgt_disc = next((m["discipline"] for m in models if m["id"] == e["target"]), "?")
        if src_disc != tgt_disc:
            disc_edges["cross-discipline"] += 1
        else:
            disc_edges[src_disc] += 1

    print("\nEdges by discipline context:")
    for ctx, c in disc_edges.most_common():
        print(f"  {ctx:40s} {c:5d}")

    # Rich vs generic types
    rich_types = {"structural_kinship", "complementary", "tensioning", "inversion", "prerequisite"}
    rich_count = sum(c for t, c in type_counts.items() if t in rich_types)
    generic_count = sum(c for t, c in type_counts.items() if t not in rich_types)
    print(f"\nRich semantic edges: {rich_count} ({rich_count/len(edges)*100:.1f}%)")
    print(f"Generic/chapter edges: {generic_count} ({generic_count/len(edges)*100:.1f}%)")


def main():
    # ── Preflight checks ──
    if not MODELS_PATH.exists():
        print(f"ERROR: {MODELS_PATH} not found")
        sys.exit(1)

    if not NODES_PATH.exists():
        print(f"ERROR: {NODES_PATH} not found (needed for ID mapping)")
        sys.exit(1)

    if not os.environ.get("VOYAGE_API_KEY"):
        print("ERROR: VOYAGE_API_KEY not set in environment")
        print("  Run: export VOYAGE_API_KEY=your-key-here")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set in environment")
        print("  Run: export ANTHROPIC_API_KEY=your-key-here")
        sys.exit(1)

    start_time = time.time()

    # ── Pipeline ──
    models = load_models()
    embeddings = embed_models(models)
    sim_matrix = compute_similarities(embeddings)
    cross_candidates, same_candidates = select_candidates(models, sim_matrix)

    # Save embeddings as checkpoint (in case classification fails partway)
    checkpoint_path = DATA_DIR / "embeddings_cache.npy"
    np.save(checkpoint_path, sim_matrix)
    print(f"\nSaved similarity matrix checkpoint to {checkpoint_path}")

    cross_classified = classify_pairs(models, cross_candidates, "cross-discipline")
    same_classified = classify_pairs(models, same_candidates, "same-discipline")

    edges = build_edges(models, cross_classified, same_classified, sim_matrix, same_candidates)

    # ── Save ──
    with open(EDGES_OUTPUT, "w") as f:
        json.dump(edges, f, indent=2)
    print(f"\nSaved {len(edges)} edges to {EDGES_OUTPUT}")

    update_node_degrees(edges)

    # ── Cleanup checkpoint ──
    if checkpoint_path.exists():
        checkpoint_path.unlink()

    print_summary(edges, models)

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
