import * as THREE from "three";
import type { LayoutNode, EdgeData, Discipline } from "@/lib/graph/types";
import { EDGE_PARTICLE_COLORS, DISCIPLINE_COLORS, BACKGROUND_COLOR } from "@/lib/constants";
import type { EdgeType } from "@/lib/graph/types";
import { useGraphStore } from "@/store/graphStore";

// Vertex shader — particles traveling along edges
const particleVertexShader = /* glsl */ `
  attribute float aOpacity;
  attribute vec3 aColor;

  uniform float uPointSize;

  varying float vOpacity;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    vOpacity = aOpacity;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_PointSize = uPointSize * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  varying float vOpacity;
  varying vec3 vColor;
  varying float vFogDepth;

  void main() {
    // Circular point with tight edge — sharp, precise signals
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = vOpacity * smoothstep(0.5, 0.15, dist);

    vec3 color = vColor;
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, alpha);
  }
`;

// Particle counts per edge by state
const AMBIENT_PARTICLES_PER_EDGE = 1;
const HOVER_PARTICLES = 5;
const SELECT_PARTICLES = 8;

interface ParticleData {
  edgeIndex: number;
  progress: number; // 0→1 along edge
  speed: number;
  baseOpacity: number;
}

export interface ParticleSystem {
  points: THREE.Points;
  update: (time: number, deltaTime: number) => void;
}

export function createEdgeParticles(
  nodes: LayoutNode[],
  edges: EdgeData[],
  scene: THREE.Scene,
): ParticleSystem {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Pre-compute source/target positions for each edge
  const edgePositions: { sx: number; sy: number; sz: number; tx: number; ty: number; tz: number }[] = [];
  const edgeColors: THREE.Color[] = [];

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      edgePositions.push({ sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0 });
      edgeColors.push(new THREE.Color("#445566"));
      continue;
    }
    edgePositions.push({
      sx: source.position.x, sy: source.position.y, sz: source.position.z,
      tx: target.position.x, ty: target.position.y, tz: target.position.z,
    });
    const colorHex = EDGE_PARTICLE_COLORS[edge.type as EdgeType] ?? "#445566";
    edgeColors.push(new THREE.Color(colorHex));
  }

  // Create ambient particles — 1 per edge
  const maxParticles = edges.length * SELECT_PARTICLES; // pre-allocate for activation
  const particles: ParticleData[] = [];

  for (let i = 0; i < edges.length; i++) {
    particles.push({
      edgeIndex: i,
      progress: Math.random(),
      speed: 0.08 + Math.random() * 0.04, // 0.08–0.12
      baseOpacity: 0.2,
    });
  }

  // Fill rest of pool with inactive particles
  for (let i = particles.length; i < maxParticles; i++) {
    particles.push({
      edgeIndex: 0,
      progress: 0,
      speed: 0,
      baseOpacity: 0,
    });
  }

  // Buffer attributes
  const positions = new Float32Array(maxParticles * 3);
  const opacities = new Float32Array(maxParticles);
  const colors = new Float32Array(maxParticles * 3);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const opacityAttr = new THREE.BufferAttribute(opacities, 1);
  const colorAttr = new THREE.BufferAttribute(colors, 3);

  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aOpacity", opacityAttr);
  geometry.setAttribute("aColor", colorAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPointSize: { value: 2.5 },
      fogColor: { value: new THREE.Color(BACKGROUND_COLOR) },
      fogNear: { value: 300.0 },
      fogFar: { value: 1000.0 },
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "edgeParticles";
  scene.add(points);

  // Build edge lookup: node id → connected edge indices
  const nodeEdgeMap = new Map<string, number[]>();
  for (let i = 0; i < edges.length; i++) {
    const s = edges[i].source;
    const t = edges[i].target;
    if (!nodeEdgeMap.has(s)) nodeEdgeMap.set(s, []);
    if (!nodeEdgeMap.has(t)) nodeEdgeMap.set(t, []);
    nodeEdgeMap.get(s)!.push(i);
    nodeEdgeMap.get(t)!.push(i);
  }

  // Build discipline lookup
  const nodeDiscipline = new Map<string, string>();
  for (const node of nodes) {
    nodeDiscipline.set(node.id, node.discipline);
  }

  function update(time: number, deltaTime: number) {
    const state = useGraphStore.getState();
    const hoveredId = state.hoveredNodeId;
    const selectedId = state.selectedNodeId;
    const activeEdgeTypes = state.activeEdgeTypes;
    const activeDisciplines = state.activeDisciplines;
    const hasDisciplineFilter = activeDisciplines.size > 0;
    const highlightedEdgeType = state.highlightedEdgeType;
    const hasEdgeHighlight = highlightedEdgeType !== null;
    const oracleActive = state.oracleMode && state.oracleActivatedNodes.size > 0;
    const oracleNodes = state.oracleActivatedNodes;
    const cascadeClearing = state.cascadePhase === "clearing";

    // Boost particle size in oracle mode for visibility at distance
    const targetSize = oracleActive && !cascadeClearing ? 4.0 : 2.5;
    const currentSize = material.uniforms.uPointSize.value;
    material.uniforms.uPointSize.value += (targetSize - currentSize) * 0.1;

    // Determine which edges are active (connected to hovered/selected)
    const hoveredEdges = hoveredId ? new Set(nodeEdgeMap.get(hoveredId) ?? []) : new Set<number>();
    const selectedEdges = selectedId ? new Set(nodeEdgeMap.get(selectedId) ?? []) : new Set<number>();

    // Update particle pool
    let pIdx = 0;
    for (let i = 0; i < edges.length && pIdx < maxParticles; i++) {
      // Skip edges whose type is filtered out
      if (!activeEdgeTypes.has(edges[i].type)) continue;

      const isHovered = hoveredEdges.has(i);
      const isSelected = selectedEdges.has(i);

      // Oracle mode: check if edge connects oracle-activated nodes
      const sourceOracle = oracleActive && oracleNodes.has(edges[i].source);
      const targetOracle = oracleActive && oracleNodes.has(edges[i].target);
      const isOracleEdge = sourceOracle && targetOracle;
      const touchesOracle = sourceOracle || targetOracle;

      // Discipline filter: check if edge touches active discipline
      let isDisciplineEdge = false;
      let isBothInDiscipline = false;
      let disciplineColor: THREE.Color | null = null;
      if (!oracleActive && hasDisciplineFilter) {
        const sd = nodeDiscipline.get(edges[i].source) ?? "";
        const td = nodeDiscipline.get(edges[i].target) ?? "";
        const sourceIn = activeDisciplines.has(sd as Discipline);
        const targetIn = activeDisciplines.has(td as Discipline);
        isDisciplineEdge = sourceIn || targetIn;
        isBothInDiscipline = sourceIn && targetIn;
        if (!isDisciplineEdge && !isHovered && !isSelected) continue;
        if (isDisciplineEdge) {
          const activeDiscipline = sourceIn ? sd : td;
          const hex = DISCIPLINE_COLORS[activeDiscipline as keyof typeof DISCIPLINE_COLORS];
          if (hex) disciplineColor = new THREE.Color(hex);
        }
      }

      const isEdgeTypeMatch = hasEdgeHighlight && edges[i].type === highlightedEdgeType;

      let numParticles: number;
      let speed: number;
      let opacity: number;
      let turbulence: number;

      // Oracle mode takes priority
      if (oracleActive && !cascadeClearing) {
        if (isOracleEdge) {
          numParticles = 8; speed = 1.5; opacity = 1.0; turbulence = 0.0;
        } else if (touchesOracle) {
          numParticles = 3; speed = 0.4; opacity = 0.5; turbulence = 0.0;
        } else {
          numParticles = 0; speed = 0; opacity = 0; turbulence = 0;
        }
      } else if (isSelected) {
        numParticles = SELECT_PARTICLES; speed = 0.35; opacity = 1.0; turbulence = 0.0;
      } else if (isHovered) {
        numParticles = HOVER_PARTICLES; speed = 0.25; opacity = 0.8; turbulence = 0.0;
      } else if (selectedId) {
        // A node is selected but this edge isn't connected — very faint ambient
        numParticles = 1; speed = 0.04; opacity = 0.1; turbulence = 0.1;
      } else if (isEdgeTypeMatch) {
        numParticles = 4; speed = 0.3; opacity = 1.0; turbulence = 0.0;
      } else if (hasEdgeHighlight) {
        numParticles = 0; speed = 0; opacity = 0; turbulence = 0;
      } else if (isBothInDiscipline) {
        numParticles = 5; speed = 0.3; opacity = 0.95; turbulence = 0.0;
      } else if (isDisciplineEdge) {
        numParticles = 3; speed = 0.2; opacity = 0.7; turbulence = 0.0;
      } else {
        numParticles = AMBIENT_PARTICLES_PER_EDGE; speed = 0.06 + (i % 5) * 0.01; opacity = 0.15; turbulence = 0.15;
      }

      if (numParticles === 0) continue;

      for (let p = 0; p < numParticles && pIdx < maxParticles; p++) {
        if (pIdx >= particles.length) break;

        const particle = particles[pIdx];
        particle.edgeIndex = i;
        particle.baseOpacity = opacity;
        particle.speed = speed + p * (speed * 0.15);

        // Advance progress
        particle.progress += particle.speed * deltaTime;
        if (particle.progress > 1.0) particle.progress -= 1.0;

        // Interpolate position along edge
        const ep = edgePositions[i];
        const t = particle.progress;
        const baseX = ep.sx + (ep.tx - ep.sx) * t;
        const baseY = ep.sy + (ep.ty - ep.sy) * t;
        const baseZ = ep.sz + (ep.tz - ep.sz) * t;

        // Turbulence: only for ambient particles
        if (turbulence > 0.01) {
          const turbAmp = turbulence * Math.sin(t * Math.PI);
          const turbFreq = time * 2.0 + pIdx * 1.7;
          positions[pIdx * 3] = baseX + Math.sin(turbFreq) * turbAmp;
          positions[pIdx * 3 + 1] = baseY + Math.cos(turbFreq * 0.7) * turbAmp;
          positions[pIdx * 3 + 2] = baseZ + Math.sin(turbFreq * 1.3) * turbAmp * 0.5;
        } else {
          positions[pIdx * 3] = baseX;
          positions[pIdx * 3 + 1] = baseY;
          positions[pIdx * 3 + 2] = baseZ;
        }

        // Fade at endpoints
        const endFade = Math.sin(t * Math.PI);
        opacities[pIdx] = particle.baseOpacity * endFade;

        // Color
        if (oracleActive && !cascadeClearing && (isOracleEdge || touchesOracle)) {
          // Oracle: golden amber particles (#E8A030 → white blend)
          if (isOracleEdge) {
            // Bright gold-white
            colors[pIdx * 3] = 0.95;
            colors[pIdx * 3 + 1] = 0.78;
            colors[pIdx * 3 + 2] = 0.3;
          } else {
            // Dimmer amber
            colors[pIdx * 3] = 0.91;
            colors[pIdx * 3 + 1] = 0.63;
            colors[pIdx * 3 + 2] = 0.19;
          }
        } else if (isEdgeTypeMatch && !isSelected && !isHovered) {
          // Edge type spotlight: bright, push toward white
          const ec = edgeColors[i];
          colors[pIdx * 3] = ec.r * 0.4 + 0.6;
          colors[pIdx * 3 + 1] = ec.g * 0.4 + 0.6;
          colors[pIdx * 3 + 2] = ec.b * 0.4 + 0.6;
        } else if (disciplineColor && isDisciplineEdge && !isSelected && !isHovered) {
          // Discipline mode: use discipline color, brightened
          const dc = disciplineColor;
          if (isBothInDiscipline) {
            // Full saturation + push toward white
            colors[pIdx * 3] = dc.r * 0.5 + 0.5;
            colors[pIdx * 3 + 1] = dc.g * 0.5 + 0.5;
            colors[pIdx * 3 + 2] = dc.b * 0.5 + 0.5;
          } else {
            // Cross-discipline: slightly dimmer
            colors[pIdx * 3] = dc.r * 0.6 + 0.3;
            colors[pIdx * 3 + 1] = dc.g * 0.6 + 0.3;
            colors[pIdx * 3 + 2] = dc.b * 0.6 + 0.3;
          }
        } else if (isSelected || isHovered) {
          const ec = edgeColors[i];
          colors[pIdx * 3] = ec.r * 0.5 + 0.5;
          colors[pIdx * 3 + 1] = ec.g * 0.5 + 0.5;
          colors[pIdx * 3 + 2] = ec.b * 0.5 + 0.5;
        } else {
          const ec = edgeColors[i];
          colors[pIdx * 3] = ec.r;
          colors[pIdx * 3 + 1] = ec.g;
          colors[pIdx * 3 + 2] = ec.b;
        }

        pIdx++;
      }
    }

    // Zero out unused particles
    for (let i = pIdx; i < maxParticles; i++) {
      opacities[i] = 0;
    }

    posAttr.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  return { points, update };
}
