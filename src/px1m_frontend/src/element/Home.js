import { html } from 'lit-html';
import { ref, createRef } from 'lit-html/directives/ref.js';
import { colors } from '../../../util/js/color';

export default class Home {
  static PATH = '/';

	constructor(backend) {
    this.canvasb = backend;
		this.canvasRef = createRef();
		this.containerRef = createRef();
    this.ctx = null;
    this.lastCanvasElement = null; // Track to detect canvas recreation
    this.lastBufferVersion = -1;
	};

  navigate(path) {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

	initCanvas() {
    const canvas = this.canvasRef.value;
    if (!canvas) return;
    
    if (canvas !== this.lastCanvasElement) {
      this.ctx = null;
      this.lastCanvasElement = canvas;
    }
    
    if (!this.ctx) {
      this.ctx = canvas.getContext('2d');
      this.redraw();
      this.lastBufferVersion = this.canvasb.bufferVersion;
    }
  }

	redraw() {
    console.log('redraw');
    if (!this.ctx) return;
    const { width, height, buffer } = this.canvasb;
    
    // 1. Fill background
    this.ctx.fillStyle = colors[0].hex || '#000';
    this.ctx.fillRect(0, 0, width, height);

    // 2. Draw buffer (saved/committed pixels)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colorIdx = buffer[y * width + x];
        this.ctx.fillStyle = colors[colorIdx].hex || '#000';
        this.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  render() {
		const isReady = this.canvasb?.linker != null;

    setTimeout(() => {
      this.initCanvas();
      // Redraw if buffer has been updated since last redraw
      if (this.ctx && this.lastBufferVersion !== this.canvasb.bufferVersion) {
        this.redraw();
        this.lastBufferVersion = this.canvasb.bufferVersion;
      }
    }, 0);

    return html`
      <div class="max-w-5xl mx-auto py-8 space-y-10">
        <!-- Hero -->
        <section class="grid gap-8 md:grid-cols-2 md:items-center">
          <div class="space-y-4">
            <h1 class="text-2xl md:text-3xl font-semibold text-slate-50">
              A 1,000,000‑pixel canvas for serious collaborative art.
            </h1>
						<br>
            <p class="text-sm text-slate-300">
              MillionPixels is a 1000×1000 shared canvas with a 256‑color palette.
              Buy credits, place your pixels, and publish your moves on a living, global artwork.
            </p>
						<br>
            <div class="flex flex-wrap gap-3 pt-2">
              <button
                class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold
                       bg-emerald-500 text-slate-900 hover:bg-emerald-600
                       shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                @click=${() => this.navigate('/draw')}
              >
                Start drawing
              </button>

              <button
                class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold
                       bg-slate-800 text-slate-100 hover:bg-slate-700
                       shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2 focus:ring-offset-slate-900"
                @click=${() => this.navigate('/topup')}
              >
                Buy credits
              </button>
            </div>
						<br>
            <p class="text-xs text-slate-400 pt-1">
              Use the login button in the top‑right to connect. 1 credit = 1 pixel when you save your changes.
            </p>
						<br>
            <div class="flex flex-wrap gap-4 pt-3 text-xs text-slate-400">
              <div class="flex flex-col">
                <span class="text-slate-200 font-semibold">1,000 × 1,000</span>
                <span>finite canvas</span>
              </div>
              <div class="flex flex-col">
                <span class="text-slate-200 font-semibold">256 colors</span>
                <span>pixel‑perfect palette</span>
              </div>
              <div class="flex flex-col">
                <span class="text-slate-200 font-semibold">1 credit = 1 pixel</span>
                <span>pay only for what you place</span>
              </div>
            </div>
          </div>

          <!-- Canvas preview / card -->
          <div class="relative">
            <div
              class="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950
                     shadow-lg overflow-hidden"
            >
              <div class="border-b border-slate-800 px-4 py-2 flex items-center gap-2 text-xs text-slate-400">
                <span class="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
                Live canvas
              </div>
              <div class="p-4">
                <div
                  class="aspect-square w-full rounded-xl bg-slate-900 border border-slate-800
                         flex items-center justify-center overflow-hidden"
                >
                  ${!isReady
                    ? html`
                        <span class="text-[0.7rem] text-slate-500">
                          Loading...
                        </span>
                      `
                    : html`
                        <canvas
                          width=${this.canvasb.width}
                          height=${this.canvasb.height}
                          class="w-full h-full block"
                          style="image-rendering: pixelated;"
                          ${ref(this.canvasRef)}
                        ></canvas>
                      `}
                </div>
              </div>
            </div>
          </div>
        </section>
				<br>
        <!-- Differentiation / built for -->
        <section class="grid gap-4 md:grid-cols-3">
          <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 class="text-sm font-semibold text-slate-100 mb-1">Built for creators</h2>
            <p class="text-xs text-slate-400">
              Pixel artists, designers, and meme makers get a dense, 1M‑pixel grid and a 256‑color palette
              for detailed, long‑running pieces—not just a fleeting wall of noise.
            </p>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 class="text-sm font-semibold text-slate-100 mb-1">Credit‑based, not chaotic</h2>
            <p class="text-xs text-slate-400">
              Every saved pixel costs 1 credit, so every move has intent.
              Buffer up to 1000 pixels, then confirm before you publish.
            </p>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h2 class="text-sm font-semibold text-slate-100 mb-1">Crypto‑native flow</h2>
            <p class="text-xs text-slate-400">
              Buy credits using ICP via AccountLink with spending limits instead of blind approvals.
              Connect once, top up as needed, and keep full control of your vault.
            </p>
          </div>
        </section>
				<br>
        <!-- How it works -->
        <section class="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:p-5 space-y-3">
          <h2 class="text-sm font-semibold text-slate-100">How MillionPixels works</h2>
          <ol class="text-xs text-slate-400 space-y-2 list-decimal list-inside">
            <li>
              <span class="text-slate-200 font-medium">Login with your Internet ID.</span>
              Use the login button, top right of the header to link your Internet Identity.
            </li>
            <li>
              <span class="text-slate-200 font-medium">Buy credits with ICP.</span>
              Go to the Top Up page and pay via AccountLink. 1 credit lets you save 1 pixel.
            </li>
            <li>
              <span class="text-slate-200 font-medium">Draw and save.</span>
              Place pixels on the canvas, then use credits to save and publish your changes.
            </li>
          </ol>
        </section>
      </div>
    `;
  }
}