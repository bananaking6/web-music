/**
 * Canvas audio visualizer using the Web Audio API analyser node.
 */

let audioCtx = null;
let analyser = null;
let source = null;

/**
 * Initialise the Web Audio API context and connect it to the given audio element.
 * Safe to call multiple times – only initialises once.
 * @param {HTMLAudioElement} audio
 */
export function initAudioContext(audio) {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  draw();
}

/**
 * Render a single animation frame of the frequency visualizer.
 */
function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;
  const canvas = document.getElementById("visualizer");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = (canvas.width / data.length) * 1.15;
  const computedStyles = window.getComputedStyle(document.body);
  const mainColor = computedStyles.getPropertyValue("--main-color");
  const secondaryColor = computedStyles.getPropertyValue("--secondary-color");
  data.forEach((v, i) => {
    const x = i * barWidth;
    const y = canvas.height - (v / 255) * canvas.height;
    const gradient = ctx.createLinearGradient(x, 0, x, canvas.height);
    gradient.addColorStop(0, mainColor);
    gradient.addColorStop(1, secondaryColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, canvas.height - y);
  });
}
