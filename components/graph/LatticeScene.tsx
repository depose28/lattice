"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BACKGROUND_COLOR, DISCIPLINE_COLORS } from "@/lib/constants";
import { createPostProcessing } from "@/lib/three/postprocessing";
import { loadGraphData } from "@/lib/graph/loader";
import { computeLayout } from "@/lib/graph/layout";
import { createNeuronNodes, type NeuronSystem } from "@/components/graph/NeuronNodes";
import { createDendriteEdges, type DendriteSystem } from "@/components/graph/DendriteEdges";
import { createEdgeParticles, type ParticleSystem } from "@/components/graph/EdgeParticles";
import { Tooltip } from "@/components/ui/Tooltip";
import { InfoPanel } from "@/components/ui/InfoPanel";
import { useGraphStore } from "@/store/graphStore";
import type { LayoutNode } from "@/lib/graph/types";
import { playFireSound, playHoverSound, enableAudio } from "@/lib/audio";

// Simple 2D noise for camera sway (no dependency needed)
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const smooth = f * f * (3 - 2 * f); // smoothstep
  return noise2D(i, seed) * (1 - smooth) + noise2D(i + 1, seed) * smooth;
}

function SynapseModeOverlay() {
  const synapseMode = useGraphStore((s) => s.synapseMode);
  const exitSynapse = useGraphStore((s) => s.exitSynapseMode);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  if (!synapseMode) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full border border-[#2A3B47]/60 bg-[#070B0F]/80 backdrop-blur-sm">
      <div className="w-2 h-2 rounded-full bg-[#8CB4CC] animate-pulse" />
      <span className="font-mono text-[10px] text-[#6A8A9A] tracking-wider uppercase">
        Synapse Mode
      </span>
      <span className="font-mono text-[9px] text-[#4A6A7A]">
        click labels to explore · esc to exit
      </span>
      <button
        onClick={() => {
          exitSynapse();
          setSelectedNode(null);
        }}
        className="ml-2 font-mono text-[9px] text-[#6A8A9A] hover:text-[#B0D0E8] transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

export function LatticeScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const frameIdRef = useRef<number>(0);
  const nodesMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const neuronSystemRef = useRef<NeuronSystem | null>(null);
  const dendriteSystemRef = useRef<DendriteSystem | null>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const layoutNodesRef = useRef<LayoutNode[]>([]);
  const neighborMapRef = useRef<Map<string, Set<string>>>(new Map());
  const edgesRef = useRef<import("@/lib/graph/types").EdgeData[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const clockRef = useRef(new THREE.Clock());
  const prevHoveredRef = useRef<string | null>(null);
  const preSynapseCamera = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const prevSynapseFocusRef = useRef<string | null>(null);
  const wasSynapseModeRef = useRef(false);

  const [visibleLabels, setVisibleLabels] = useState<
    { id: string; name: string; x: number; y: number; opacity: number; isFocused?: boolean }[]
  >([]);
  const [oracleEdgeLabels, setOracleEdgeLabels] = useState<
    { key: string; label: string; x: number; y: number; color: string }[]
  >([]);

  const [tooltipData, setTooltipData] = useState<{
    name: string;
    discipline: string;
    x: number;
    y: number;
  } | null>(null);

  const setGraphData = useGraphStore((s) => s.setGraphData);
  const setLoadProgress = useGraphStore((s) => s.setLoadProgress);
  const setHoveredNode = useGraphStore((s) => s.setHoveredNode);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const fireNode = useGraphStore((s) => s.fireNode);
  const isSynapseMode = useGraphStore((s) => s.synapseMode);
  const synapseFocusId = useGraphStore((s) => s.synapseFocusId);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const mesh = nodesMeshRef.current;
    if (!container || !camera || !mesh) return;

    const rect = container.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    // Scale hit area based on camera distance — more forgiving when zoomed out
    const camDist = camera.position.length();
    const hitScale = Math.max(4.0, camDist * 0.035);
    if (mesh.geometry.boundingSphere) {
      mesh.geometry.boundingSphere.radius = hitScale;
    }
    const intersects = raycasterRef.current.intersectObject(mesh);

    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      const idx = intersects[0].instanceId;
      const node = layoutNodesRef.current[idx];
      if (node) {
        if (prevHoveredRef.current !== node.id) {
          prevHoveredRef.current = node.id;
          playHoverSound();
        }
        container.style.cursor = "pointer";
        setHoveredNode(node.id);
        setTooltipData({
          name: node.name,
          discipline: node.discipline,
          x: e.clientX,
          y: e.clientY,
        });
      }
    } else {
      prevHoveredRef.current = null;
      container.style.cursor = "default";
      setHoveredNode(null);
      setTooltipData(null);
    }
  }, [setHoveredNode]);

  // Camera fly-to animation state
  const flyToRef = useRef<{
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const handleClick = useCallback(() => {
    // Enable audio on first interaction (requires user gesture)
    enableAudio();
    const state = useGraphStore.getState();
    const hoveredId = state.hoveredNodeId;
    if (hoveredId) {
      setSelectedNode(hoveredId);
      fireNode(hoveredId, 1.0);
      playFireSound(1.0);
    } else {
      // Clicking empty space — exit synapse mode if active
      if (state.synapseMode) {
        state.exitSynapseMode();
      }
      setSelectedNode(null);
    }
  }, [setSelectedNode, fireNode]);

  const enterSynapseMode = useGraphStore((s) => s.enterSynapseMode);
  const exitSynapseMode = useGraphStore((s) => s.exitSynapseMode);
  const synapseFlyTo = useGraphStore((s) => s.synapseFlyTo);

  const handleDoubleClick = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const state = useGraphStore.getState();
    const hoveredId = state.hoveredNodeId;
    if (!camera || !controls || !hoveredId) return;

    const node = layoutNodesRef.current.find((n) => n.id === hoveredId);
    if (!node) return;

    // Save camera position for return
    if (!state.synapseMode) {
      preSynapseCamera.current = {
        pos: camera.position.clone(),
        target: controls.target.clone(),
      };
    }

    const nodePos = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
    // Fly close — 15 units from node, with a slight upward offset for cinematic angle
    const dir = camera.position.clone().sub(nodePos).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const tiltedDir = dir.clone().add(up.multiplyScalar(0.3)).normalize();
    const endPos = nodePos.clone().add(tiltedDir.multiplyScalar(18));

    flyToRef.current = {
      startPos: camera.position.clone(),
      endPos,
      startTarget: controls.target.clone(),
      endTarget: nodePos,
      startTime: -1,
      duration: 1.2,
    };

    enterSynapseMode(hoveredId);
    fireNode(hoveredId, 1.0);
    playFireSound(1.0);
  }, [enterSynapseMode, fireNode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clock = clockRef.current;
    clock.start();

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);
    scene.fog = new THREE.Fog(BACKGROUND_COLOR, 300, 1000);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = true;
    controls.minDistance = 20;
    controls.maxDistance = 400;
    controls.rotateSpeed = 0.5;
    controls.autoRotateSpeed = 0.4; // very slow — contemplative
    controlsRef.current = controls;

    // Post-processing
    const { composer, filmGrainPass } = createPostProcessing(renderer, scene, camera);

    // Render loop — use getDelta() only to avoid timing conflicts
    let elapsed = 0;
    let frameCount = 0;
    let nextIdleFire = 18; // delayed past boot sequence (~12s total)
    let bootSequenceStarted = false;
    let currentViewShift = 0; // smooth transition for panel offset
    const INFO_PANEL_WIDTH = 360;
    const ORACLE_PANEL_WIDTH = 580;
    const tempVec = new THREE.Vector3();
    function animate() {
      frameIdRef.current = requestAnimationFrame(animate);
      const deltaTime = clock.getDelta();
      elapsed += deltaTime;

      // Single store read per frame
      const frameState = useGraphStore.getState();

      // Shift viewport when panels are open so graph stays centered
      // Right InfoPanel → shift left (positive offset)
      // Left Oracle panel → shift right (negative offset)
      const rightPanelOpen = frameState.selectedNodeId !== null;
      const leftPanelOpen = frameState.oracleMode && frameState.oracleResults.length > 0 && frameState.cascadePhase === "settled";
      let targetShift = 0;
      if (rightPanelOpen && leftPanelOpen) {
        targetShift = (ORACLE_PANEL_WIDTH - INFO_PANEL_WIDTH) / 2; // offset for asymmetric panels
      } else if (rightPanelOpen) {
        targetShift = INFO_PANEL_WIDTH / 2;
      } else if (leftPanelOpen) {
        targetShift = -ORACLE_PANEL_WIDTH / 2;
      }
      currentViewShift += (targetShift - currentViewShift) * 0.08;
      if (Math.abs(currentViewShift) > 0.5) {
        const w = container!.clientWidth;
        const h = container!.clientHeight;
        camera.setViewOffset(w, h, currentViewShift, 0, w, h);
      } else if (currentViewShift !== 0) {
        currentViewShift = 0;
        camera.clearViewOffset();
      }

      // Update film grain time uniform
      filmGrainPass.uniforms.uTime.value = elapsed;

      // Update neuron activation system
      const neuronSystem = neuronSystemRef.current;
      if (neuronSystem) {
        neuronSystem.update(elapsed);
      }

      // Update dendrite edges (pulses need time)
      const dendriteSystem = dendriteSystemRef.current;
      if (dendriteSystem) {
        dendriteSystem.update(elapsed);
      }

      // Update edge particles
      const particleSystem = particleSystemRef.current;
      if (particleSystem) {
        particleSystem.update(elapsed, deltaTime);
      }


      // Idle firing — ambient life when nothing is selected or hovered
      if (!frameState.selectedNodeId && !frameState.hoveredNodeId && elapsed > nextIdleFire && layoutNodesRef.current.length > 0) {
        const randomIdx = Math.floor(Math.random() * layoutNodesRef.current.length);
        const randomNode = layoutNodesRef.current[randomIdx];
        fireNode(randomNode.id, 0.6 + Math.random() * 0.4);
        nextIdleFire = elapsed + 4 + Math.random() * 4; // next fire in 4-8s
      }

      // Check for fly-to-node request (from search / navigation)
      // Recenters the view on the node without zooming in — keeps current distance
      const flyToNodeId = frameState.flyToNodeId;
      if (flyToNodeId && !flyToRef.current) {
        const targetNode = layoutNodesRef.current.find((n) => n.id === flyToNodeId);
        if (targetNode) {
          const targetPos = new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z);
          // Keep current camera distance from target — just pan, don't zoom
          const currentDist = camera.position.distanceTo(controls.target);
          const dir = camera.position.clone().sub(controls.target).normalize();
          flyToRef.current = {
            startPos: camera.position.clone(),
            endPos: targetPos.clone().add(dir.multiplyScalar(currentDist)),
            startTarget: controls.target.clone(),
            endTarget: targetPos,
            startTime: -1,
            duration: 0.9,
          };
        }
        frameState.setFlyToNode(null);
      }

      // Check for fly-to-home (reset camera to initial overview)
      const flyToHome = frameState.flyToHome;
      if (flyToHome && !flyToRef.current) {
        const homeDist = controls.maxDistance;
        flyToRef.current = {
          startPos: camera.position.clone(),
          endPos: new THREE.Vector3(0, 0, homeDist),
          startTarget: controls.target.clone(),
          endTarget: new THREE.Vector3(0, 0, 0),
          startTime: -1,
          duration: 1.0,
        };
        frameState.setFlyToHome(false);
      }

      // Check for oracle fly-to target (frame the oracle constellation)
      const oracleFlyTarget = frameState.oracleFlyTarget;
      if (oracleFlyTarget && !flyToRef.current) {
        const targetPos = new THREE.Vector3(oracleFlyTarget.x, oracleFlyTarget.y, oracleFlyTarget.z);
        const dir = camera.position.clone().sub(controls.target).normalize();
        flyToRef.current = {
          startPos: camera.position.clone(),
          endPos: targetPos.clone().add(dir.multiplyScalar(oracleFlyTarget.distance)),
          startTarget: controls.target.clone(),
          endTarget: targetPos,
          startTime: -1,
          duration: 1.2, // slower, more dramatic for oracle reveal
        };
        frameState.setOracleFlyTarget(null);
      }

      // Check for fly-to-discipline request
      const flyToDiscipline = frameState.flyToDiscipline;
      if (flyToDiscipline && !flyToRef.current) {
        const disciplineNodes = layoutNodesRef.current.filter(
          (n) => n.discipline === flyToDiscipline,
        );
        if (disciplineNodes.length > 0) {
          const centroid = new THREE.Vector3();
          for (const n of disciplineNodes) {
            centroid.add(new THREE.Vector3(n.position.x, n.position.y, n.position.z));
          }
          centroid.divideScalar(disciplineNodes.length);
          const dir = camera.position.clone().sub(controls.target).normalize();
          flyToRef.current = {
            startPos: camera.position.clone(),
            endPos: centroid.clone().add(dir.multiplyScalar(50)),
            startTarget: controls.target.clone(),
            endTarget: centroid,
            startTime: -1,
            duration: 0.8,
          };
        }
        frameState.setFlyToDiscipline(null);
      }

      // Synapse mode — detect exit and fly back to overview
      if (wasSynapseModeRef.current && !frameState.synapseMode) {
        // Just exited synapse mode — fly back
        if (preSynapseCamera.current && !flyToRef.current) {
          flyToRef.current = {
            startPos: camera.position.clone(),
            endPos: preSynapseCamera.current.pos,
            startTarget: controls.target.clone(),
            endTarget: preSynapseCamera.current.target,
            startTime: -1,
            duration: 1.0,
          };
          preSynapseCamera.current = null;
        }
        prevSynapseFocusRef.current = null;
      }
      wasSynapseModeRef.current = frameState.synapseMode;
      if (frameState.synapseMode && frameState.synapseFocusId) {
        if (prevSynapseFocusRef.current !== null && prevSynapseFocusRef.current !== frameState.synapseFocusId && !flyToRef.current) {
          const targetNode = layoutNodesRef.current.find((n) => n.id === frameState.synapseFocusId);
          if (targetNode) {
            const targetPos = new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z);
            // Arc-fly: compute a midpoint offset perpendicular to the travel line for a curved sweep
            const startPos = camera.position.clone();
            const startTarget = controls.target.clone();
            const travelDir = targetPos.clone().sub(startTarget).normalize();
            // Perpendicular vector for arc (cross with world up, fallback to camera right)
            const perp = new THREE.Vector3().crossVectors(travelDir, new THREE.Vector3(0, 1, 0)).normalize();
            if (perp.length() < 0.1) perp.crossVectors(travelDir, new THREE.Vector3(1, 0, 0)).normalize();
            // Arc midpoint — swing wide for cinematic feel
            const midOffset = perp.multiplyScalar(12 + Math.random() * 8);
            const midUp = new THREE.Vector3(0, 4 + Math.random() * 6, 0);
            const travelDist = startTarget.distanceTo(targetPos);
            const midPoint = startTarget.clone().lerp(targetPos, 0.5).add(midOffset).add(midUp);
            // End camera: 18 units from target, looking from midpoint direction
            const endDir = midPoint.clone().sub(targetPos).normalize();
            const endPos = targetPos.clone().add(endDir.multiplyScalar(18));

            // Use a quadratic bezier fly-to (stored as 3-point curve)
            flyToRef.current = {
              startPos,
              endPos,
              startTarget,
              endTarget: targetPos,
              startTime: -1,
              duration: Math.min(1.5, 0.6 + travelDist * 0.005), // longer for farther nodes
              // Store midpoint for bezier in the start/end — we'll compute bezier inline
              midPos: midPoint,
            } as typeof flyToRef.current & { midPos: THREE.Vector3 };
          }
        }
        prevSynapseFocusRef.current = frameState.synapseFocusId;
      }

      // Camera fly-to animation (linear or bezier arc)
      const flyTo = flyToRef.current;
      if (flyTo) {
        if (flyTo.startTime < 0) flyTo.startTime = elapsed;
        const t = Math.min((elapsed - flyTo.startTime) / flyTo.duration, 1.0);
        // Smooth ease-in-out
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const mid = (flyTo as { midPos?: THREE.Vector3 }).midPos;
        if (mid) {
          // Quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
          const u = 1 - ease;
          camera.position.set(
            u * u * flyTo.startPos.x + 2 * u * ease * mid.x + ease * ease * flyTo.endPos.x,
            u * u * flyTo.startPos.y + 2 * u * ease * mid.y + ease * ease * flyTo.endPos.y,
            u * u * flyTo.startPos.z + 2 * u * ease * mid.z + ease * ease * flyTo.endPos.z,
          );
        } else {
          camera.position.lerpVectors(flyTo.startPos, flyTo.endPos, ease);
        }
        controls.target.lerpVectors(flyTo.startTarget, flyTo.endTarget, ease);
        if (t >= 1.0) flyToRef.current = null;
      }

      // Camera idle sway — subtle Perlin-like drift
      if (!flyToRef.current) {
        const swaySpeed = 0.15;
        const swayAmount = 0.3;
        const sx = smoothNoise(elapsed * swaySpeed, 0) * swayAmount;
        const sy = smoothNoise(elapsed * swaySpeed, 42) * swayAmount;
        camera.position.x += sx * deltaTime;
        camera.position.y += sy * deltaTime;
      }

      // Sync auto-rotate from store
      controls.autoRotate = useGraphStore.getState().autoRotate;

      controls.update();
      composer.render();

      // Label display — every 6 frames
      frameCount++;
      if (frameCount % 6 === 0 && layoutNodesRef.current.length > 0 && container) {
        const raw: { id: string; name: string; x: number; y: number; opacity: number; isFocused?: boolean }[] = [];
        const w = container.clientWidth;
        const h = container.clientHeight;
        const storeState = useGraphStore.getState();
        const currentSelectedId = storeState.selectedNodeId;
        const currentHoveredId = storeState.hoveredNodeId;
        const activeEdgeTypes = storeState.activeEdgeTypes;

        const oracleFocused = storeState.oracleFocusedNodeId;
        const isOracleSettled = storeState.oracleMode && storeState.cascadePhase === "settled" && storeState.oracleActivatedNodes.size > 0;
        const focusId = isOracleSettled ? oracleFocused : (currentSelectedId ?? currentHoveredId);

        // Build visible neighbors — only through edges whose type is active
        const visibleNeighborIds = new Set<string>();
        if (focusId && !isOracleSettled) {
          for (const edge of edgesRef.current) {
            if (!activeEdgeTypes.has(edge.type)) continue;
            if (edge.source === focusId) visibleNeighborIds.add(edge.target);
            if (edge.target === focusId) visibleNeighborIds.add(edge.source);
          }
        }

        const projectNode = (node: LayoutNode): { sx: number; sy: number } | null => {
          tempVec.set(node.position.x, node.position.y, node.position.z);
          tempVec.project(camera);
          if (tempVec.z > 1) return null;
          const sx = (tempVec.x * 0.5 + 0.5) * w;
          const sy = (-tempVec.y * 0.5 + 0.5) * h;
          if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) return null;
          return { sx, sy };
        };

        // Skip hovered node in ambient labels — the Tooltip component handles it
        const shownIds = new Set<string>();
        if (currentHoveredId) {
          shownIds.add(currentHoveredId);
        }

        if (isOracleSettled) {
          // Oracle mode: show labels for all activated nodes
          const oracleNodes = storeState.oracleActivatedNodes;
          for (const node of layoutNodesRef.current) {
            if (!oracleNodes.has(node.id)) continue;
            if (shownIds.has(node.id)) continue;
            const proj = projectNode(node);
            if (!proj) continue;
            const isFocusedNode = node.id === oracleFocused;
            raw.push({
              id: node.id,
              name: node.name,
              x: proj.sx,
              y: proj.sy,
              opacity: isFocusedNode ? 1.0 : 0.65,
              isFocused: isFocusedNode,
            });
            shownIds.add(node.id);
          }
        } else if (focusId) {
          // Show labels for focus node + visible neighbors only
          for (const node of layoutNodesRef.current) {
            if (shownIds.has(node.id)) continue;
            if (node.id !== focusId && !visibleNeighborIds.has(node.id)) continue;
            const proj = projectNode(node);
            if (!proj) continue;
            raw.push({
              id: node.id,
              name: node.name,
              x: proj.sx,
              y: proj.sy,
              opacity: node.id === focusId ? 1.0 : 0.75,
              isFocused: node.id === focusId,
            });
            shownIds.add(node.id);
          }
        } else {
          // No selection — only show labels when zoomed in close
          const dist = camera.position.length();
          const labelThreshold = dist * 0.25;
          for (const node of layoutNodesRef.current) {
            if (shownIds.has(node.id)) continue;
            if (raw.length >= 15) break;
            tempVec.set(node.position.x, node.position.y, node.position.z);
            const nodeDist = tempVec.distanceTo(camera.position);
            if (nodeDist > labelThreshold) continue;
            const proj = projectNode(node);
            if (!proj) continue;
            const opacity = 1.0 - (nodeDist / labelThreshold);
            raw.push({ id: node.id, name: node.name, x: proj.sx, y: proj.sy, opacity: Math.min(opacity * 2, 0.45) });
            shownIds.add(node.id);
          }
        }

        // Overlap resolution — nudge overlapping labels down instead of hiding them
        raw.sort((a, b) => b.opacity - a.opacity);
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        const charW = 5.5;
        const labelH = 14;

        for (const label of raw) {
          const lw = label.name.length * charW + 16;
          let lx = label.x + 8;
          let ly = label.y - 4;

          // Try nudging down up to 5 times to avoid overlaps
          for (let attempt = 0; attempt < 5; attempt++) {
            let hasOverlap = false;
            for (const p of placed) {
              if (lx < p.x + p.w && lx + lw > p.x && ly < p.y + p.h && ly + labelH > p.y) {
                hasOverlap = true;
                ly = p.y + p.h + 1; // nudge below the conflicting label
                break;
              }
            }
            if (!hasOverlap) break;
          }

          placed.push({ x: lx, y: ly, w: lw, h: labelH });
          label.x = lx - 8;
          label.y = ly + 4;
        }

        setVisibleLabels(raw);

        // Clear oracle edge labels — node names are shown instead
        if (oracleEdgeLabels.length > 0) setOracleEdgeLabels([]);
      }
    }
    animate();

    // Load data, compute layout, and add to scene
    loadGraphData().then(({ nodes, edges }) => {
      const layoutNodes = computeLayout(nodes, edges, (count) => {
        setLoadProgress(count);
      });
      layoutNodesRef.current = layoutNodes;

      const neuronSystem = createNeuronNodes(layoutNodes, scene, edges);
      neuronSystemRef.current = neuronSystem;
      nodesMeshRef.current = neuronSystem.mesh;

      dendriteSystemRef.current = createDendriteEdges(layoutNodes, edges, scene);
      particleSystemRef.current = createEdgeParticles(layoutNodes, edges, scene);
      setGraphData(layoutNodes, edges);

      // Build neighbor map for label display
      const nMap = new Map<string, Set<string>>();
      for (const edge of edges) {
        if (!nMap.has(edge.source)) nMap.set(edge.source, new Set());
        if (!nMap.has(edge.target)) nMap.set(edge.target, new Set());
        nMap.get(edge.source)!.add(edge.target);
        nMap.get(edge.target)!.add(edge.source);
      }
      neighborMapRef.current = nMap;
      edgesRef.current = edges;

      // Auto-frame camera to fit graph
      let maxDist = 0;
      for (const node of layoutNodes) {
        const d = Math.sqrt(
          node.position.x ** 2 + node.position.y ** 2 + node.position.z ** 2,
        );
        if (d > maxDist) maxDist = d;
      }
      const fov = camera.fov * (Math.PI / 180);
      const cameraZ = (maxDist * 0.95) / Math.tan(fov / 2);
      const initialZ = Math.max(cameraZ, 50);
      camera.position.set(0, 0, initialZ);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      // Allow zooming out past the initial view
      controls.maxDistance = initialZ * 1.35;
      controls.update();

      // Boot sequence — disciplines light up one by one like a brain powering on
      if (!bootSequenceStarted) {
        bootSequenceStarted = true;
        const disciplineOrder = Object.keys(DISCIPLINE_COLORS) as (keyof typeof DISCIPLINE_COLORS)[];

        // Group nodes by discipline
        const disciplineGroups = new Map<string, LayoutNode[]>();
        for (const node of layoutNodes) {
          if (!disciplineGroups.has(node.discipline)) disciplineGroups.set(node.discipline, []);
          disciplineGroups.get(node.discipline)!.push(node);
        }

        const bootStartDelay = 800; // wait for loading screen to fade
        const disciplineInterval = 500; // ms between each discipline activation
        const nodeStagger = 15; // ms between nodes within a discipline

        disciplineOrder.forEach((discipline, dIdx) => {
          const groupNodes = disciplineGroups.get(discipline) ?? [];
          const baseDelay = bootStartDelay + dIdx * disciplineInterval;

          // Shuffle nodes — fire ALL nodes in each discipline for full coverage
          const shuffled = [...groupNodes].sort(() => Math.random() - 0.5);

          // Wave 1: primary fire — all nodes, high intensity
          shuffled.forEach((node, nIdx) => {
            const delay = baseDelay + nIdx * nodeStagger;
            const intensity = 0.7 + Math.random() * 0.3; // 0.7–1.0
            setTimeout(() => {
              fireNode(node.id, intensity);
            }, delay);
          });

          // Hero nodes: 3 bright focal points per discipline
          const heroCount = Math.min(3, groupNodes.length);
          for (let h = 0; h < heroCount; h++) {
            const hero = groupNodes[Math.floor(Math.random() * groupNodes.length)];
            setTimeout(() => {
              fireNode(hero.id, 1.0);
              if (h === 0) playFireSound(0.15 + dIdx * 0.06);
            }, baseDelay + 30 + h * 80);
          }

          // Wave 2: afterglow re-fire — ~2s after primary, softer intensity
          // This catches nodes as they're fading and re-ignites them gently
          const afterglowDelay = baseDelay + 2200;
          const afterglowBatch = shuffled.slice(0, Math.ceil(groupNodes.length * 0.6));
          afterglowBatch.forEach((node, nIdx) => {
            setTimeout(() => {
              fireNode(node.id, 0.4 + Math.random() * 0.25);
            }, afterglowDelay + nIdx * 20);
          });
        });

        // Wave 3: final ambient glow — scattered re-fires across ALL disciplines
        // Keeps the whole graph warm as individual disciplines finish fading
        const allNodes = [...layoutNodes];
        const finalWaveDelay = bootStartDelay + disciplineOrder.length * disciplineInterval + 2500;
        const finalBatch = allNodes.sort(() => Math.random() - 0.5).slice(0, 120);
        finalBatch.forEach((node, idx) => {
          setTimeout(() => {
            fireNode(node.id, 0.3 + Math.random() * 0.3);
          }, finalWaveDelay + idx * 30);
        });
      }
    });

    // Keyboard navigation
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const state = useGraphStore.getState();

      if (e.key === "Escape") {
        if (state.synapseMode) {
          state.exitSynapseMode();
          state.setSelectedNode(null);
        } else if (state.selectedNodeId) {
          state.setSelectedNode(null);
        }
        return;
      }

      // Backspace — go back in history
      if (e.key === "Backspace" && state.navigationHistory.length > 0) {
        e.preventDefault();
        state.goBack();
        return;
      }

      // R — random neuron (date-seeded for "neuron of the day", Shift+R for truly random)
      if (e.key === "r" || e.key === "R") {
        const nodes = state.nodes;
        if (nodes.length === 0) return;
        let idx: number;
        if (e.shiftKey) {
          idx = Math.floor(Math.random() * nodes.length);
        } else {
          // Date-seeded: same neuron all day
          const today = new Date();
          const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
          idx = seed % nodes.length;
        }
        const node = nodes[idx];
        state.navigateToNode(node.id);
        state.fireNode(node.id, 1.0);
        playFireSound(0.6);
        return;
      }

      // F — fly to selected node
      if (e.key === "f" || e.key === "F") {
        if (state.selectedNodeId) {
          state.setFlyToNode(state.selectedNodeId);
        }
        return;
      }

      // 1-9 — toggle disciplines
      if (e.key >= "1" && e.key <= "9" && !e.metaKey && !e.ctrlKey) {
        const disciplineKeys = Object.keys(DISCIPLINE_COLORS) as (keyof typeof DISCIPLINE_COLORS)[];
        const idx = parseInt(e.key) - 1;
        if (idx < disciplineKeys.length) {
          state.toggleDiscipline(disciplineKeys[idx]);
        }
        return;
      }
      // 0 — toggle all disciplines
      if (e.key === "0" && !e.metaKey && !e.ctrlKey) {
        const disciplineKeys = Object.keys(DISCIPLINE_COLORS) as (keyof typeof DISCIPLINE_COLORS)[];
        const allActive = disciplineKeys.every((d) => state.activeDisciplines.has(d));
        for (const d of disciplineKeys) {
          const isActive = state.activeDisciplines.has(d);
          if (allActive) {
            // Turn all off
            if (isActive) state.toggleDiscipline(d);
          } else {
            // Turn all on
            if (!isActive) state.toggleDiscipline(d);
          }
        }
        return;
      }

      // Arrow keys — cycle through connections of selected node
      if ((e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab") && state.selectedNodeId) {
        e.preventDefault();
        const connectedEdges = state.edges
          .filter((edge) => edge.source === state.selectedNodeId || edge.target === state.selectedNodeId)
          .sort((a, b) => b.strength - a.strength)
          .slice(0, 8);

        if (connectedEdges.length === 0) return;

        const neighborIds = connectedEdges.map((edge) =>
          edge.source === state.selectedNodeId ? edge.target : edge.source,
        );

        // Find current selection in neighbor list, move to next/prev
        const currentIdx = neighborIds.indexOf(state.selectedNodeId);
        let nextIdx: number;
        if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
          nextIdx = currentIdx < neighborIds.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : neighborIds.length - 1;
        }

        const nextId = neighborIds[nextIdx];
        if (nextId) {
          state.navigateToNode(nextId);
          state.fireNode(nextId, 0.8);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);

    // Mouse events
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("click", handleClick);
    container.addEventListener("dblclick", handleDoubleClick);

    // Resize handler
    function onResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("click", handleClick);
      container.removeEventListener("dblclick", handleDoubleClick);
      cancelAnimationFrame(frameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [setGraphData, setLoadProgress, handleMouseMove, handleClick, handleDoubleClick, fireNode]);

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 w-full h-full"
        style={{ background: BACKGROUND_COLOR }}
      />
      {tooltipData && (
        <Tooltip
          name={tooltipData.name}
          discipline={tooltipData.discipline}
          x={tooltipData.x}
          y={tooltipData.y}
        />
      )}
      {visibleLabels.map((label) => {
        const isFocus = synapseFocusId === label.id;
        return (
          <button
            key={label.id}
            onClick={() => {
              if (isSynapseMode && !isFocus) {
                synapseFlyTo(label.id);
                fireNode(label.id, 1.0);
                playFireSound(0.7);
              } else {
                setSelectedNode(label.id);
                fireNode(label.id, 1.0);
              }
            }}
            className={`fixed font-mono whitespace-nowrap transition-colors duration-150 cursor-pointer z-10 ${
              isSynapseMode
                ? isFocus
                  ? "text-[11px] font-bold"
                  : "text-[9px] hover:text-[#E0F0FF]"
                : label.isFocused
                  ? "text-[9px] font-medium"
                  : "text-[8px] hover:text-[#B0D0E8]"
            }`}
            style={{
              left: label.x + 8,
              top: label.y - 4,
              color: isSynapseMode
                ? isFocus ? "#E0F0FF" : "#8CB4CC"
                : label.isFocused ? "#D8ECF8" : label.opacity > 0.6 ? "#A0C0D4" : "#6A8A9A",
              opacity: isSynapseMode ? (isFocus ? 1.0 : 0.85) : label.opacity,
              textShadow: label.isFocused ? "0 0 6px rgba(180,210,230,0.3)" : isSynapseMode ? "0 0 8px rgba(140,180,204,0.4)" : "none",
            }}
          >
            {isSynapseMode && !isFocus ? "→ " : ""}{label.name}
          </button>
        );
      })}
      {oracleEdgeLabels.map((el) => (
        <span
          key={el.key}
          className="fixed font-mono text-[8px] tracking-wider uppercase whitespace-nowrap z-10 pointer-events-none"
          style={{
            left: el.x,
            top: el.y,
            color: el.color,
            opacity: 0.6,
            transform: "translate(-50%, -50%)",
            textShadow: `0 0 6px ${el.color}40`,
          }}
        >
          {el.label}
        </span>
      ))}
      <InfoPanel />
      <SynapseModeOverlay />
    </>
  );
}
