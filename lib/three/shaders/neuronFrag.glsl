uniform vec3 uRestColor;       // NEURON_REST #2A3B47
uniform vec3 uHoverColor;      // NEURON_HOVER #6A8A9A
uniform float uTime;

// Fog
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying float vActivation;
varying float vDecayPhase;
varying float vFogDepth;

// Thermal decay: white → yellow → amber → rest (exponential cooldown)
vec3 thermalDecay(float t, vec3 restCol) {
  vec3 white  = vec3(1.0, 1.0, 1.0);
  vec3 yellow = vec3(1.0, 0.9, 0.4);
  vec3 amber  = vec3(0.91, 0.63, 0.19);
  if (t < 0.15) return mix(white,  yellow, t / 0.15);
  if (t < 0.6)  return mix(yellow, amber,  (t - 0.15) / 0.45);
  return mix(amber, restCol, (t - 0.6) / 0.4);
}

// Sigmoid: crisp activation threshold
float sigmoid(float x, float k) {
  return 1.0 / (1.0 + exp(-k * (x - 0.5)));
}

void main() {
  // Resting color
  vec3 restColor = uRestColor;

  // Activation: thermal decay sequence
  float act = sigmoid(vActivation, 8.0);
  vec3 fireColor = thermalDecay(vDecayPhase, restColor);

  // Blend rest → fire based on activation
  vec3 color = mix(restColor, fireColor, act);

  // Fog
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  color = mix(color, fogColor, fogFactor);

  gl_FragColor = vec4(color, 1.0);
}
