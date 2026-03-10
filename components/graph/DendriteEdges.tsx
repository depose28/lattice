import * as THREE from "three";
import type { LayoutNode, EdgeData, Discipline } from "@/lib/graph/types";
import { BACKGROUND_COLOR, DISCIPLINE_COLORS } from "@/lib/constants";
import { useGraphStore } from "@/store/graphStore";

// Silver thread color — visible as fine lines on #070B0F
const restColor = new THREE.Color("#3A5568");
// Bright highlight for connected edges on selection
const highlightColor = new THREE.Color("#7AA0B8");

// Vertex shader — pass edge progress + highlight intensity to fragment
const dendriteVertexShader = /* glsl */ `
  attribute float aProgress;    // 0.0 at source, 1.0 at target
  attribute float aHighlight;   // 0.0 = rest, 1.0+ = highlighted

  varying float vProgress;
  varying float vHighlight;
  varying float vFogDepth;
  varying vec3 vColor;

  void main() {
    vProgress = aProgress;
    vHighlight = aHighlight;
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader — animated pulses on highlighted edges
const dendriteFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec3 uHighlightColor;

  varying float vProgress;
  varying float vHighlight;
  varying float vFogDepth;
  varying vec3 vColor;

  void main() {
    vec3 color = vColor;
    float alpha = uOpacity;

    if (vHighlight > 0.5) {
      // Blend toward highlight color based on intensity
      float blendFactor = min((vHighlight - 0.5) / 2.5, 1.0);
      color = mix(color, uHighlightColor, blendFactor);

      // Traveling pulse — 2 pulses at different speeds for organic feel
      float pulse1 = smoothstep(0.0, 0.12, fract(vProgress - uTime * 0.4)) *
                      smoothstep(0.35, 0.12, fract(vProgress - uTime * 0.4));
      float pulse2 = smoothstep(0.0, 0.08, fract(vProgress * 0.7 + uTime * 0.25 + 0.5)) *
                      smoothstep(0.25, 0.08, fract(vProgress * 0.7 + uTime * 0.25 + 0.5));

      // Combine pulses — brighter peaks traveling along the edge
      float pulse = max(pulse1, pulse2 * 0.7);

      // Subtle pulse on the line itself — particles do the heavy lifting
      float pulseStrength = min(vHighlight / 3.0, 1.0);
      color += pulse * pulseStrength * vec3(0.15, 0.2, 0.25);
      alpha = mix(uOpacity, min(uOpacity * 2.0, 0.25), pulseStrength);

      // Faint base so the line is visible as a guide
      alpha = max(alpha, 0.06 * pulseStrength);
    }

    // Fog
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, alpha);
  }
`;

export interface DendriteSystem {
  lines: THREE.LineSegments;
  update: (time: number) => void;
}

export function createDendriteEdges(
  nodes: LayoutNode[],
  edges: EdgeData[],
  scene: THREE.Scene,
): DendriteSystem {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const positions: number[] = [];
  const baseColors: number[] = [];
  const progresses: number[] = [];
  const validEdgeIndices: number[] = [];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    positions.push(
      source.position.x, source.position.y, source.position.z,
      target.position.x, target.position.y, target.position.z,
    );

    // Progress: 0 at source vertex, 1 at target vertex
    progresses.push(0.0, 1.0);

    // Subtle brightness variation by strength
    const brightness = 0.5 + edge.strength * 0.5;
    baseColors.push(
      restColor.r * brightness, restColor.g * brightness, restColor.b * brightness,
      restColor.r * brightness, restColor.g * brightness, restColor.b * brightness,
    );
    validEdgeIndices.push(i);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const colorArray = new Float32Array(baseColors);
  const colorAttr = new THREE.BufferAttribute(colorArray, 3);
  geometry.setAttribute("color", colorAttr);

  // Per-vertex progress (0→1 along edge)
  const progressAttr = new THREE.Float32BufferAttribute(progresses, 1);
  geometry.setAttribute("aProgress", progressAttr);

  // Per-vertex highlight intensity (updated each frame)
  const highlights = new Float32Array(validEdgeIndices.length * 2); // 2 vertices per edge
  const highlightAttr = new THREE.BufferAttribute(highlights, 1);
  geometry.setAttribute("aHighlight", highlightAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uOpacity: { value: 0.12 },
      fogColor: { value: new THREE.Color(BACKGROUND_COLOR) },
      fogNear: { value: 300.0 },
      fogFar: { value: 1000.0 },
      uHighlightColor: { value: highlightColor },
    },
    vertexShader: dendriteVertexShader,
    fragmentShader: dendriteFragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "dendriteEdges";
  scene.add(lines);

  // Build neighbor set for focus mode
  const nodeEdges = new Map<string, Set<number>>();
  for (let vi = 0; vi < validEdgeIndices.length; vi++) {
    const ei = validEdgeIndices[vi];
    const s = edges[ei].source;
    const t = edges[ei].target;
    if (!nodeEdges.has(s)) nodeEdges.set(s, new Set());
    if (!nodeEdges.has(t)) nodeEdges.set(t, new Set());
    nodeEdges.get(s)!.add(vi);
    nodeEdges.get(t)!.add(vi);
  }

  // Current state per edge (for smooth transitions)
  const currentBrightness = new Float32Array(validEdgeIndices.length).fill(1.0);
  const currentHighlight = new Float32Array(validEdgeIndices.length).fill(0.0);
  let currentOpacity = 0.06;

  // Build discipline lookup per node + pre-compute discipline colors
  const nodeDiscipline = new Map<string, string>();
  const disciplineColorMap = new Map<string, THREE.Color>();
  for (const node of nodes) {
    nodeDiscipline.set(node.id, node.discipline);
    if (!disciplineColorMap.has(node.discipline)) {
      const hex = DISCIPLINE_COLORS[node.discipline as keyof typeof DISCIPLINE_COLORS] ?? "#3A5568";
      disciplineColorMap.set(node.discipline, new THREE.Color(hex));
    }
  }

  function update(time: number) {
    material.uniforms.uTime.value = time;

    const state = useGraphStore.getState();
    const selectedId = state.selectedNodeId;
    const hoveredId = state.hoveredNodeId;
    const activeEdgeTypes = state.activeEdgeTypes;
    const activeDisciplines = state.activeDisciplines;
    const hasDisciplineFilter = activeDisciplines.size > 0;
    const highlightedEdgeType = state.highlightedEdgeType;
    const hasEdgeHighlight = highlightedEdgeType !== null;
    const oracleActive = state.oracleMode && state.oracleActivatedNodes.size > 0;
    const oracleNodes = state.oracleActivatedNodes;
    const cascadeClearing = state.cascadePhase === "clearing";

    const connectedToSelected = selectedId ? nodeEdges.get(selectedId) : null;
    const connectedToHovered = hoveredId ? nodeEdges.get(hoveredId) : null;
    const hasSelection = selectedId !== null;
    const hasHover = hoveredId !== null;

    // Keep lines subtle — particles carry the visual weight
    const targetOpacity = oracleActive ? 0.10 : hasSelection ? 0.12 : (hasDisciplineFilter || hasEdgeHighlight) ? 0.06 : hasHover ? 0.10 : 0.08;
    currentOpacity += (targetOpacity - currentOpacity) * 0.1;
    material.uniforms.uOpacity.value = currentOpacity;

    let colorChanged = false;
    let highlightChanged = false;

    for (let vi = 0; vi < validEdgeIndices.length; vi++) {
      const ei = validEdgeIndices[vi];
      const edgeType = edges[ei].type;
      const sourceDiscipline = nodeDiscipline.get(edges[ei].source) ?? "";
      const targetDiscipline = nodeDiscipline.get(edges[ei].target) ?? "";

      let targetBright = 1.0;
      let targetHighlightVal = 0.0;

      // Edge type filter / highlight
      if (!activeEdgeTypes.has(edgeType)) {
        targetBright = 0.0;
      } else if (oracleActive && !cascadeClearing) {
        // Oracle mode: brighten edges between activated nodes, dim everything else
        const sourceInOracle = oracleNodes.has(edges[ei].source);
        const targetInOracle = oracleNodes.has(edges[ei].target);
        if (sourceInOracle && targetInOracle) {
          targetBright = 4.0;
          targetHighlightVal = 4.0;
        } else if (sourceInOracle || targetInOracle) {
          targetBright = 0.6;
          targetHighlightVal = 1.0;
        } else {
          targetBright = 0.04;
        }
      } else if (hasEdgeHighlight) {
        // Edge type spotlight mode
        if (edgeType === highlightedEdgeType) {
          targetBright = 2.5;
          targetHighlightVal = 2.0;
        } else {
          targetBright = 0.03;
        }
      } else if (hasSelection && connectedToSelected) {
        if (connectedToSelected.has(vi)) {
          targetBright = 3.5;
          targetHighlightVal = 3.5;
        } else {
          targetBright = 0.3; // muted but clearly visible background structure
        }
      } else if (hasDisciplineFilter) {
        const sourceInDiscipline = activeDisciplines.has(sourceDiscipline as import("@/lib/graph/types").Discipline);
        const targetInDiscipline = activeDisciplines.has(targetDiscipline as import("@/lib/graph/types").Discipline);
        if (sourceInDiscipline && targetInDiscipline) {
          targetBright = 1.8;
          targetHighlightVal = 1.2;
        } else if (sourceInDiscipline || targetInDiscipline) {
          targetBright = 1.2;
          targetHighlightVal = 0.8;
        } else {
          targetBright = 0.04;
        }
      } else if (hasHover && connectedToHovered) {
        if (connectedToHovered.has(vi)) {
          targetBright = 2.5;
          targetHighlightVal = 2.0;
        } else {
          targetBright = 0.3;
        }
      }

      // Smooth highlight transition
      const prevH = currentHighlight[vi];
      const nextH = prevH + (targetHighlightVal - prevH) * 0.12;
      if (Math.abs(nextH - prevH) > 0.001) {
        currentHighlight[vi] = nextH;
        // Both vertices of this edge get the same highlight
        highlights[vi * 2] = nextH;
        highlights[vi * 2 + 1] = nextH;
        highlightChanged = true;
      }

      // Color brightness transition
      const prev = currentBrightness[vi];
      const next = prev + (targetBright - prev) * 0.12;
      if (Math.abs(next - prev) > 0.001) {
        currentBrightness[vi] = next;
        const base0 = vi * 6;

        const isHighlighted = next > 1.5;
        // Use discipline color for discipline-filtered edges, highlight color for selection
        let blendTarget = highlightColor;
        if (hasDisciplineFilter && !hasSelection) {
          // Pick the discipline color of whichever endpoint is in the active discipline
          const sd = nodeDiscipline.get(edges[ei].source) ?? "";
          const td = nodeDiscipline.get(edges[ei].target) ?? "";
          const sourceActive = activeDisciplines.has(sd as Discipline);
          blendTarget = disciplineColorMap.get(sourceActive ? sd : td) ?? highlightColor;
        }

        for (let c = 0; c < 6; c++) {
          if (isHighlighted) {
            const baseVal = baseColors[base0 + c];
            const bVal = c % 3 === 0 ? blendTarget.r : c % 3 === 1 ? blendTarget.g : blendTarget.b;
            const blendFactor = Math.min((next - 1.0) / 2.5, 1.0);
            colorArray[base0 + c] = baseVal * (1 - blendFactor) + bVal * blendFactor;
          } else {
            colorArray[base0 + c] = baseColors[base0 + c] * Math.max(next, 0);
          }
        }
        colorChanged = true;
      }
    }

    if (colorChanged) {
      colorAttr.needsUpdate = true;
    }
    if (highlightChanged) {
      highlightAttr.needsUpdate = true;
    }
  }

  return { lines, update };
}
