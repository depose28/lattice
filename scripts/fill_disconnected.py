#!/usr/bin/env python3
"""
Fill disconnected nodes (degree 0) with edges using local embeddings + Claude classification.
Uses sentence-transformers for instant embedding, then Claude haiku to classify the new pairs.
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from collections import Counter

import numpy as np
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).parent.parent / "public" / "data"
MODELS_PATH = DATA_DIR / "mental-models-700.json"
NODES_PATH = DATA_DIR / "nodes.json"
EDGES_PATH = DATA_DIR / "edges.json"

CLASSIFY_MODEL = "claude-haiku-4-5-20251001"
CLASSIFY_BATCH_SIZE = 40
EDGES_PER_DISCONNECTED = 5  # connect each isolated node to its top-5 neighbors

VALID_EDGE_TYPES = {
    "structural_kinship", "complementary", "tensioning", "inversion",
    "prerequisite", "cross_discipline_tfidf", "same_discipline_tfidf", "same_chapter",
}
TYPE_ALIASES = {
    "cross_discipline": "cross_discipline_tfidf",
    "same_domain": "same_discipline_tfidf",
    "same_discipline": "same_discipline_tfidf",
    "kinship": "structural_kinship",
}


def clean_description(description: str) -> str:
    text = re.sub(r"^Title\s*\n.*?Model", "", description, count=1).strip()
    return text if text else description


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic()

    # Load data
    print("Loading data...")
    with open(MODELS_PATH) as f:
        raw_models = json.load(f)
    with open(NODES_PATH) as f:
        nodes = json.load(f)
    with open(EDGES_PATH) as f:
        existing_edges = json.load(f)

    # Build model info
    models = []
    for i, raw in enumerate(raw_models):
        cleaned = clean_description(raw["Description"])
        models.append({
            "id": f"m{i:03d}",
            "name": raw["Name"],
            "discipline": raw["Discipline"],
            "chapter": raw["Chapter"],
            "description": cleaned,
            "embed_text": f"{raw['Name']}: {cleaned[:1000]}",
            "classify_text": f"{raw['Name']} ({raw['Discipline']}): {cleaned[:300]}",
        })

    # Find disconnected nodes
    connected = set()
    for e in existing_edges:
        connected.add(e["source"])
        connected.add(e["target"])

    disconnected = [i for i, m in enumerate(models) if m["id"] not in connected]
    print(f"Disconnected nodes: {len(disconnected)}")

    if not disconnected:
        print("No disconnected nodes — nothing to do!")
        return

    # Embed all 700 with local model (fast!)
    print("Embedding all 700 models locally (sentence-transformers)...")
    st_model = SentenceTransformer("all-MiniLM-L6-v2")
    texts = [m["embed_text"] for m in models]
    embeddings = st_model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    print(f"  Embeddings: {embeddings.shape}")

    # Compute similarity matrix
    sim_matrix = embeddings @ embeddings.T
    np.fill_diagonal(sim_matrix, 0)

    # For each disconnected node, find top-K most similar nodes
    existing_pairs = set()
    for e in existing_edges:
        s, t = e["source"], e["target"]
        existing_pairs.add((min(s, t), max(s, t)))

    candidate_pairs = []  # (i, j, similarity)
    for i in disconnected:
        sims = sim_matrix[i]
        # Get top candidates, excluding existing edges
        top_indices = np.argsort(sims)[::-1]
        added = 0
        for j in top_indices:
            if added >= EDGES_PER_DISCONNECTED:
                break
            j = int(j)
            if i == j:
                continue
            pair_key = (min(models[i]["id"], models[j]["id"]), max(models[i]["id"], models[j]["id"]))
            if pair_key in existing_pairs:
                continue
            candidate_pairs.append((i, j, float(sims[j])))
            existing_pairs.add(pair_key)
            added += 1

    print(f"Candidate pairs to classify: {len(candidate_pairs)}")
    if candidate_pairs:
        sims = [p[2] for p in candidate_pairs]
        print(f"  Similarity range: {min(sims):.3f} – {max(sims):.3f}")

    # Classify with Claude
    new_edges = []
    print(f"\nClassifying {len(candidate_pairs)} pairs with {CLASSIFY_MODEL}...")

    for batch_start in range(0, len(candidate_pairs), CLASSIFY_BATCH_SIZE):
        batch = candidate_pairs[batch_start : batch_start + CLASSIFY_BATCH_SIZE]

        pair_lines = []
        for idx, (i, j, sim) in enumerate(batch):
            pair_lines.append(
                f"PAIR {idx}:\n"
                f"  A: {models[i]['classify_text']}\n"
                f"  B: {models[j]['classify_text']}\n"
                f"  Similarity: {sim:.3f}"
            )

        same_or_cross = "cross_discipline_tfidf"
        prompt = f"""Classify each pair of mental models into exactly one relationship type.

RELATIONSHIP TYPES:
- structural_kinship: Deep structural parallel — same underlying pattern, different domains
- complementary: Models that work together — using one naturally leads to or enhances the other
- tensioning: Models that pull in opposite directions or create productive tension
- inversion: One model is essentially the inverse/negation of the other
- prerequisite: Understanding model A is necessary to properly understand model B
- cross_discipline_tfidf: General thematic similarity across disciplines — related but no deep structural connection
- same_discipline_tfidf: General similarity within the same discipline — related but no deep structural connection

Be generous with classification — these are models that need at least one connection. Only use "skip" if the pair is truly unrelated.

{chr(10).join(pair_lines)}

Return ONLY a JSON array of objects, one per pair, in order:
[{{"pair": 0, "type": "structural_kinship"}}, {{"pair": 1, "type": "complementary"}}, ...]"""

        try:
            response = client.messages.create(
                model=CLASSIFY_MODEL,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )

            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\s*", "", text)
                text = re.sub(r"```\s*$", "", text)

            classifications = json.loads(text)

            for entry in classifications:
                pair_idx = entry["pair"]
                edge_type = entry["type"]

                if edge_type in TYPE_ALIASES:
                    edge_type = TYPE_ALIASES[edge_type]

                if pair_idx < len(batch) and edge_type in VALID_EDGE_TYPES:
                    i, j, sim = batch[pair_idx]
                    new_edges.append({
                        "source": models[i]["id"],
                        "target": models[j]["id"],
                        "type": edge_type,
                        "strength": round(sim, 3),
                        "label": "",
                    })
                elif pair_idx < len(batch) and edge_type == "skip":
                    # Even for skips, add a generic edge — these nodes need connections
                    i, j, sim = batch[pair_idx]
                    fallback = "same_discipline_tfidf" if models[i]["discipline"] == models[j]["discipline"] else "cross_discipline_tfidf"
                    new_edges.append({
                        "source": models[i]["id"],
                        "target": models[j]["id"],
                        "type": fallback,
                        "strength": round(sim, 3),
                        "label": "",
                    })

        except Exception as e:
            print(f"  ⚠ Batch error: {e}")
            for i, j, sim in batch:
                fallback = "same_discipline_tfidf" if models[i]["discipline"] == models[j]["discipline"] else "cross_discipline_tfidf"
                new_edges.append({
                    "source": models[i]["id"],
                    "target": models[j]["id"],
                    "type": fallback,
                    "strength": round(sim, 3),
                    "label": "",
                })

        done = min(batch_start + CLASSIFY_BATCH_SIZE, len(candidate_pairs))
        print(f"  Classified {done}/{len(candidate_pairs)} ({len(new_edges)} edges)")
        if done < len(candidate_pairs):
            time.sleep(0.5)

    # Merge with existing edges
    all_edges = existing_edges + new_edges
    print(f"\nNew edges added: {len(new_edges)}")
    print(f"Total edges: {len(all_edges)} (was {len(existing_edges)})")

    # Save
    with open(EDGES_PATH, "w") as f:
        json.dump(all_edges, f, indent=2)
    print(f"Saved to {EDGES_PATH}")

    # Update node degrees
    degree_count = Counter()
    for e in all_edges:
        degree_count[e["source"]] += 1
        degree_count[e["target"]] += 1

    for node in nodes:
        node["degree"] = degree_count.get(node["id"], 0)

    still_disconnected = sum(1 for n in nodes if n["degree"] == 0)

    with open(NODES_PATH, "w") as f:
        json.dump(nodes, f, indent=2)

    # Summary
    type_counts = Counter(e["type"] for e in new_edges)
    print(f"\nNew edges by type:")
    for t, c in type_counts.most_common():
        print(f"  {t}: {c}")

    print(f"\nStill disconnected: {still_disconnected}")
    print(f"Total edges: {len(all_edges)}")


if __name__ == "__main__":
    main()
