import { html } from 'lit-html';

export default class Draw {
	static PATH = '/draw';
	constructor(backend) {
		this.canvasb = backend;
		this.wallet = backend.wallet;
		this.notif = backend.wallet.notif;

		this.button = html`
		<button 
			class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 ring-1 ring-slate-700"
			@click=${(e) => {
				e.preventDefault();
				if (window.location.pathname.startsWith(Draw.PATH)) return;
				this.render();
				history.pushState({}, '', Draw.PATH);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}}>Draw</button>
		`;
    this.cell_size = 12; // logical cell size in CSS px at scale=1

    // palette array of {r,g,b,css} length 256
    this.palette = this._generatePalette();

    // selected color index (1..255). 0 = transparent/empty
    this.selected_color = 1;

    // viewport transform
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // interaction
    this.is_ptr_down = false;
    this.is_panning = false;
    this.last_ptr = null;
    this.dpr = 1;
    this._raf = null;

    // hover/last painted
    this.hover = { gx: -1, gy: -1 };
    this.last_paint = { gx: -1, gy: -1 };
	}
	
	render() {
		if (this.canvasb.width == null) return html`<div>Loading metadata...</div>`;

		return html`
		<div class="wrap">
			<div class="canvas-wrap">
				<canvas id="canvas"></canvas>
			</div>
			<div class="sidebar">
				<div class="controls">
					<div class="preview" style="background:${this._paletteCss(this.selected_color)}"></div>
					<div>
						<div style="font-weight:600">Index ${this.selected_color}</div>
						<div style="font-size:12px;color:#9CA3AF">${this._paletteCss(this.selected_color)}</div>
					</div>
				</div>

				<div class="info">Palette: 216 web-safe colors + 39 grayscale + index 0 = transparent</div>
				<div style="height:8px"></div>

				<div class="palette">
					${this.palette.map((c, i) => html`
						<div @click=${() => this._pickColor(i)} class="color-swatch ${i===this.selected_color? 'selected':''}" title="${i} - ${c.css}">
							<div class="swatch-inner" style="background: ${c.css}${i===0? '; background-image: linear-gradient(45deg, rgba(0,0,0,0.12) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.12) 75%, rgba(0,0,0,0.12) 0), linear-gradient(45deg, rgba(0,0,0,0.12) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.12) 75%, rgba(0,0,0,0.12) 0); background-size:8px 8px; background-position:0 0,4px 4px' : ''}"></div>
						</div>
					`)}
				</div>

				<div style="margin-top:10px; font-size:13px; color:#cbd5e1">
					Left-click: paint / drag to paint<br>
					Middle-drag or Space+drag: pan<br>
					Wheel: zoom
				</div>
			</div>
		</div>
	`;
	}

	firstUpdated() {
    this.canvas = this.renderRoot.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.dpr = window.devicePixelRatio || 1;
    this._resizeCanvas();
    this.attachEvents();
    this.startLoop();
  }

	disconnectedCallback() {
    this.stopLoop();
  }

	_generatePalette() {
    // index 0 = transparent
    const pal = [{ r: 0, g: 0, b: 0, css: 'transparent' }];

    // web-safe colors: values [0,51,102,153,204,255] -> 6^3 = 216 colors
    const steps = [0, 51, 102, 153, 204, 255];
    for (let r of steps) {
      for (let g of steps) {
        for (let b of steps) {
          pal.push({ r, g, b, css: `rgb(${r}, ${g}, ${b})` });
        }
      }
    }
    // pal length is 1 + 216 = 217 so far

    // fill remaining with a grayscale ramp to make 256 entries total
    // remaining slots = 256 - pal.length
    const remaining = 256 - pal.length; // should be 39
    for (let i = 0; i < remaining; i++) {
      const v = Math.round((i / (remaining - 1)) * 255);
      pal.push({ r: v, g: v, b: v, css: `rgb(${v}, ${v}, ${v})` });
    }

    // defensive: ensure exactly 256
    if (pal.length !== 256) {
      console.warn('palette length', pal.length);
      while (pal.length < 256) pal.push({ r: 0, g: 0, b: 0, css: 'rgb(0,0,0)' });
      pal.length = 256;
    }
    return pal;
  }

	_paletteCss(index) {
    const c = this.palette[index];
    return c ? c.css : 'transparent';
  }

	_pickColor(index) {
    this.selected_color = index;
    this.render();
  }

	_resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    // set transform so we can use CSS pixels coordinates in drawing
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

	attachEvents() {
    window.addEventListener('resize', () => this._resizeCanvas());
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

	startLoop() {
    const loop = () => {
      this._draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stopLoop() { if (this._raf) cancelAnimationFrame(this._raf); }

	_onPointerDown(e) {
    this.is_ptr_down = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this._screenToCanvas(e.clientX, e.clientY);
    this.last_ptr = { x: p.x, y: p.y, button: e.button };

    // if middle button or space -> pan
    if (e.button === 1 || e.buttons === 4 || e.spaceKey || e.shiftKey || e.ctrlKey) {
      this.is_panning = true;
    } else {
      this.is_panning = false;
      const { gx, gy } = this._screenToGrid(e.clientX, e.clientY);
      this._paintCell(gx, gy);
    }
  }

	_onPointerMove(e) {
    const p = this._screenToCanvas(e.clientX, e.clientY);
    // update hover even when not pressed
    const { gx, gy } = this._screenToGrid(e.clientX, e.clientY);
    if (gx !== this.hover.gx || gy !== this.hover.gy) {
      this.hover.gx = gx; this.hover.gy = gy;
      // small optimization: only requestUpdate for UI elements if needed
    }

    if (!this.is_ptr_down) return;
    if (this.is_panning) {
      const dx = p.x - this.last_ptr.x;
      const dy = p.y - this.last_ptr.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.last_ptr = { x: p.x, y: p.y };
    } else {
      this._paintCell(gx, gy);
    }
  }

  _onPointerUp(e) {
    this.is_ptr_down = false;
    this.canvas.releasePointerCapture?.(e.pointerId);
    this.is_panning = false;
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY;
    const zoomFactor = Math.exp(delta * 0.0012);
    const newScale = Math.max(0.1, Math.min(8, this.scale * zoomFactor));

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const preX = (mx - this.offsetX) / this.scale;
    const preY = (my - this.offsetY) / this.scale;

    this.scale = newScale;
    this.offsetX = mx - preX * this.scale;
    this.offsetY = my - preY * this.scale;
  }

  _screenToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _screenToGrid(clientX, clientY) {
    const p = this._screenToCanvas(clientX, clientY);
    const logicalX = (p.x - this.offsetX) / (this.cell_size * this.scale);
    const logicalY = (p.y - this.offsetY) / (this.cell_size * this.scale);
    return { gx: Math.floor(logicalX), gy: Math.floor(logicalY) };
  }

  _paintCell(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.canvasb.width || gy >= this.canvasb.height) return;
    const idx = gy * this.canvasb.width + gx;
    this.canvasb.buffer[idx] = this.selected_color;
    this.last_paint.gx = gx; this.last_paint.gy = gy;
  }

  _draw() {
    // clear canvas
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, cw, ch);

    const cellPx = this.cell_size * this.scale;

    // compute visible range
    const startX = Math.max(0, Math.floor(-this.offsetX / cellPx));
    const startY = Math.max(0, Math.floor(-this.offsetY / cellPx));
    const endX = Math.min(this.canvasb.width, Math.ceil((cw - this.offsetX) / cellPx));
    const endY = Math.min(this.canvasb.height, Math.ceil((ch - this.offsetY) / cellPx));

    // draw visible cells
    for (let gy = startY; gy < endY; gy++) {
      const rowBase = gy * this.canvasb.width;
      for (let gx = startX; gx < endX; gx++) {
        const paletteIndex = this.canvasb.buffer[rowBase + gx];
        if (paletteIndex === 0) continue; // transparent
        const css = this._paletteCss(paletteIndex);
        this.ctx.fillStyle = css;
        const xPx = this.offsetX + gx * cellPx;
        const yPx = this.offsetY + gy * cellPx;
        this.ctx.fillRect(xPx, yPx, cellPx, cellPx);
      }
    }

    // draw subtle gridlines if zoomed in
    if (cellPx >= 6) {
      this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      this.ctx.lineWidth = 1;
      // vertical
      let startVX = Math.floor(( - this.offsetX) / cellPx) * cellPx + this.offsetX;
      for (let x = startVX; x <= cw; x += cellPx) {
        this.ctx.beginPath();
        this.ctx.moveTo(Math.round(x) + 0.5, 0);
        this.ctx.lineTo(Math.round(x) + 0.5, ch);
        this.ctx.stroke();
      }
      // horizontal
      let startHY = Math.floor(( - this.offsetY) / cellPx) * cellPx + this.offsetY;
      for (let y = startHY; y <= ch; y += cellPx) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, Math.round(y) + 0.5);
        this.ctx.lineTo(cw, Math.round(y) + 0.5);
        this.ctx.stroke();
      }
    }

    // hover highlight - draw "pop" effect for hovered cell
    const hx = this.hover.gx; const hy = this.hover.gy;
    if (hx >= 0 && hy >= 0 && hx < this.canvasb.width && hy < this.canvasb.height) {
      const xPx = this.offsetX + hx * cellPx;
      const yPx = this.offsetY + hy * cellPx;
      // pop: slightly enlarge and draw translucent fill
      const pad = Math.max(1, Math.min(6, cellPx * 0.12));
      this.ctx.save();
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.fillRect(xPx - pad, yPx - pad, cellPx + pad*2, cellPx + pad*2);

      // double stroke for black/white glow
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      this.ctx.strokeRect(xPx - pad + 0.5, yPx - pad + 0.5, cellPx + pad*2 - 1, cellPx + pad*2 - 1);
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      this.ctx.strokeRect(xPx - pad - 1 + 0.5, yPx - pad - 1 + 0.5, cellPx + pad*2 + 1, cellPx + pad*2 + 1);
      this.ctx.restore();
    }

    // last painted cell highlight (subtle)
    const lx = this.last_paint.gx; const ly = this.last_paint.gy;
    if (lx >= 0 && ly >= 0) {
      const xPx = this.offsetX + lx * cellPx;
      const yPx = this.offsetY + ly * cellPx;
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(xPx + 0.5, yPx + 0.5, cellPx - 1, cellPx - 1);
      this.ctx.restore();
    }
  }

}