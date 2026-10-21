// Fragment shaders for the getlayers.ai gradients, verbatim from their
// prompts, with the palettes retinted to the deep blue and silver of
// index.css through CONFIG only (the prompts' rule: never edit the GLSL to
// change a colour). LayersGradient.tsx runs them.

export type GradientConfig = Record<string, string | number>

// "Antipode": two masses of light leaning against each other, brightest at
// the seam where they still disagree. Here a deep blue mass meets a silver
// one — the student group and the brand meeting — and the tilt turns the
// silver up to the top right, away from the copy at the bottom left.
export const ANTIPODE = {
  config: {
    bgColor: "#0b1a3e",
    colorA: "#102552",
    colorB: "#9aabc7",
    colorC: "#1f4cb3",
    colorD: "#f2f5fa",
    scale: 0.95,
    speed: 0.33,
    flow: 0.16,
    warp: 0.75,
    warpScale: 0.55,
    roughness: 0.42,
    lacunarity: 2.1,
    massBias: 1.1,
    tilt: -0.64,
    softness: 0.95,
    spill: 1.15,
    seamWidth: 0.42,
    seamGain: 0.5,
    bloom: 0.45,
    contrast: 1.1,
    midpoint: 0.5,
    glow: 0.1,
    grain: 0,
    grainAnim: 0,
    dither: 1.1,
    vignette: 0.22,
    pointerRadius: 0.75,
    pointerStrength: 0.45,
    pointerSeam: 0.35,
    parallax: 0.0043,
    maxDpr: 1,
  } satisfies GradientConfig,
  frag: `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;

uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;
uniform float uScale, uSpeed, uFlow, uWarp, uWarpScale, uRoughness, uLacunarity;
uniform float uMassBias, uTilt, uSoftness, uSpill, uSeamWidth, uSeamGain, uBloom;
uniform float uContrast, uMidpoint, uGlow, uGrain, uDither, uVignette;
uniform float uPointerRadius, uPointerStrength, uPointerSeam, uParallax;

#define OCTAVES 4

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float snoise(vec2 p) {
  const float K1 = 0.366025404, K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += amp * snoise(p);
    p *= uLacunarity;
    amp *= uRoughness;
  }
  return v;
}

vec3 ramp4(float t) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));
  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));
  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));
  return c;
}

float triDither(vec2 fc) {
  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  return (a + b - 1.0) / 255.0;
}

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

/* two octaves — the seam is one long curve, and a fine octave breaks it into sparks */
float mass(vec2 p) { return snoise(p) + uRoughness * snoise(p * uLacunarity); }


// ---- house grain. ONE look across the collection: an integer hash (no sin() streaks),
// triangular so it reads as film rather than static, weighted into the midtones so it
// never crusts a black or a white. Static by default; uGrainAnim re-seeds it 24×/s.
uniform float uGrainAnim;
float houseGrain(vec2 fc) {
  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)
          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;
  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  float a = float(n & 0xffffu) / 65535.0;
  n *= 3266489917u; n ^= n >> 16u;
  float b = float(n & 0xffffu) / 65535.0;
  return a + b - 1.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * uSpeed;

  vec2 d = uv - iMouse;
  float near = exp(-dot(d, d) / max(1e-4, uPointerRadius * uPointerRadius));

  vec2 p = (uv + d * near * uPointerStrength - iMouse * uParallax) * uScale;

  vec2 w = uWarp * vec2(mass(p * uWarpScale + vec2(0.0, t * uFlow)),
                        mass(p * uWarpScale + vec2(4.1, 2.6) - t * uFlow * 0.7));

  vec2 axisDir = vec2(-sin(uTilt), cos(uTilt));
  float axis = dot(uv, axisDir);

  float a = mass(p + w) + axis * uMassBias;                 // the warm body
  float b = mass(p + w + vec2(9.3, 5.7)) - axis * uMassBias; // the cool one
  float diff = (a - b) * uSoftness;

  /* Colour SPILLS from the seam and dies away from it. Reading the two masses as
     half-planes fills the frame with two flat colours and the picture becomes a
     flag; an exponential in |difference| puts the light where the two are still
     arguing and lets everything else fall to the ground. */
  float spill = exp(-abs(diff) * uSpill);
  float warmAmt = smoothstep(0.0, 0.55, diff) * spill;
  float coolAmt = smoothstep(0.0, 0.55, -diff) * spill;
  float seam = exp(-diff * diff / max(1e-4, uSeamWidth * uSeamWidth));

  vec3 col = uColorA;
  col = mix(col, uColorB, clamp(warmAmt * uContrast, 0.0, 0.92));
  col = mix(col, uColorC, clamp(coolAmt * uContrast, 0.0, 0.92));
  col += uColorD * seam * (uSeamGain + near * uPointerSeam);
  col += uColorD * uBloom * exp(-diff * diff / max(1e-4, uSeamWidth * uSeamWidth * 9.0)) * 0.35;

  float lift = clamp(0.5 + axis * 0.5, 0.0, 1.0);
  col *= 0.55 + 0.90 * mix(lift, 1.0, uMidpoint * 0.6);
  col += uColorD * uGlow * seam * seam;
  col = mix(uBg, col, 0.92);

  col *= 1.0 - uVignette * dot(uv, uv);
  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }
  col += triDither(gl_FragCoord.xy) * uDither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
}

// "Interference": three slow emitters trading standing waves — bright
// fringes where the crests agree. Waves that meet in step grow brighter:
// the strength of doing it together. Deep blue rising to silver light.
export const INTERFERENCE = {
  config: {
    bgColor: "#0a1838",
    colorA: "#0f2350",
    colorB: "#1d4aa8",
    colorC: "#8fa6cf",
    colorD: "#f3f6fb",
    scale: 1.1,
    speed: 0.33,
    drift: 0.22,
    spread: 1.15,
    falloff: 1.85,
    softCore: 0.03,
    waveNumber: 22,
    pulse: 1.8,
    detune: 0.11,
    twist: 0.35,
    warp: 0.1,
    warpScale: 1.7,
    gain: 1.45,
    caustic: 0.9,
    sharp: 2.2,
    contrast: 1.8,
    midpoint: 0.28,
    sink: 0.4,
    glow: 0.1,
    grain: 0,
    grainAnim: 0,
    dither: 1.05,
    vignette: 0.16,
    pointerRadius: 0.7,
    pointerStrength: 0.55,
    pointerLift: 0.1,
    parallax: 0.0025,
    maxDpr: 1,
  } satisfies GradientConfig,
  frag: `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;          // aspect-corrected units, same space as uv

uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;
uniform float uScale, uSpeed, uDrift, uSpread, uFalloff, uSoftCore;
uniform float uWaveNumber, uPulse, uDetune, uTwist, uWarp, uWarpScale;
uniform float uGain, uCaustic, uSharp, uContrast, uMidpoint, uSink, uGlow;
uniform float uGrain, uDither, uVignette;
uniform float uPointerRadius, uPointerStrength, uPointerLift, uParallax;

#define EMITTERS 3

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

/* where emitter i is right now. A Lissajous orbit with an irrational-ish rate
   per emitter, so the seven never fall back into the arrangement they started
   in — the interference pattern has no period a viewer can learn. The golden
   angle on the phase keeps them from clustering at t = 0. */
vec2 emitter(float i, float td) {
  float a = i * 2.3999632;
  return uSpread * vec2(sin(td * (0.63 + 0.11 * i) + a * 1.7),
                        cos(td * (0.47 + 0.17 * i) - a * 2.3));
}

vec3 ramp4(float t) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));
  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));
  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));
  return c;
}

// triangular-PDF dither — the only reliable cure for 8-bit gradient banding
float triDither(vec2 fc) {
  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  return (a + b - 1.0) / 255.0;
}

// ---- house grain. ONE look across the collection: an integer hash (no sin() streaks),
// triangular so it reads as film rather than static, weighted into the midtones so it
// never crusts a black or a white. Static by default; uGrainAnim re-seeds it 24×/s.
uniform float uGrainAnim;
float houseGrain(vec2 fc) {
  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)
          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;
  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  float a = float(n & 0xffffu) / 65535.0;
  n *= 3266489917u; n ^= n >> 16u;
  float b = float(n & 0xffffu) / 65535.0;
  return a + b - 1.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * uSpeed;

  vec2 d = uv - iMouse;
  float near = exp(-dot(d, d) / max(1e-4, uPointerRadius * uPointerRadius));

  vec2 p0 = (uv - iMouse * uParallax) * uScale;

  // differential shear — the rotation grows with radius, so concentric rings
  // come out as slow pinwheels instead of circles, and the whole field turns
  // at a rate too low to read as a pan
  vec2 p = rot(p0, uTwist * length(p0) + t * 0.22);
  p += uWarp * vec2(sin(p.y * uWarpScale + t * 1.10),
                    cos(p.x * uWarpScale - t * 0.87));

  // sum of three radial waves. Each is a sine in distance, detuned from its
  // neighbours, attenuated exponentially so a source only reaches so far. That
  // attenuation is what draws the composition — the frame has bright rooms and
  // genuinely empty ones because the emitters are somewhere in particular, not
  // because a vignette was laid over the top.
  float w = 0.0;
  for (int i = 0; i < EMITTERS; i++) {
    float fi = float(i);
    vec2 r = p - emitter(fi, t * uDrift);
    float dist = sqrt(dot(r, r) + uSoftCore);
    w += sin(dist * uWaveNumber - t * uPulse * (1.0 + fi * uDetune) + fi * 1.7)
         * exp(-dist * uFalloff);
  }

  // the cursor is one more emitter, measured in untwisted space so its rings
  // stay true circles around the pointer while everything else is sheared
  vec2 rp = p0 - iMouse * uScale;
  float dp = sqrt(dot(rp, rp) + uSoftCore);
  w += uPointerStrength * sin(dp * uWaveNumber * 0.85 - t * uPulse * 1.31)
       * exp(-dp * uFalloff);

  // soft saturation: odd, smooth everywhere, asymptotic to ±1. Constructive
  // stacks roll off into the top of the ramp instead of clipping to a plateau
  // with a hard rim around it.
  w *= uGain;
  float sw = w * inversesqrt(1.0 + w * w);

  float smoothRead = sw * 0.5 + 0.5;             // alternating bright/dark rings
  float ridgeRead = pow(abs(sw), uSharp);        // bright fringes on a dark nodal web
  float f = mix(smoothRead, ridgeRead, uCaustic);
  f += near * uPointerLift;
  f = clamp((f - uMidpoint) * uContrast + 0.5, 0.0, 1.0);

  vec3 col = ramp4(f);
  col += uColorD * uGlow * pow(f, 5.0);
  col = mix(uBg, col, smoothstep(0.0, max(0.01, uSink), f) * 0.90 + 0.10);

  col *= 1.0 - uVignette * dot(uv, uv);
  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }
  col += triDither(gl_FragCoord.xy) * uDither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
}

// Stride's mesh gradient (its "Scene A"): soft gaussian blobs of deep navy
// (uDeep; blue-black in Stride) over a saturated blue, a bright glow bottom
// left and a softer one top right. Static, so it renders once to an image
// (meshGradient.ts).
export const MESH_FRAG = `precision highp float;
varying vec2 vUv;
uniform vec2  uResolution;
uniform vec3  uBase;
uniform vec3  uLight;
uniform vec3  uDeep;
uniform float uSeed;

// Soft elliptical gaussian blob — the building block of the smooth mesh gradient.
float blob(vec2 uv, vec2 c, vec2 r){ vec2 d = (uv - c) / r; return exp(-dot(d, d)); }

void main(){
  vec2 uv = vUv;                       // 0..1, (0,0) bottom-left
  vec3 navy   = uDeep; // the dark mass, a deep navy rather than Stride's blue-black
  vec3 ltblue = vec3(0.42, 0.60, 1.0);

  // Base: vivid blue, only a gentle vertical falloff (stays saturated).
  vec3 col = mix(uBase * 0.88, uBase * 1.08, smoothstep(0.0, 1.0, uv.y));

  // Per-blob offset — same style, different arrangement when uSeed != 0.
  vec2 o1 = 0.22 * vec2(sin(uSeed * 1.3), cos(uSeed * 1.9));
  vec2 o2 = 0.22 * vec2(sin(uSeed * 2.1 + 1.7), cos(uSeed * 1.1 + 0.6));
  vec2 o3 = 0.22 * vec2(sin(uSeed * 0.7 + 3.1), cos(uSeed * 2.4 + 2.2));
  vec2 o4 = 0.22 * vec2(sin(uSeed * 1.7 + 4.2), cos(uSeed * 0.9 + 5.0));

  // Smooth dark blobs — soft-edged, overlapping into one navy mass. No turbulence.
  float dark = 0.0;
  dark += blob(uv, vec2(0.06, 0.86) + o1, vec2(0.30, 0.34)) * 0.85;
  dark += blob(uv, vec2(0.34, 0.66) + o2, vec2(0.34, 0.34)) * 1.00;
  dark += blob(uv, vec2(0.66, 0.56) + o3, vec2(0.46, 0.32)) * 1.10;
  dark += blob(uv, vec2(0.95, 0.66) + o4, vec2(0.30, 0.36)) * 0.80;
  dark = smoothstep(0.10, 0.9, clamp(dark, 0.0, 1.0));
  col = mix(col, navy, dark);

  // Bright soft glow, bottom-left — tighter so it doesn't wash the blue to grey.
  float g1 = blob(uv, vec2(0.08, -0.04), vec2(0.42, 0.36));
  col = mix(col, uLight, pow(clamp(g1, 0.0, 1.0), 1.7) * 0.95);

  // Softer light, top-right.
  float g2 = blob(uv, vec2(0.98, 1.05), vec2(0.40, 0.40));
  col = mix(col, ltblue, clamp(g2, 0.0, 1.0) * 0.4);

  // Punch: boost saturation + a touch of contrast so mid-tones read blue, not grey.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(l), col, 1.4), 0.0);      // saturate (factor > 1)
  col = max((col - 0.5) * 1.1 + 0.5, 0.0);     // slight contrast

  gl_FragColor = vec4(col, 1.0);
}`
