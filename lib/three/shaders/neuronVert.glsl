// Per-instance attributes
attribute float aActivation;   // 0.0 = resting, 1.0 = peak fired
attribute float aDecayPhase;   // 0.0 = just fired, 1.0 = fully decayed
attribute float aPhaseOffset;  // per-node breathing jitter
attribute float aScale;        // base scale from degree

// Uniforms
uniform float uTime;

// Varyings
varying float vActivation;
varying float vDecayPhase;
varying float vFogDepth;

void main() {
  vActivation = aActivation;
  vDecayPhase = aDecayPhase;

  // Breathing: desynchronized ±1.5% scale oscillation
  float breath = 1.0 + sin(uTime * 0.25 + aPhaseOffset) * 0.015;

  // Activation pulse: slight scale increase at peak (up to +15%)
  float activationScale = 1.0 + aActivation * 0.15;

  vec3 scaled = position * aScale * breath * activationScale;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);

  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
