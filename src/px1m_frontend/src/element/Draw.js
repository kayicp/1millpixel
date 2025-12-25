import { html } from 'lit-html';
import { ref, createRef } from 'lit-html/directives/ref.js';
import { colors } from '../../../util/js/color';
import Canvas from '../model/Canvas';

export default class Draw {
  static PATH = '/draw';
  static MIN_ZOOM = 1;
  static MAX_ZOOM = 40;

  constructor(backend) {
    this.canvasb = backend;
    this.wallet = backend.wallet;
    this.notif = backend.wallet.notif;

    this.selectedColor = 1;
    this.isDrawing = false;
    this.zoom = 10;
    this.canvasRef = createRef();
    this.containerRef = createRef();
    this.ctx = null;
    this.lastCanvasElement = null;
    this.lastBufferVersion = -1;
    
    this.mouseX = null;
    this.mouseY = null;
    
    // Saved scroll position for restoration after navigation
    this.savedScrollLeft = null;
    this.savedScrollTop = null;
    
    this.undoStack = [];
    this.redoStack = [];
    
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
    const container = this.containerRef.value;
    if (!canvas || !container) return;
    
    const { width, height } = this.canvasb;
    const isNewCanvas = canvas !== this.lastCanvasElement;
    
    if (isNewCanvas) {
      this.lastCanvasElement = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;
    }
    
    const needsResize = canvas.width !== width || canvas.height !== height;
    if (needsResize) {
      canvas.width = width;
      canvas.height = height;
    }
    
    const bufferChanged = this.lastBufferVersion !== this.canvasb.bufferVersion;
    
    if (isNewCanvas || needsResize || bufferChanged) {
      this.redraw();
      this.lastBufferVersion = this.canvasb.bufferVersion;
    }
    
    if (isNewCanvas) {
      container.focus();
      
      // Restore saved scroll position or center if first time
      if (this.savedScrollLeft !== null && this.savedScrollTop !== null) {
        container.scrollLeft = this.savedScrollLeft;
        container.scrollTop = this.savedScrollTop;
      } else {
        this.centerCanvas();
      }
    }
  }

  centerCanvas() {
    const container = this.containerRef.value;
    if (!container) return;
    
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
    container.scrollTop = (container.scrollHeight - container.clientHeight) / 2;
  }

  handleScroll() {
    const container = this.containerRef.value;
    if (!container) return;
    this.savedScrollLeft = container.scrollLeft;
    this.savedScrollTop = container.scrollTop;
  }

  getPixelCoords(e) {
    const canvas = this.canvasRef.value;
    if (!canvas) return { x: -1, y: -1 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.zoom);
    const y = Math.floor((e.clientY - rect.top) / this.zoom);
    return { x, y };
  }

  drawPixel(x, y, colorIdx) {
    if (!this.ctx) return;
    this.ctx.fillStyle = colors[colorIdx]?.hex || '#000';
    this.ctx.fillRect(x, y, 1, 1);
  }

  setPixel(x, y) {
    if (this.canvasb.placedPixels.size >= Canvas.MAX_BATCH) {
      return this.notif.infoPopup(
        `You've reached the limit of ${Canvas.MAX_BATCH} unsaved pixels`,
        'Save now to apply your changes and continue drawing'
      );
    }

    const { width, height } = this.canvasb;
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    
    const key = `${x},${y}`;
    const prevColor = this.canvasb.placedPixels.has(key)
      ? this.canvasb.placedPixels.get(key)
      : null;
    
    if (prevColor === this.selectedColor) return;
    
    this.undoStack.push({ key, prevColor, newColor: this.selectedColor });
    this.redoStack = [];
    
    this.canvasb.placedPixels.set(key, this.selectedColor);
    this.drawPixel(x, y, this.selectedColor);
    this.wallet.render();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    
    const action = this.undoStack.pop();
    this.redoStack.push(action);
    
    const [x, y] = action.key.split(',').map(Number);
    
    if (action.prevColor === null) {
      this.canvasb.placedPixels.delete(action.key);
      const bufferColor = this.canvasb.buffer[y * this.canvasb.width + x] ?? 0;
      this.drawPixel(x, y, bufferColor);
    } else {
      this.canvasb.placedPixels.set(action.key, action.prevColor);
      this.drawPixel(x, y, action.prevColor);
    }
    
    this.wallet.render();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    
    const action = this.redoStack.pop();
    this.undoStack.push(action);
    
    const [x, y] = action.key.split(',').map(Number);
    this.canvasb.placedPixels.set(action.key, action.newColor);
    this.drawPixel(x, y, action.newColor);
    
    this.wallet.render();
  }

  setZoom(newZoom, focalX = null, focalY = null) {
    const container = this.containerRef.value;
    if (!container) return;
    
    newZoom = Math.max(Draw.MIN_ZOOM, Math.min(Draw.MAX_ZOOM, newZoom));
    if (newZoom === this.zoom) return;
    
    const oldZoom = this.zoom;
    
    let canvasX, canvasY;
    if (focalX !== null && focalY !== null) {
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      const paddingX = container.clientWidth / 2;
      const paddingY = container.clientHeight / 2;
      canvasX = (scrollLeft + focalX - paddingX) / oldZoom;
      canvasY = (scrollTop + focalY - paddingY) / oldZoom;
    } else {
      const paddingX = container.clientWidth / 2;
      const paddingY = container.clientHeight / 2;
      canvasX = (container.scrollLeft + container.clientWidth / 2 - paddingX) / oldZoom;
      canvasY = (container.scrollTop + container.clientHeight / 2 - paddingY) / oldZoom;
    }
    
    this.zoom = newZoom;
    this.wallet.render();
    
    requestAnimationFrame(() => {
      const paddingX = container.clientWidth / 2;
      const paddingY = container.clientHeight / 2;
      
      if (focalX !== null && focalY !== null) {
        container.scrollLeft = canvasX * newZoom + paddingX - focalX;
        container.scrollTop = canvasY * newZoom + paddingY - focalY;
      } else {
        container.scrollLeft = canvasX * newZoom + paddingX - container.clientWidth / 2;
        container.scrollTop = canvasY * newZoom + paddingY - container.clientHeight / 2;
      }
      
      // Save new scroll position after zoom
      this.handleScroll();
    });
  }

  zoomIn(focalX = null, focalY = null) {
    const step = this.zoom < 5 ? 1 : this.zoom < 15 ? 2 : 4;
    this.setZoom(this.zoom + step, focalX, focalY);
  }

  zoomOut(focalX = null, focalY = null) {
    const step = this.zoom <= 5 ? 1 : this.zoom <= 15 ? 2 : 4;
    this.setZoom(this.zoom - step, focalX, focalY);
  }

  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
      e.preventDefault();
      this.redo();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.zoomIn();
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.zoomOut();
    }
  }

  handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const container = this.containerRef.value;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      if (e.deltaY < 0) {
        this.zoomIn(mouseX, mouseY);
      } else {
        this.zoomOut(mouseX, mouseY);
      }
    }
  }

  handleMouseDown(e) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const { x, y } = this.getPixelCoords(e);
    this.setPixel(x, y);
  }

  handleMouseMove(e) {
    const { x, y } = this.getPixelCoords(e);
    const { width, height } = this.canvasb;
    const inBounds = x >= 0 && x < width && y >= 0 && y < height;
    
    if (inBounds) {
      const changed = x !== this.mouseX || y !== this.mouseY;
      this.mouseX = x;
      this.mouseY = y;
      
      if (this.isDrawing) {
        this.setPixel(x, y);
      } else if (changed) {
        this.wallet.render();
      }
    } else if (this.mouseX !== null) {
      this.mouseX = null;
      this.mouseY = null;
      if (!this.isDrawing) this.wallet.render();
    }
  }

  handleMouseUp() {
    this.isDrawing = false;
  }

  handleMouseLeave() {
    this.isDrawing = false;
    if (this.mouseX !== null) {
      this.mouseX = null;
      this.mouseY = null;
      this.wallet.render();
    }
  }

  redraw() {
    if (!this.ctx) return;
    const { width, height, buffer } = this.canvasb;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const colorIdx = buffer[y * width + x] ?? 0;
        this.ctx.fillStyle = colors[colorIdx]?.hex || '#000';
        this.ctx.fillRect(x, y, 1, 1);
      }
    }
    
    for (const [key, colorIdx] of this.canvasb.placedPixels) {
      const [x, y] = key.split(',').map(Number);
      this.ctx.fillStyle = colors[colorIdx]?.hex || '#000';
      this.ctx.fillRect(x, y, 1, 1);
    }
  }

  selectColor(idx) {
    this.selectedColor = idx;
    this.wallet.render();
  }

  clearPlaced() {
    while (this.undoStack.length > 0) {
      const action = this.undoStack.pop();
      this.redoStack.push(action);
      const [x, y] = action.key.split(',').map(Number);
      if (action.prevColor === null) {
        this.canvasb.placedPixels.delete(action.key);
        const bufferColor = this.canvasb.buffer[y * this.canvasb.width + x] ?? 0;
        this.drawPixel(x, y, bufferColor);
      } else {
        this.canvasb.placedPixels.set(action.key, action.prevColor);
        this.drawPixel(x, y, action.prevColor);
      }
    }
    this.wallet.render();
  }

  render() {
    if (this.canvasb.width == null) {
      return html`<div class="p-4 text-slate-400">Loading metadata…</div>`;
    }
    
    const { width, height } = this.canvasb;
    const pixelCount = this.canvasb.placedPixels.size;
    const scaledWidth = width * this.zoom;
    const scaledHeight = height * this.zoom;
    
    queueMicrotask(() => this.initCanvas());
  
    return html`
      <div class="fixed inset-0 pt-12 flex flex-col bg-slate-950">
        <!-- Toolbar -->
        <div class="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 select-none">
          <div class="flex items-center gap-3">
            <span class="text-sm ${pixelCount > 0 ? 'text-emerald-400' : 'text-slate-500'}">
              ${pixelCount}/${Canvas.MAX_BATCH} unsaved
            </span>
            
            <button 
              class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                ${pixelCount === 0
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-700 hover:bg-rose-600 text-white'}"
              ?disabled=${pixelCount === 0}
              @click=${() => this.clearPlaced()}
            >Clear</button>
          </div>

          <div class="flex items-center gap-3">
            <!-- Coordinates -->
            <span class="text-sm text-slate-500 font-mono w-20 text-right">
              ${this.mouseX !== null ? `${this.mouseX}, ${this.mouseY}` : ''}
            </span>
            
            <!-- Zoom -->
            <div class="flex items-center gap-1">
              <button 
                class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                  ${this.zoom <= Draw.MIN_ZOOM 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}"
                ?disabled=${this.zoom <= Draw.MIN_ZOOM}
                @click=${() => this.zoomOut()}
                title="Zoom out (−)"
              >−</button>
              <span class="px-2 py-1.5 text-sm text-slate-400 min-w-[3rem] text-center font-mono">
                ${this.zoom}x
              </span>
              <button 
                class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                  ${this.zoom >= Draw.MAX_ZOOM 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}"
                ?disabled=${this.zoom >= Draw.MAX_ZOOM}
                @click=${() => this.zoomIn()}
                title="Zoom in (+)"
              >+</button>
            </div>
            
            <!-- Undo/Redo -->
            <div class="flex items-center gap-1">
              <button 
                class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                  ${this.undoStack.length === 0 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}"
                ?disabled=${this.undoStack.length === 0}
                @click=${() => this.undo()}
                title="Undo (Ctrl+Z)"
              >↶ Undo</button>
              <button 
                class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                  ${this.redoStack.length === 0 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}"
                ?disabled=${this.redoStack.length === 0}
                @click=${() => this.redo()}
                title="Redo (Ctrl+Y)"
              >Redo ↷</button>
            </div>
            
            <button 
              class="px-3 py-1.5 text-sm rounded font-medium transition-colors bg-slate-700 hover:bg-slate-600 text-slate-200"
              @click=${() => this.centerCanvas()}
              title="Center canvas"
            >⌖ Center</button>
            
            <button 
              class="px-3 py-1.5 text-sm rounded font-medium transition-colors
                ${pixelCount === 0 || this.canvasb.busy
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'}"
              ?disabled=${pixelCount === 0 || this.canvasb.busy}
              @click=${() => this.canvasb.commit()}
            >${this.canvasb.busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        
        <!-- Canvas area -->
        <div class="flex-1 flex overflow-hidden">
          <div 
            ${ref(this.containerRef)}
            class="flex-1 overflow-auto bg-slate-950 outline-none"
            tabindex="0"
            @keydown=${(e) => this.handleKeyDown(e)}
            @wheel=${(e) => this.handleWheel(e)}
            @scroll=${() => this.handleScroll()}
          >
            <div class="inline-flex">
              <!-- Left spacer -->
              <div style="width: 50vw; flex-shrink: 0;"></div>
              
              <!-- Canvas column -->
              <div class="flex flex-col" style="flex-shrink: 0;">
                <!-- Top spacer -->
                <div style="height: 50vh; flex-shrink: 0;"></div>
                
                <canvas
                  ${ref(this.canvasRef)}
                  class="block border border-slate-600 cursor-crosshair"
                  style="width: ${scaledWidth}px; height: ${scaledHeight}px; image-rendering: pixelated; flex-shrink: 0;"
                  @mousedown=${(e) => this.handleMouseDown(e)}
                  @mousemove=${(e) => this.handleMouseMove(e)}
                  @mouseup=${() => this.handleMouseUp()}
                  @mouseleave=${() => this.handleMouseLeave()}
                ></canvas>
                
                <!-- Bottom spacer -->
                <div style="height: 50vh; flex-shrink: 0;"></div>
              </div>
              
              <!-- Right spacer (extra for color picker) -->
              <div style="width: calc(50vw + 2rem); flex-shrink: 0;"></div>
            </div>
          </div>
          
          <!-- Color picker -->
          <div class="w-8 bg-slate-900 border-l border-slate-700 overflow-y-auto flex flex-col shrink-0">
            ${colors.map((color, i) => html`
              <button
                title="${color.name}"
                class="w-full h-6 shrink-0 transition-transform
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