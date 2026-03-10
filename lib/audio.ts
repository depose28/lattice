// Subtle ambient audio engine for neural activations
// Uses Web Audio API — no external dependencies

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isEnabled = false;

function getContext(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.08; // very quiet
      masterGain.connect(audioCtx.destination);
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function enableAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume();
  }
  isEnabled = true;
}

export function disableAudio() {
  isEnabled = false;
}

export function isAudioEnabled(): boolean {
  return isEnabled;
}

// Fire sound — brief sine tone that mimics a neural spike
// Pitch correlates with activation intensity
export function playFireSound(intensity: number = 1.0) {
  if (!isEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // Oscillator — clean sine, scientific instrument feel
  const osc = ctx.createOscillator();
  osc.type = "sine";
  // Base frequency 200-600Hz depending on intensity
  osc.frequency.value = 200 + intensity * 400;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  // Sharp attack (5ms)
  gain.gain.linearRampToValueAtTime(0.15 * intensity, now + 0.005);
  // Slow decay (300ms)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.35);
}

// Oracle submit — brief rising tone to indicate query sent
export function playOracleSubmitSound() {
  if (!isEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.linearRampToValueAtTime(600, now + 0.15);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.45);
}

// Hover sound — very subtle tick
export function playHoverSound() {
  if (!isEnabled) return;
  const ctx = getContext();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 800;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.03, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.06);
}
