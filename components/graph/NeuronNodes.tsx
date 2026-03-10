import * as THREE from "three";
import type { LayoutNode } from "@/lib/graph/types";
import {
  NEURON_REST,
  NEURON_HOVER,
  BACKGROUND_COLOR,
  ACTIVATION_SPIKE_MS,
  ACTIVATION_DECAY_MS,
  DISCIPLINE_COLORS,
} from "@/lib/constants";
import { useGraphStore, type NodeActivation } from "@/store/graphStore";
import type { Discipline } from "@/lib/graph/types";

const dummy = new THREE.Object3D();

// Vertex shader — per-instance activation + breathing + normal for fresnel + discipline glow
const vertexShader = /* glsl */ `
  attribute float aActivation;
  attribute float aDecayPhase;
  attribute float aPhaseOffset;
  attribute float aFocus;
  attribute float aHubness;
  attribute vec3  aDisciplineColor;
  attribute float aDisciplineGlow;

  uniform float uTime;

  varying float vActivation;
  varying float vDecayPhase;
  varying float vFogDepth;
  varying float vFocus;
  varying float vHubness;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vDisciplineColor;
  varying float vDisciplineGlow;

  void main() {
    vActivation = aActivation;
    vDecayPhase = aDecayPhase;
    vFocus = aFocus;
    vHubness = aHubness;
    vDisciplineColor = aDisciplineColor;
    vDisciplineGlow = aDisciplineGlow;

    // Breathing: desynchronized scale oscillation — hubs pulse more visibly
    float breathAmp = 0.015 + aHubness * 0.035; // 1.5% base → up to 5% for top hubs
    float breathSpeed = 0.25 + aHubness * 0.15;  // slightly faster for hubs
    float breath = 1.0 + sin(uTime * breathSpeed + aPhaseOffset) * breathAmp;

    // Activation pulse: scale increase at peak (up to +40% for hover/select visibility)
    float activationScale = 1.0 + aActivation * 0.4;

    // Discipline glow: subtle scale boost for active discipline nodes
    float disciplineScale = 1.0 + aDisciplineGlow * 0.12;

    vec3 scaled = position * breath * activationScale * disciplineScale;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);

    // Normal and view direction for fresnel
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vViewDir = normalize(-mvPosition.xyz);

    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader — thermal decay + fresnel + fMRI-style discipline coloring
const fragmentShader = /* glsl */ `
  uniform vec3 uRestColor;
  uniform vec3 uHoverColor;
  uniform float uTime;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  varying float vActivation;
  varying float vDecayPhase;
  varying float vFogDepth;
  varying float vFocus;
  varying float vHubness;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vDisciplineColor;
  varying float vDisciplineGlow;

  vec3 thermalDecay(float t, vec3 restCol) {
    vec3 white  = vec3(1.0, 1.0, 1.0);
    vec3 yellow = vec3(1.0, 0.9, 0.4);
    vec3 amber  = vec3(0.91, 0.63, 0.19);
    if (t < 0.15) return mix(white,  yellow, t / 0.15);
    if (t < 0.6)  return mix(yellow, amber,  (t - 0.15) / 0.45);
    return mix(amber, restCol, (t - 0.6) / 0.4);
  }

  float sigmoid(float x, float k) {
    return 1.0 / (1.0 + exp(-k * (x - 0.5)));
  }

  void main() {
    // Fresnel rim — edge highlight for 3D dimensionality
    float NdotV = max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
    float fresnel = pow(1.0 - NdotV, 3.0);

    // fMRI discipline coloring: blend rest color toward discipline color
    // Hub nodes are brighter at rest — structural anchors glow like active synaptic junctions
    vec3 hubTint = vec3(0.06, 0.04, 0.02) * smoothstep(0.6, 1.0, vHubness); // warm tint for top hubs
    vec3 hubBrightened = uRestColor * (1.0 + vHubness * 0.7) + hubTint;
    vec3 restColor = mix(hubBrightened, vDisciplineColor * 0.8 + vec3(0.1), vDisciplineGlow * 0.85);

    float act = sigmoid(vActivation, 8.0);

    // Fresnel rim scales with activation, discipline glow, AND hubness
    float rimIntensity = mix(0.12 + vHubness * 0.1, 0.5, max(act, vDisciplineGlow * 0.6));
    vec3 rimColor = mix(
      mix(vec3(0.35, 0.5, 0.6), vDisciplineColor, vDisciplineGlow),
      vec3(1.0),
      act
    );

    vec3 fireColor = thermalDecay(vDecayPhase, restColor);
    vec3 baseColor = mix(restColor, fireColor, act);

    // Hover state: blend toward lightened discipline color
    float hoverBlend = smoothstep(0.1, 0.35, vActivation) * smoothstep(0.6, 0.85, vDecayPhase);
    vec3 hoverTarget = vDisciplineColor * 0.6 + vec3(0.4); // lighten toward white
    baseColor = mix(baseColor, hoverTarget, hoverBlend * 0.85);

    // Discipline glow: add emissive tint (like fMRI hot spot)
    baseColor += vDisciplineColor * vDisciplineGlow * 0.15;

    vec3 color = baseColor + fresnel * rimIntensity * rimColor;

    // Focus dimming — non-neighbors fade toward background
    color = mix(fogColor, color, vFocus);

    // Fog
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export interface NeuronSystem {
  mesh: THREE.InstancedMesh;
  activationAttr: THREE.InstancedBufferAttribute;
  decayPhaseAttr: THREE.InstancedBufferAttribute;
  focusAttr: THREE.InstancedBufferAttribute;
  material: THREE.ShaderMaterial;
  update: (time: number) => void;
}

export function createNeuronNodes(
  nodes: LayoutNode[],
  scene: THREE.Scene,
  edges?: import("@/lib/graph/types").EdgeData[],
): NeuronSystem {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  // Enlarge bounding sphere for easier raycasting when zoomed out (3x visual radius)
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius = 3.0;
  const count = nodes.length;

  // Per-instance attributes
  const activations = new Float32Array(count); // all 0.0
  const decayPhases = new Float32Array(count).fill(1.0); // all fully decayed
  const phaseOffsets = new Float32Array(count);
  const focuses = new Float32Array(count).fill(1.0); // all fully visible
  const hubnesses = new Float32Array(count); // 0-1 based on degree
  const disciplineColors = new Float32Array(count * 3); // RGB per node
  const disciplineGlows = new Float32Array(count); // 0-1 per node

  // Find max degree for normalization
  const maxDegree = Math.max(...nodes.map((n) => n.degree));

  for (let i = 0; i < count; i++) {
    phaseOffsets[i] = Math.random() * Math.PI * 2;

    // Hubness: normalized degree with steeper curve — top hubs stand out clearly
    // pow(x, 0.45) widens the gap between low-degree and high-degree nodes
    hubnesses[i] = maxDegree > 0 ? Math.pow(nodes[i].degree / maxDegree, 0.45) : 0;

    // Pre-compute discipline color for each node
    const disc = nodes[i].discipline as Discipline;
    const colorHex = DISCIPLINE_COLORS[disc] ?? "#3A4F5E";
    const c = new THREE.Color(colorHex);
    disciplineColors[i * 3] = c.r;
    disciplineColors[i * 3 + 1] = c.g;
    disciplineColors[i * 3 + 2] = c.b;
  }

  const activationAttr = new THREE.InstancedBufferAttribute(activations, 1);
  const decayPhaseAttr = new THREE.InstancedBufferAttribute(decayPhases, 1);
  const phaseOffsetAttr = new THREE.InstancedBufferAttribute(phaseOffsets, 1);
  const focusAttr = new THREE.InstancedBufferAttribute(focuses, 1);
  const hubnessAttr = new THREE.InstancedBufferAttribute(hubnesses, 1);
  const disciplineColorAttr = new THREE.InstancedBufferAttribute(disciplineColors, 3);
  const disciplineGlowAttr = new THREE.InstancedBufferAttribute(disciplineGlows, 1);

  geometry.setAttribute("aActivation", activationAttr);
  geometry.setAttribute("aDecayPhase", decayPhaseAttr);
  geometry.setAttribute("aPhaseOffset", phaseOffsetAttr);
  geometry.setAttribute("aFocus", focusAttr);
  geometry.setAttribute("aHubness", hubnessAttr);
  geometry.setAttribute("aDisciplineColor", disciplineColorAttr);
  geometry.setAttribute("aDisciplineGlow", disciplineGlowAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRestColor: { value: new THREE.Color(NEURON_REST) },
      uHoverColor: { value: new THREE.Color(NEURON_HOVER) },
      uTime: { value: 0.0 },
      fogColor: { value: new THREE.Color(BACKGROUND_COLOR) },
      fogNear: { value: 300.0 },
      fogFar: { value: 1000.0 },
    },
    vertexShader,
    fragmentShader,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "neuronNodes";

  // Set instance transforms (position + scale from radius)
  for (let i = 0; i < count; i++) {
    const node = nodes[i];
    dummy.position.set(node.position.x, node.position.y, node.position.z);
    dummy.scale.setScalar(node.radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  // Build node id → index map for fast lookups
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    idToIndex.set(nodes[i].id, i);
  }

  // Build neighbor lookup: node id → set of neighbor ids
  const neighborMap = new Map<string, Set<string>>();
  if (edges) {
    for (const edge of edges) {
      if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set());
      if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set());
      neighborMap.get(edge.source)!.add(edge.target);
      neighborMap.get(edge.target)!.add(edge.source);
    }
  }

  // Pre-compute discipline cluster centroids and radii for radial intensity
  const disciplineCentroids = new Map<string, THREE.Vector3>();
  const disciplineRadii = new Map<string, number>();
  const disciplineNodeIndices = new Map<string, number[]>();

  for (let i = 0; i < count; i++) {
    const disc = nodes[i].discipline;
    if (!disciplineNodeIndices.has(disc)) disciplineNodeIndices.set(disc, []);
    disciplineNodeIndices.get(disc)!.push(i);
  }

  for (const [disc, indices] of disciplineNodeIndices) {
    const centroid = new THREE.Vector3();
    for (const idx of indices) {
      centroid.add(new THREE.Vector3(nodes[idx].position.x, nodes[idx].position.y, nodes[idx].position.z));
    }
    centroid.divideScalar(indices.length);
    disciplineCentroids.set(disc, centroid);

    let maxDist = 0;
    for (const idx of indices) {
      const d = centroid.distanceTo(new THREE.Vector3(nodes[idx].position.x, nodes[idx].position.y, nodes[idx].position.z));
      if (d > maxDist) maxDist = d;
    }
    disciplineRadii.set(disc, maxDist || 1);
  }

  // Pre-compute per-node distance from its discipline centroid (normalized 0-1)
  const nodeCentroidDist = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const disc = nodes[i].discipline;
    const centroid = disciplineCentroids.get(disc)!;
    const radius = disciplineRadii.get(disc)!;
    const pos = new THREE.Vector3(nodes[i].position.x, nodes[i].position.y, nodes[i].position.z);
    nodeCentroidDist[i] = Math.min(pos.distanceTo(centroid) / radius, 1.0);
  }

  // Update function called each frame
  function update(time: number) {
    material.uniforms.uTime.value = time;

    const state = useGraphStore.getState();
    const hoveredId = state.hoveredNodeId;
    const selectedId = state.selectedNodeId;
    const nodeActivations = state.nodeActivations;

    const spikeMs = ACTIVATION_SPIKE_MS;
    const decayMs = ACTIVATION_DECAY_MS;
    const timeMs = performance.now();

    // Oracle state — needed in activation loop
    const oracleActiveEarly = state.oracleMode && state.oracleActivatedNodes.size > 0;
    const oracleNodesEarly = state.oracleActivatedNodes;
    const cascadePhaseEarly = state.cascadePhase;
    const oracleFocusedId = state.oracleFocusedNodeId;

    let needsUpdate = false;

    for (let i = 0; i < count; i++) {
      const nodeId = nodes[i].id;
      const na: NodeActivation | undefined = nodeActivations.get(nodeId);

      let activation = 0;
      let decayPhase = 1;

      if (na && na.fireTime > 0) {
        const elapsed = timeMs - na.fireTime * 1000;
        if (elapsed < spikeMs) {
          activation = na.activation * (elapsed / spikeMs);
          decayPhase = 0;
        } else if (elapsed < spikeMs + decayMs) {
          const decayElapsed = elapsed - spikeMs;
          const t = decayElapsed / decayMs;
          activation = na.activation * Math.exp(-3.0 * t);
          decayPhase = t;
        } else {
          activation = 0;
          decayPhase = 1;
        }
      }

      // Oracle settled: persistent bright pulse on result nodes — must trigger bloom
      if (oracleActiveEarly && cascadePhaseEarly === "settled" && oracleNodesEarly.has(nodeId)) {
        const isFocusedOracle = nodeId === oracleFocusedId;

        if (isFocusedOracle) {
          // Focused card node: blazing white, physically enlarged via high activation
          // activation > 1.0 drives scale via vertex shader (1.0 + a * 0.4)
          // so 1.8 → 1.72x size, clearly the biggest brightest node on screen
          const pulse = Math.sin(timeMs * 0.001 * 1.5 + phaseOffsets[i]) * 0.5 + 0.5;
          activation = 1.6 + pulse * 0.4; // 1.6–2.0 → huge + white-hot
          decayPhase = 0.0; // pure white peak
        } else {
          // Other oracle nodes: warm amber pulse, moderate
          const oracleResults = state.oracleResults;
          let rank = oracleResults.length;
          for (let r = 0; r < oracleResults.length; r++) {
            if (oracleResults[r].nodeId === nodeId) { rank = r; break; }
          }
          const rankFactor = 1.0 - rank / Math.max(oracleResults.length, 1);
          const baseIntensity = 0.45 + rankFactor * 0.2;
          const pulse = Math.sin(timeMs * 0.001 * 0.8 + phaseOffsets[i]) * 0.5 + 0.5;
          const oracleActivation = baseIntensity + pulse * 0.1;
          if (oracleActivation > activation) {
            activation = oracleActivation;
            decayPhase = 0.25 + pulse * 0.15; // amber zone
          }
        }
      }

      // Hover: bright cool-blue highlight (not thermal fire)
      if (nodeId === hoveredId && activation < 0.4) {
        activation = 0.4;
        decayPhase = 0.85;
      }
      // Select: stronger highlight
      if (nodeId === selectedId && activation < 0.65) {
        activation = 0.65;
        decayPhase = 0.5;
      }

      const prevA = activationAttr.getX(i);
      const prevD = decayPhaseAttr.getX(i);
      if (Math.abs(prevA - activation) > 0.001 || Math.abs(prevD - decayPhase) > 0.001) {
        activationAttr.setX(i, activation);
        decayPhaseAttr.setX(i, decayPhase);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      activationAttr.needsUpdate = true;
      decayPhaseAttr.needsUpdate = true;
    }

    // Focus mode + discipline glow
    const neighbors = selectedId ? neighborMap.get(selectedId) : null;
    const activeDisciplines = state.activeDisciplines;
    const hasDisciplineFilter = activeDisciplines.size > 0;
    const oracleActive = state.oracleMode && state.oracleActivatedNodes.size > 0;
    const oracleNodes = state.oracleActivatedNodes;
    const cascadePhase = state.cascadePhase;

    // Build set of nodes connected to the selected discipline(s)
    let disciplineNeighborIds: Set<string> | null = null;
    if (hasDisciplineFilter && neighborMap.size > 0) {
      disciplineNeighborIds = new Set<string>();
      for (let i = 0; i < count; i++) {
        if (activeDisciplines.has(nodes[i].discipline as Discipline)) {
          const nodeNeighbors = neighborMap.get(nodes[i].id);
          if (nodeNeighbors) {
            for (const nId of nodeNeighbors) {
              disciplineNeighborIds.add(nId);
            }
          }
        }
      }
    }

    let focusChanged = false;
    let glowChanged = false;

    for (let i = 0; i < count; i++) {
      const nodeId = nodes[i].id;
      let targetFocus = 1.0;
      let targetGlow = 0.0;

      // Oracle mode — dim non-activated nodes, glow oracle nodes
      if (oracleActive && cascadePhase !== "clearing") {
        if (oracleNodes.has(nodeId)) {
          targetFocus = 1.0;
          // Oracle nodes get discipline glow for color vibrancy
          targetGlow = 0.7;
        } else {
          targetFocus = 0.15; // dim but still provides spatial context
        }
      }

      // Discipline filter — fMRI-style: colored activation with radial intensity
      if (!oracleActive && hasDisciplineFilter) {
        const inDiscipline = activeDisciplines.has(nodes[i].discipline as Discipline);
        if (inDiscipline) {
          targetFocus = 1.0;
          const distFromCenter = nodeCentroidDist[i];
          targetGlow = 1.0 - distFromCenter * 0.4;
        } else if (disciplineNeighborIds && disciplineNeighborIds.has(nodeId)) {
          targetFocus = 0.35;
          targetGlow = 0.15;
        } else {
          targetFocus = 0.08;
        }
      }

      // Node selection focus (overrides discipline filter, not oracle)
      if (!oracleActive && selectedId && neighbors) {
        if (nodeId === selectedId) {
          targetFocus = 1.0;
          // Keep discipline glow on selected node
          const inDisc = activeDisciplines.has(nodes[i].discipline as Discipline);
          targetGlow = inDisc ? 1.0 : 0.0;
        } else if (neighbors.has(nodeId)) {
          targetFocus = 0.85;
          // Neighbors keep discipline glow for color identity
          const inDisc = activeDisciplines.has(nodes[i].discipline as Discipline);
          targetGlow = inDisc ? 0.7 : 0.0;
        } else {
          targetFocus = 0.25;
          targetGlow = 0.0;
        }
      }

      // Smooth focus transition
      const prevFocus = focusAttr.getX(i);
      const newFocus = prevFocus + (targetFocus - prevFocus) * 0.15;
      if (Math.abs(newFocus - prevFocus) > 0.001) {
        focusAttr.setX(i, newFocus);
        focusChanged = true;
      }

      // Smooth discipline glow transition
      const prevGlow = disciplineGlowAttr.getX(i);
      const newGlow = prevGlow + (targetGlow - prevGlow) * 0.08; // slower for dramatic fade-in
      if (Math.abs(newGlow - prevGlow) > 0.001) {
        disciplineGlowAttr.setX(i, newGlow);
        glowChanged = true;
      }
    }

    if (focusChanged) {
      focusAttr.needsUpdate = true;
    }
    if (glowChanged) {
      disciplineGlowAttr.needsUpdate = true;
    }
  }

  return { mesh, activationAttr, decayPhaseAttr, focusAttr, material, update };
}
