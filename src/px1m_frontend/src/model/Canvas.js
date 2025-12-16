import { Principal } from '@dfinity/principal';
import { shortPrincipal } from '../../../util/js/principal';
import { genActor } from '../../../util/js/actor';
import { html } from 'lit-html';
import { idlFactory, canisterId } from 'declarations/px1m_backend';
import Linker from './Linker';
import { convertTyped } from '../../../util/js/value';

export default class Canvas {
	busy = false;
	get_busy = false;
	buffer = new Uint8Array();
	to_commit = new Map();
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
		await this.#get();
		this.get_busy = false;
		this.render();
	}

	async #get() {
		try {
			if (this.anon == null) this.anon = await genActor(idlFactory, canisterId);
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
		} catch (cause) {
			console.error(cause);
			return this.notif.errorToast(`Canvas Meta Failed`, cause);
		}
		if (this.wallet.principal != null) {
			try {
				const user_acct = { owner: this.wallet.principal, subaccount: [] };
				const [user_credit] = await this.anon.canvas_credits_of([user_acct]);
				this.credits = user_credit;
			} catch (cause) {
				return this.notif.errorToast(`Canvas Credit Failed`, cause);
			}
		}

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
			} catch (cause) {
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
		this.notif.successToast('Ready', '');
	}

	async topup(idx, price, credits) {
		const token = this.linker.token;
    this.notif.confirmPopup(`Confirm Topup Credits?`, html`
			<div class="text-xs text-slate-400">Amount: </div>
			<span class="text-slate-300 font-mono">${credits} Credits</span><br><br>
			<div class="text-xs text-slate-400">Price: </div>
			<span class="text-slate-300 font-mono">${token.clean(price)} ${token.symbol}</span><br><br>
			<div class="text-xs text-slate-400">AccountLink fee: </div>
			<span class="text-slate-300 font-mono">${token.clean(token.fee + token.fee)} ${token.symbol}</span><br><br>
			<div class="text-xs text-slate-400">TOTAL: </div>
			<span class="text-slate-300 font-mono">${token.clean(price + token.fee + token.fee)} ${token.symbol}</span>

			<hr class="my-3 border-slate-700" />
			<div class="text-xs text-slate-400">Please set a new connection to your AccountLink by using these values: </div><br>
      <div class="text-xs text-slate-400">App's principal: </div>
			<span class="text-slate-300 font-mono">${canisterId}</span><br><br>
			<div class="text-xs text-slate-400">Your principal: </div>
			<span class="text-slate-300 font-mono">${this.wallet.principal}</span><br><br>
			<div class="text-xs text-slate-400">Amount (${token.symbol}): </div>
			<span class="text-slate-300 font-mono">${token.clean(price + token.fee + token.fee)}</span><br><br>
			`, [{
			label: `I have set the connection, now confirm topup`,
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
							msg = `Your AccountLink only have ${token.clean(res.Err.InsufficientBalance.balance)} ${token.symbol}. You need at least ${token.clean(price + token.fee + token.fee)} ${token.symbol}`
						} else if ('InsufficientAllowance' in res.Err) {
							msg = `Your AccountLink only allowed ${token.clean(res.Err.InsufficientAllowance.allowance)}. You need to allow at least ${token.clean(price + token.fee + token.fee)} ${token.symbol}`
						}
						this.notif.errorPopup(title, msg);
					} else {
						this.notif.successPopup(`Topup OK`, `Block: ${res.Ok}`);
						this.get();
					}
				} catch (cause) {
					this.busy = false;
					this.notif.errorToast(`Topup Failed`, cause);
				}
			}
		}])
	}

	async commit(pixels) {
		if (pixels.length == 0) {
			return this.notif.errorPopup('No pixels to save', 'Place a pixel first');
		}
		if (this.credits < pixels.length) {
			return this.notif.errorPopup('Insufficient Pixel Credit', `You are placing ${pixels.length} pixels but you have ${this.credits} Pixel Credits. Please topup your Pixel Credits.`);
		}
		this.notif.confirmPopup(`Confirm Save?`, html`
			<div class="text-xs text-slate-400">You have ...</div>
			<span class="text-slate-300 font-mono">${this.credits} Pixel Credits.</span><br><br>
			<div class="text-xs text-slate-400">You are saving</div>
			<span class="text-slate-300 font-mono">${pixels.length} pixels</span><br>
			<hr class="my-3 border-slate-700" />
			<div class="text-xs text-slate-400">After saving, you will have: </div>
			<span class="text-slate-300 font-mono">${this.credits - BigInt(pixels.length)} Pixel Credits</span>`, [{
				label: 'Confirm Save',
				onClick: async () => {
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
						this.notif.successToast(`${oks} pixels saved`, 'If you have any feedback, feel free to tweet me (@kayicp)!');
						for (const { x, y, err } of errs) {
							let msg = JSON.stringify(err);
							if ('GenericError' in err) msg = err.GenericError;
							this.notif.errorToast(`Pixel (x: ${x}, y: ${y}) save failed`, msg);
						}
						if (errs.length > 0) this.notif.infoToast(`${errs.length} Pixel Credits unused`);
						this.get();
					} catch (cause) {
						this.busy = false;
						this.notif.errorPopup(`Save Failed`, `Cause: ${cause}. ${pixels.length} Pixel Credits unused.`);
					}
				}
			}])
		
	}
}