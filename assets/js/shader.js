/**
 * Shared WebGL shader background for julieschatzmusic.com
 *
 * Renders an animated violet-on-aubergine field across the page background.
 * Loaded by every page via `<script defer src="/assets/js/shader.js"></script>`,
 * paired with `<canvas id="shader-bg"></canvas>` directly inside <body>.
 *
 * "Cinematic-cut" color logic: darkness dominates (~70% of surface stays
 * deep aubergine #180A26), brand royal violet #7B2CBF carries the main
 * glow body where the wave field rises, brand lavender #a855f7 appears
 * only at the brightest peaks as luminous shimmer. Corner vignette pulls
 * focus toward the center. Reads moody/cinematic, not nightclub-bright.
 *
 * Honors prefers-reduced-motion: bails before WebGL init so the static CSS
 * gradient fallback (defined in each page's stylesheet) takes over.
 */
(function(){
  const canvas = document.getElementById('shader-bg');
  if (!canvas) return;
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;
  // Honor prefers-reduced-motion: bail before WebGL init so the static CSS gradient takes over.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const vsSrc = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  // Cinematic-cut rework: darkness dominates, violet emerges only as pools of
  // light — like spotlights glancing across a stage. Wave field math kept;
  // color mixing inverted so the surface reads ~70% deep near-black, ~30%
  // violet glow. Corner vignette pulls focus toward the center.
  const fsSrc = `
    precision highp float;
    uniform float u_time;
    uniform vec2  u_res;

    // Brand palette: warm-leaning premium purple, no blue-shifted violet.
    vec3 C1 = vec3(0.659, 0.333, 0.969); // #a855f7 brand lavender — peak shimmer
    vec3 C2 = vec3(0.482, 0.173, 0.749); // #7B2CBF brand royal violet — main glow
    vec3 BASE = vec3(0.005, 0.002, 0.010); // near-pure black with whisper of violet

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res;

      // rotationZ: 235deg, tilts the whole plane
      float angle = radians(235.0);
      mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec2 st = rot * (uv - 0.5) + 0.5;
      st += vec2(-0.5, 0.1);

      float t = u_time * 0.1;

      float freq = 5.5;
      float strength = 2.4;
      float density = 1.1;

      // Wave field (unchanged from before)
      float w1 = sin(st.x * freq * density + t) * 0.5 + 0.5;
      float w2 = sin(st.y * freq * density * 0.7 - t * 0.8 + 1.2) * 0.5 + 0.5;
      float w3 = sin((st.x + st.y) * freq * 0.6 + t * 0.5 + 2.1) * 0.5 + 0.5;
      float w4 = sin((st.x - st.y) * freq * 0.4 - t * 0.3 + 3.7) * 0.5 + 0.5;
      float field = w1 * 0.35 + w2 * 0.25 + w3 * 0.25 + w4 * 0.15;
      float warped = field + sin(field * 6.28318 * strength * 0.15 + t * 0.4) * 0.12;
      warped = clamp(warped, 0.0, 1.0);

      // Black-base premium aesthetic: surface stays nearly true black, with
      // violet appearing only as moving pools where the wave field peaks.
      // The contrast of black-vs-violet gives the motion clear visibility,
      // while keeping ~75% of the surface dark for a luxury, cinematic feel.
      vec3 col = BASE;
      col = mix(col, C2, smoothstep(0.50, 0.82, warped) * 0.35);
      col = mix(col, C1, smoothstep(0.70, 0.95, warped) * 0.18);

      // Soft cinematic vignette: corners gently darker, center kept lifted.
      float dist = length(uv - vec2(0.5, 0.55));
      float vignette = 1.0 - smoothstep(0.50, 1.05, dist) * 0.50;
      col *= vignette;

      // Faint lavender glint at peaks — barely-there motion accent.
      col += vec3(smoothstep(0.75, 1.0, warped) * 0.012);
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      console.error(gl.getShaderInfoLog(sh));
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER,   vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes  = gl.getUniformLocation(prog, 'u_res');

  let start = performance.now();
  function draw() {
    gl.uniform1f(uTime, (performance.now() - start) / 1000);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(draw);
  }
  draw();
})();
