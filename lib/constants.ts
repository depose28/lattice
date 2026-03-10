// lib/constants.ts — single source of truth for all colors
// DO NOT define colors anywhere else. Import from here.

// Scene
export const BACKGROUND_COLOR = "#070B0F"; // near-black, cool blue-black tint
export const GRID_COLOR = "#0D1520"; // very faint grid overlay (optional)

// Resting neuron states
export const NEURON_REST = "#3A4F5E"; // cool grey — visible as distinct spheres
export const NEURON_HOVER = "#8CB4CC"; // bright cool blue — clear hover state
export const DENDRITE_REST = "#111E28"; // very dark, thin silver thread

// Activation thermal sequence (action potential)
// These are the colors a firing neuron passes through, in order:
export const ACTIVATION_PEAK = "#FFFFFF"; // instant white flash (0ms)
export const ACTIVATION_HOT = "#FFE566"; // cooling yellow (150ms)
export const ACTIVATION_WARM = "#E8A030"; // amber (500ms)
export const ACTIVATION_COOL = "#C47A20"; // deep amber (1200ms)
// → returns to NEURON_REST over ~2000ms total

// Discipline colors — appear ONLY at activation peak (300ms window)
// After peak, node decays through thermal sequence regardless of discipline
export const DISCIPLINE_COLORS = {
  "Probability": "#4A90D9", // blue
  "Investing": "#5DBF6E", // green
  "Behavioral Economics": "#D4A843", // amber (close to activation — intentional)
  "Algorithms & Machine Learning": "#9B5DE5", // violet
  "Economics": "#E8614A", // coral
  "Financial Theory": "#2EC4B6", // teal
  "Mathematics": "#A8B8C8", // silver
  "Elementary Models": "#F4892A", // orange
  "Philosophy": "#C0C8D0", // pale grey
  "Game Theory": "#E63946", // red
} as const;

// Edge type colors — used for directional particles, not edge lines
export const EDGE_PARTICLE_COLORS = {
  cross_discipline_tfidf: "#E8E8E8", // bright white — the long-range connections
  structural_kinship: "#D4A843", // warm gold
  complementary: "#5DBF6E", // green
  tensioning: "#E8614A", // red-orange
  inversion: "#9B5DE5", // purple
  prerequisite: "#2EC4B6", // cyan
  same_chapter: "#445566", // dim cool grey
  same_discipline_tfidf: "#1E2E3A", // near-invisible — background only
} as const;

// Edge type human-readable labels
export const EDGE_TYPE_LABELS: Record<string, string> = {
  cross_discipline_tfidf: "Cross-discipline",
  structural_kinship: "Kinship",
  complementary: "Complementary",
  tensioning: "Tension",
  inversion: "Inversion",
  prerequisite: "Prerequisite",
  same_chapter: "Same chapter",
  same_discipline_tfidf: "Same discipline",
};

// Timing constants (milliseconds)
export const ACTIVATION_SPIKE_MS = 50; // instant — action potential rise
export const ACTIVATION_DECAY_MS = 2500; // slow thermal cooldown
export const CAMERA_FLY_MS = 800; // camera lerp duration
export const DISCIPLINE_COLOR_WINDOW_MS = 300; // how long discipline color is visible at peak

// Node sizing
export const NODE_BASE_RADIUS = 0.35;
export const NODE_DEGREE_SCALE = 0.35; // legacy log scale
export const NODE_MIN_RADIUS = 0.45; // smallest nodes (degree 1-3)
export const NODE_MAX_RADIUS = 2.2;  // top hub nodes (degree 50+)

// Edge sizing
export const EDGE_BASE_WIDTH = 0.3;
export const EDGE_STRENGTH_SCALE = 0.5; // 0.3 + strength * this

// Bloom (tight, clinical — not diffuse)
export const BLOOM_STRENGTH = 0.4;
export const BLOOM_THRESHOLD = 0.75;
export const BLOOM_RADIUS = 0.15;

// Film grain
export const FILM_GRAIN_INTENSITY = 0.006;
