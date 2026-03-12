const audio = document.getElementById("audio") as HTMLAudioElement;
const canvas = document.getElementById("visualizer") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let animationTime = 0;

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

/** Animation loop for the frequency visualizer using sigma glyphs */
function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;
  animationTime += 0.016; // ~60fps

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);

  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw fewer bins for readability/performance when using text glyphs
  const step = Math.max(1, Math.floor(data.length / 80));
  const bins = Math.ceil(data.length / step);
  const slotWidth = canvas.width / bins;
  const sigmaSizeBase = 24;

  const computedStyles = window.getComputedStyle(document.body);
  const mainColor = computedStyles.getPropertyValue("--main-color").trim() || "#ffffff";
  const secondaryColor = computedStyles.getPropertyValue("--secondary-color").trim() || "#aaaaaa";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${sigmaSizeBase}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  for (let i = 0, b = 0; i < data.length; i += step, b++) {
    const v = data[i];
    const amp = v / 255;

    // Constant sigma size
    const x = b * slotWidth + slotWidth / 2;

    // Create dramatic vertical movement with smooth wave offset
    const waveOffset = Math.sin(animationTime * 2 + b * 0.15) * 15;
    const y = canvas.height - 30 - amp * (canvas.height * 0.75) + waveOffset;

    // Rotation based on frequency bin and amplitude for spinning effect
    const rotation = (animationTime * 3 + b * 0.3 + amp * 0.5) % (Math.PI * 2);

    // Higher minimum alpha and stronger pulsing for visibility
    const alpha = 0.65 + amp * 0.35;

    const gradient = ctx.createLinearGradient(x, y - sigmaSizeBase, x, y + sigmaSizeBase);
    gradient.addColorStop(0, mainColor);
    gradient.addColorStop(1, secondaryColor);

    // Draw stroke outline for better contrast against background
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = alpha;
    ctx.fillText("𝚺", 0, 0);

    // Add subtle black outline for contrast
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 0.5;
    ctx.strokeText("𝚺", 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}
