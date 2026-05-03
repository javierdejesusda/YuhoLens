export const WASHI_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uPressure;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 q = uv * vec2(uResolution.x / uResolution.y, 1.0);
    float t = uTime * 0.05;
    float grain = fbm(q * 3.0 + vec2(t, -t * 0.7));
    float fiber = fbm(q * 12.0);
    vec2 m = uMouse / uResolution;
    float bleed = smoothstep(0.18, 0.0, length(uv - m));
    vec3 paper = vec3(0.957, 0.918, 0.827);
    vec3 ink = vec3(0.055, 0.055, 0.063);
    vec3 vermilion = vec3(0.910, 0.314, 0.227);
    vec3 col = ink;
    col = mix(col, paper, grain * 0.14);
    col = mix(col, paper, fiber * 0.06);
    col = mix(col, vermilion, bleed * (0.4 + uPressure * 0.6) * grain);
    col += 0.03 * (fract(sin(dot(uv * uResolution, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;
