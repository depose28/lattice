import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  BLOOM_RADIUS,
  FILM_GRAIN_INTENSITY,
} from "@/lib/constants";

// Film grain shader — subtle analog texture
const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uIntensity: { value: FILM_GRAIN_INTENSITY },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float noise = rand(vUv + fract(uTime)) * 2.0 - 1.0;
      color.rgb += noise * uIntensity;
      gl_FragColor = color;
    }
  `,
};

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { composer: EffectComposer; filmGrainPass: ShaderPass } {
  // Get the ACTUAL drawing buffer size (physical pixels, not CSS pixels)
  const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  // Create composer and immediately set pixel ratio BEFORE adding passes
  // so all render targets are created at the correct resolution
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  // Force re-create render targets at correct resolution
  const cssSize = renderer.getSize(new THREE.Vector2());
  composer.setSize(cssSize.x, cssSize.y);

  // Pass 1: Render scene
  composer.addPass(new RenderPass(scene, camera));

  // Pass 2: Bloom — tight, clinical, high threshold
  // Pass the PHYSICAL pixel size to bloom so its internal targets are sharp
  const bloomPass = new UnrealBloomPass(
    drawingBufferSize,
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  // Pass 3: Film grain — analog instrument texture
  const filmGrainPass = new ShaderPass(FilmGrainShader);
  composer.addPass(filmGrainPass);

  // Pass 4: Output (tone mapping + color space)
  composer.addPass(new OutputPass());

  return { composer, filmGrainPass };
}
