import { Principal } from '@dfinity/principal';
import { shortPrincipal } from '../../../util/js/principal';
import { genActor } from '../../../util/js/actor';
import { html } from 'lit-html';
import { idlFactory, canisterId } from 'declarations/px1m_backend';
import Linker from './Linker';
import { convertTyped } from '../../../util/js/value';

const network = process.env.DFX_NETWORK;
const account_link_origin =
  network === 'ic'
		? 'https://id.ai/' // Mainnet
    : 'http://xob7s-iqaaa-aaaar-qacra-cai.localhost:8080'; // Local

export default class Canvas {
	busy = false;
	get_busy = false;
	buffer = new Uint8Array();
	placedPixels = new Map();
	credits = 0n;
	bufferVersion = 0;

	static MAX_TAKE = 10000;
	static MAX_BATCH = 1000;

	constructor(wallet) {
		this.wallet = wallet;
		this.notif = wallet.notif;
		this.get();
	}

	render() {
		this.wallet.render();
	}

	async get() {
		this.get_busy = true;
		this.render();
		try {
			if (this.anon == null) this.anon = await genActor(idlFactory, canisterId);
			if (this.width == null) {
				const [width, height, credit_plans, linker] = await Promise.all([
					this.anon.canvas_width(),
					this.anon.canvas_height(),
					this.anon.canvas_credit_plans(),
					this.anon.canvas_linker(),
				]);
				this.width = Number(width);
				this.height = Number(height);
				this.plans = credit_plans;
				this.linker = new Linker(linker, this.wallet);
				this.buffer = new Uint8Array(this.width * this.height);
				this.render();
			}
		} catch (cause) {
			this.get_busy = false;
			return this.notif.errorToast(`Canvas Meta Failed`, cause);
		}
		this.linker.get();
		if (this.wallet.principal != null) {
			try {
				const user_acct = { owner: this.wallet.principal, subaccount: [] };
				const [user_credit] = await this.anon.canvas_credits_of([user_acct]);
				this.credits = user_credit;
				this.render();
			} catch (cause) {
				this.get_busy = false;
				return this.notif.errorToast(`Canvas Credit Failed`, cause);
			}
		}
		// todo: change copy to sell to different audience/early adopters
		// todo: fix undo/redo stack when Save, maybe put them in backend too like placedPixel?
		// if (this.has_init) {
		try {
			const PARALLEL = 5;
			const TOTAL = this.width * this.height;
			
			// Build request list
			const requests = [];
			for (let offset = 0; offset < TOTAL; offset += Canvas.MAX_TAKE) {
				requests.push({
					x: offset % this.width,
					y: Math.floor(offset / this.width),
					take: Math.min(Canvas.MAX_TAKE, TOTAL - offset),
					offset
				});
			}
			
			// Process in parallel batches
			for (let i = 0; i < requests.length; i += PARALLEL) {
				const chunk = requests.slice(i, i + PARALLEL);
				const results = await Promise.all(
					chunk.map(r => this.anon.canvas_pixels_from(BigInt(r.x), BigInt(r.y), [BigInt(r.take)]))
				);
				// Copy directly into buffer
				results.forEach((pixels, idx) => {
					this.buffer.set(pixels, chunk[idx].offset);
				});
			}
			this.bufferVersion++;
			// this.has_init = false;
			this.get_busy = false;
			this.render();
		} catch (cause) {
			this.get_busy = false;
			this.notif.errorToast(`Canvas Pixels Init Failed`, cause);
		}
		// }

		// if (this.init_full < this.buffer.length) this.curr_len = null;
		// if (this.curr_len == null) {
		// 	try {
		// 		const txns = await this.anon.icrc3_get_blocks([]);
		// 		this.curr_len = txns.log_length;
		// 	} catch (cause) {
		// 		return this.notif.errorToast(`Canvas Start Txn Failed`, cause);
		// 	}
		// 	try {
		// 		for (let yn = 0; yn < this.height; yn++) {
		// 			const y = BigInt(yn);
		// 			let coordinates = [];
		// 			for (let xn = 0; xn < this.width; xn++) {
		// 				const x = BigInt(xn);
		// 				coordinates.push({ x, y });
		// 				if (coordinates.length >= 250) {
		// 					const pixels = await this.anon.canvas_pixels_of(coordinates);
		// 					for (let i = 0; i < 250; i++) {
		// 						const coord = coordinates[i];
		// 						this.buffer[Number(coord.y) * this.width + Number(coord.x)] = pixels[i];
		// 						this.init_full++;
		// 					}
		// 				}
		// 			}
		// 		}
		// 	} catch (cause) {
		// 		return this.notif.errorToast(`Canvas Pixels Failed`, cause);
		// 	}
		// } else {
		// 	this.prev_len = this.curr_len;
		// 	try {
		// 		const txns = await this.anon.icrc3_get_blocks([]);
		// 		this.curr_len = txns.log_length;
		// 	} catch (cause) {
		// 		return this.notif.errorToast(`Canvas Current Txn Failed`, cause);
		// 	}
		// 	const diff_len = this.curr_len - this.prev_len;
		// 	if (diff_len > 0n) {
		// 		try {
		// 			const txns = await this.anon.icrc3_get_blocks([{ start: this.prev_len - 1, length: diff_len }]);
		// 			for (const { block } of txns.blocks) {
		// 				const b = convertTyped(block);
		// 				if (b.op == 'commit') {
		// 					this.buffer[b.tx.y * this.width + b.tx.x] = b.tx.color;
		// 				}
		// 			}
		// 		} catch (cause) {
		// 			return this.notif.errorToast(`Canvas Blocks Failed`, cause);
		// 		}
		// 	}
		// }
		console.log('Ready');
	}

	async topup(idx, price, credits) {
		const token = this.linker.token;
		const total = price + token.fee;
	
		this.notif.confirmPopup(
			`Confirm top‑up`,
			html`
				<div class="text-xs space-y-6">
					<!-- Payment details -->
					<section>
						<div class="uppercase tracking-wide text-slate-400 mb-1">
							Payment details
						</div>
						<div class="space-y-1">
							<div class="flex justify-between">
								<span class="text-slate-400">Credits</span>
								<span class="text-slate-200 font-mono">${credits}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-400">Price</span>
								<span class="text-slate-200 font-mono">
									${token.clean(price)} ${token.symbol}
								</span>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-400">AccountLink fee</span>
								<span class="text-slate-200 font-mono">
									${token.clean(token.fee)} ${token.symbol}
								</span>
							</div>
							<div class="flex justify-between font-semibold">
								<span class="text-slate-300">Total to pay</span>
								<span class="text-slate-100 font-mono">
									${token.clean(total)} ${token.symbol}
								</span>
							</div>
						</div>
					</section>
					<br>
					<hr class="border-slate-700" />
					<br>
					<!-- AccountLink setup (new flow) -->
					<section class="space-y-3">
						<div class="uppercase tracking-wide text-slate-400">
							Finish in AccountLink
						</div>
						<br>
						<p class="text-slate-400">
							We’ll open AccountLink with this payment already configured for
							<span class="font-semibold">MillionPixels</span>. Review and approve
							the link there, then return here to confirm the payment.
						</p>
						<br>
						<button
							@click=${() => {
								const url = `${account_link_origin}/links/new?${new URLSearchParams({
									linker: this.linker.id,
									app: canisterId,
									user: this.wallet.principal,
									spending_limit: token.clean(total),
									expiry_unit: "days",
									expiry_amount: 1,
								}).toString()}`;
								window.open(url, '_blank');
							}}
							class="px-3 py-1 text-xs rounded-md bg-blue-700 hover:bg-blue-600 text-slate-100"
						>
							Open AccountLink in new tab
						</button>
		
						<!-- Optional: advanced details for verification -->
						<details class="mt-2">
							<summary class="cursor-pointer text-slate-500 hover:text-slate-300 text-[11px]">
								Show technical details
							</summary>
							<div class="mt-2 space-y-3">
								<div>
									<div class="text-slate-400 text-[11px]">
										App canister ID (backend principal)
									</div>
									<div class="text-slate-200 font-mono break-all text-[11px]">
										${canisterId}
									</div>
								</div>
		
								<div>
									<div class="text-slate-400 text-[11px]">
										Your user ID (principal)
									</div>
									<div class="text-slate-200 font-mono break-all text-[11px]">
										${this.wallet.principal}
									</div>
								</div>
		
								<div>
									<div class="text-slate-400 text-[11px]">
										Spending limit (minimum required)
									</div>
									<div class="text-slate-200 font-mono text-[11px]">
										${token.clean(total)} ${token.symbol}
									</div>
								</div>
							</div>
						</details>
		
						<p class="text-slate-500 text-[11px]">
							Make sure the spending limit in AccountLink is at least
							<span class="font-mono">${token.clean(total)} ${token.symbol}</span>.
						</p>
					</section>
				</div>
			`,
			[
				{
					// After the user has finished in AccountLink
					label: `I’ve set this up in AccountLink – confirm payment`,
					onClick: async () => {
				this.busy = true;
				this.render();
				try {
					const user = await genActor(idlFactory, canisterId, this.wallet.agent);
					const res = await user.canvas_topup({
						subaccount : [],
            plan: BigInt(idx),
						fee: [price],
						amount: [credits],
						memo: [],
						created_at: [],
					});
					this.busy = false;
					if ('Err' in res) {
						const title = `Topup Error`;
						let msg = JSON.stringify(res.Err);
						if ('GenericError' in res.Err) {
							msg = res.Err.GenericError.message;
						} else if ('Unproxied' in res.Err) {
							msg = 'You are not connected to your AccountLink';
						} else if ('Locked' in res.Err) {
              msg = 'Please wait. Your AccountLink is busy';
						} else if ('InsufficientBalance' in res.Err) {
							msg = `Your AccountLink only have ${token.clean(res.Err.InsufficientBalance.balance)} ${token.symbol}. You need at least ${token.clean(total)} ${token.symbol}`
						} else if ('InsufficientAllowance' in res.Err) {
							msg = `Your AccountLink only allowed ${token.clean(res.Err.InsufficientAllowance.allowance)}. You need to allow at least ${token.clean(total)} ${token.symbol}`
						}
						this.notif.errorPopup(title, msg);
					} else {
						this.notif.successPopup(`Topup OK`, `Block: ${res.Ok}`);
					}
				} catch (cause) {
					this.busy = false;
					this.notif.errorToast(`Topup Failed`, cause);
				}
				this.get();
			}
		}])
	}

	async commit() {
		if (this.wallet.principal == null) return this.notif.infoPopup('Every art has its own artist', 'Login to save your art')

		if (this.placedPixels.size == 0) {
			return this.notif.errorPopup('Nothing to save', 'Place at least one pixel before saving.');
		}
	
		if (this.credits < this.placedPixels.size) {
			return this.notif.errorPopup(
				'Not enough credits',
				`You are trying to save ${this.placedPixels.size} pixels but you only have ${this.credits} credits. You need ${BigInt(this.placedPixels.size) - this.credits} credits more.`
			);
		}
	
		this.notif.confirmPopup(
			'Confirm save',
			html`
				<div class="text-xs space-y-3">
					<div>
						<div class="text-slate-400">Current balance</div>
						<div class="text-slate-300 font-mono">
							${this.credits} credits
						</div>
					</div>
					<br>
					<div>
						<div class="text-slate-400">Pixels to save (credits to spend)</div>
						<div class="text-slate-300 font-mono">
							${this.placedPixels.size} pixels
						</div>
					</div>
					<hr class="my-3 border-slate-700" />
					<div>
						<div class="text-slate-400">Balance after save</div>
						<div class="text-slate-300 font-mono">
							${this.credits - BigInt(this.placedPixels.size)} credits
						</div>
					</div>
	
					<p class="pt-1 text-slate-500">
						Saving will apply these pixels to the shared canvas and permanently spend your credits.
					</p>
				</div>
			`,
			[{
				label: 'Confirm save',
				onClick: async () => {
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
					this.placedPixels.clear();
					this.busy = true;
					this.render();
					try {
						const user = await genActor(idlFactory, canisterId, this.wallet.agent);
						const many_res = await user.canvas_commit(pixels);
						this.busy = false;
						let oks = 0;
						let errs = [];
						for (let i = 0; i < many_res.length; i++) {
							const arg = pixels[i];
							const res = many_res[i];
							if ('Err' in res) {
								errs.push({ 
									x: arg.x, 
									y: arg.y, 
									color: arg.color, 
									err: res.Err 
								});
							} else oks += 1;
						}
						this.notif.successToast(`${oks} pixels saved!`, 'Cool! (OwO)b');
						for (const { x, y, color, err } of errs) {
							let msg = JSON.stringify(err);
							if ('GenericError' in err) msg = err.GenericError;
							this.notif.errorToast(`Pixel (x: ${x}, y: ${y}) save failed`, msg);
							this.placedPixels.set(`${x},${y}`, Number(color));
						}
						if (errs.length > 0) this.notif.infoToast(`${errs.length} pixels unsaved`);
					} catch (cause) {
						this.busy = false;
						this.notif.errorPopup(`Save Failed`, `Cause: ${cause}. ${pixels.length} pixels unsaved.`);
					}
					this.get();
				}
			}])
		
	}
}