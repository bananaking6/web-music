const audio = document.getElementById("audio") as HTMLAudioElement;
const canvas = document.getElementById("visualizer") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

/** Initialize the Web Audio API context and connect the visualizer */
export function initAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const source = audioCtx.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  draw();
}

/** Animation loop for the frequency visualizer bars */
function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;

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
