import { html } from 'lit-html';
import { ref, createRef } from 'lit-html/directives/ref.js';
import { colors } from '../../../util/js/color';
import Canvas from '../model/Canvas';

export default class Draw {
  static PATH = '/draw';

  constructor(backend) {
    this.canvasb = backend;
    this.wallet = backend.wallet;
    this.notif = backend.wallet.notif;

    this.placedPixels = new Map();
    this.selectedColor = 1;
    this.isDrawing = false;
    this.pixelSize = 10;
    this.canvasRef = createRef();
    this.containerRef = createRef();
    this.ctx = null;
    this.lastCanvasElement = null; // Track to detect canvas recreation
    this.lastBufferVersion = -1;
    
    this.button = html`
      <button 
        class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium bg-violet-800 hover:bg-violet-700 text-slate-100 ring-1 ring-slate-700"
        @click=${(e) => {
          e.preventDefault();
          if (window.location.pathname.startsWith(Draw.PATH)) return;
          history.pushState({}, '', Draw.PATH);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}>Draw</button>
    `;
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
      this.centerCanvas();
    }
  }

  centerCanvas() {
    const container = this.containerRef.value;
    if (!container) return;
    
    const scrollX = (container.scrollWidth - container.clientWidth) / 2;
    const scrollY = (container.scrollHeight - container.clientHeight) / 2;
    container.scrollLeft = scrollX;
    container.scrollTop = scrollY;
  }

  getPixelCoords(e) {
    const canvas = this.canvasRef.value;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.pixelSize);
    const y = Math.floor((e.clientY - rect.top) / this.pixelSize);
    return { x, y };
  }

  setPixel(x, y) {
    if (this.placedPixels.size >= Canvas.MAX_BATCH) return this.notif.infoPopup(`You've reached the limit of ${Canvas.MAX_BATCH} unsaved pixels`, 'Save now to apply your changes and continue drawing');

    const { width, height } = this.canvasb;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    
    const key = `${x},${y}`;
    
    // Skip if same color already placed at this position
    if (this.placedPixels.get(key) === this.selectedColor) return;
    
    // Only track in placedPixels, don't update buffer until save
    this.placedPixels.set(key, this.selectedColor);
    
    // Draw just this pixel (optimization - no full redraw)
    this.ctx.fillStyle = colors[this.selectedColor].hex || '#000';
    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
    
    this.wallet.render();
  }

  handleMouseDown(e) {
    this.initCanvas();
    this.isDrawing = true;
    const { x, y } = this.getPixelCoords(e);
    this.setPixel(x, y);
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    const { x, y } = this.getPixelCoords(e);
    this.setPixel(x, y);
  }

  handleMouseUp() {
    this.isDrawing = false;
  }

  redraw() {
    console.log('redraw');
    if (!this.ctx) return;
    const { width, height, buffer } = this.canvasb;
    
    // 1. Fill background
    this.ctx.fillStyle = colors[0].hex || '#000';
    this.ctx.fillRect(0, 0, width * this.pixelSize, height * this.pixelSize);
    
    // 2. Draw buffer (saved/committed pixels)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colorIdx = buffer[y * width + x];
        this.ctx.fillStyle = colors[colorIdx].hex || '#000';
        this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
      }
    }
    
    // 3. Draw placed pixels (pending/unsaved) on top
    for (const [key, colorIdx] of this.placedPixels) {
      const [x, y] = key.split(',').map(Number);
      this.ctx.fillStyle = colors[colorIdx].hex || '#000';
      this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
    }
  }

  selectColor(idx) {
    this.selectedColor = idx;
    this.wallet.render();
  }

  clearPlaced() {
    this.placedPixels.clear();
    this.redraw();
    this.wallet.render();
  }

  save() {
    const pixels = [];
    for (const [key, colorIdx] of this.placedPixels) {
      const [x, y] = key.split(',').map(Number);
      pixels.push({ 
        x: BigInt(x), 
        y: BigInt(y), 
        color: BigInt(colorIdx),
        subaccount: [],
        memo: [],
        created_at: [],
      });
    }
    this.canvasb.commit(pixels);
  }

  render() {
    if (this.canvasb.width == null) {
      return html`<div class="p-4 text-slate-400">Loading metadata…</div>`;
    }
    const { width, height } = this.canvasb;
    const displayWidth = width * this.pixelSize;
    const displayHeight = height * this.pixelSize;
    const pixelCount = this.placedPixels.size;
  
    setTimeout(() => {
      this.initCanvas();
      // Redraw if buffer has been updated since last redraw
      if (this.ctx && this.lastBufferVersion !== this.canvasb.bufferVersion) {
        this.redraw();
        this.lastBufferVersion = this.canvasb.bufferVersion;
      }
    }, 0);
  
    return html`
      <div class="fixed inset-0 pt-12 flex flex-col bg-slate-950">
        <div class="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
          <div class="flex items-center gap-3">
            <span class="text-sm ${pixelCount > 0 ? 'text-emerald-400' : 'text-slate-500'}">
              ${pixelCount}/${Canvas.MAX_BATCH} pixels unsaved
            </span>
            
            ${pixelCount > 0 ? html`
              <button 
                class="text-xs text-slate-400 hover:text-slate-200 underline"
                @click=${() => this.clearPlaced()}
              >Clear</button>
            ` : ''}
          </div>
          
          <div class="flex items-center gap-2">
            <button 
              class="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
              @click=${() => this.centerCanvas()}
              title="Center canvas"
            >⌖ Center</button>
            
            <button 
              class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md font-medium
                ${pixelCount > 0 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'}"
              ?disabled=${pixelCount === 0}
              @click=${() => this.save()}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
              </svg>
              Save
            </button>
          </div>
        </div>
        
        <!-- Main area -->
        <div class="flex-1 flex overflow-hidden">
          <div 
            ${ref(this.containerRef)}
            class="flex-1 overflow-auto bg-slate-950"
          >
            <!-- Use inline-flex with explicit spacer elements instead of padding -->
            <div class="inline-flex items-start" style="padding-top: 50vh; padding-bottom: 50vh;">
              <!-- Left spacer -->
              <div class="shrink-0" style="width: 50vw;"></div>
              
              <!-- Canvas -->
              <canvas
                ${ref(this.canvasRef)}
                width=${displayWidth}
                height=${displayHeight}
                class="border border-slate-700 cursor-crosshair bg-black shadow-lg block shrink-0"
                @mousedown=${(e) => this.handleMouseDown(e)}
                @mousemove=${(e) => this.handleMouseMove(e)}
                @mouseup=${() => this.handleMouseUp()}
                @mouseleave=${() => this.handleMouseUp()}
              ></canvas>
              
              <!-- Right spacer (extra width to account for color picker) -->
              <div class="shrink-0" style="width: calc(50vw + 2rem);"></div>
            </div>
          </div>
          
          <!-- Color picker (right) -->
          <div class="w-8 bg-slate-900 border-l border-slate-700 overflow-y-auto flex flex-col">
            ${colors.map((color, i) => html`
              <button
                title="${color.name}"
                class="w-full h-6 shrink-0 transition-all
                  ${this.selectedColor === i 
                    ? 'ring-2 ring-inset ring-white scale-110 z-10' 
                    : 'hover:scale-105'}"
                style="background-color: ${color.hex}"
                @click=${() => this.selectColor(i)}
              ></button>
            `)}
          </div>
        </div>
      </div>
    `;
  }
}