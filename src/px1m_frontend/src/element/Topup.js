import { html } from 'lit-html';

export default class Topup {
	static PATH = '/topup';
	constructor(backend) {
		this.canvasb = backend;
		this.wallet = backend.wallet;
		this.notif = backend.wallet.notif;

		this.button = html`
		<button 
			class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium bg-violet-800 hover:bg-violet-700 text-slate-100 ring-1 ring-slate-700"
			@click=${(e) => {
				e.preventDefault();
				if (window.location.pathname.startsWith(Topup.PATH)) return;
				this.render();
				history.pushState({}, '', Topup.PATH);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}}>Top Up</button>
		`;
	}

	render() {
		if (this.canvasb.linker == null) return html`<div>Loading canvas…</div>`;
		if (this.canvasb.linker.token == null) return html`<div>Loading AccountLink…</div>`;
		if (this.canvasb.linker.token.symbol == null) return html`<div>Loading ICP token…</div>`;
	
		const token = this.canvasb.linker.token;
		const plans = this.canvasb.plans.map(v => {
			return {
				credits: v.credits, // number
				per_credit: token.fee * v.multiplier,
				price: token.fee * v.credits * v.multiplier,
			};
		});
	
		const base_plan = plans[0];
		plans.forEach(v => {
			v.savings_pct = Math.max(
				0,
				Math.round(
					(Number(base_plan.per_credit - v.per_credit) / Number(base_plan.per_credit)) * 100
				)
			);
		});
	
		const isLoggedIn = this.wallet.principal != null;
	
		const planNames = ['Starter', 'Creator', 'Pro'];
	
		return html`
			<div class="max-w-4xl mx-auto p-6 space-y-6">
				<!-- Page heading -->
				<header class="space-y-1">
					<h1 class="text-xl font-semibold text-slate-100">Top-up Credits</h1>
					<p class="text-xs text-slate-400">
						Credits let you place pixels on the canvas. 1 credit = 1 pixel.
					</p>
				</header>
				<br>
	
				<!-- Current credit / account summary -->
				<section class="mb-2 flex items-center justify-between bg-white/5 p-4 rounded-2xl shadow-sm border border-slate-800">
					<div>
						<p class="text-xs uppercase tracking-wide text-slate-400">Your credits</p>
					</div>
					<div class="text-right">
						${isLoggedIn ? html`
							<div class="text-3xl font-bold">${this.canvasb.credits}</div>
							<div class="text-xs text-slate-400">available credits</div>
						` : html`
							<div class="text-sm font-medium text-slate-200">Not logged in</div>
							<div class="text-xs text-slate-400">
								Log in with your Internet ID (top‑right) to see your balance.
							</div>
						`}
					</div>
				</section>
				<br>
	
				<!-- Log‑in hint -->
				${!isLoggedIn ? html`
					<section class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-100">
						To buy credits, log in with your Internet ID using the button in the top‑right corner.
					</section><br>
				` : ''}
	
				<!-- Plans grid -->
				<section class="grid grid-cols-1 md:grid-cols-3 gap-4">
					${plans.map((p, idx) => html`
						<section
							class="relative flex flex-col justify-between rounded-2xl p-4 ring-1 ring-slate-700 bg-gradient-to-b from-slate-900/40 to-slate-900/10"
						>
							${idx === 1 ? html`
								<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 px-3 py-1 text-xs rounded-full font-semibold shadow-sm">
									Recommended
								</div>
							` : ''}
	
							<!-- Plan header -->
							<header class="mb-3">
								<h4 class="text-lg font-semibold flex items-baseline gap-2">
									${planNames[idx] || 'Plan'}
								</h4>
							</header>
	
							<!-- Credits & pricing -->
							<div class="mb-3">
								<div class="text-2xl font-bold">
									${p.credits.toLocaleString()} credits
								</div>
								<div class="mt-1 text-xs text-slate-400">
									${token.cleaner(p.per_credit)} ${token.symbol} per credit
								</div>
							</div>
	
							<div class="mb-3 flex items-baseline justify-between">
								<div class="text-sm text-slate-300">Total</div>
								<div class="text-lg font-semibold">
									${token.cleaner(p.price)} ${token.symbol}
								</div>
							</div>
	
							<!-- Savings row -->
							<dl class="mb-4 text-xs space-y-1">
								<div class="flex justify-between">
									<dt class="text-slate-400">Savings</dt>
									<dd class="${p.savings_pct > 0 ? 'text-emerald-400' : 'text-slate-500'}">
										${p.savings_pct > 0 ? `~${p.savings_pct}%` : '—'}
									</dd>
								</div>
							</dl>
	
							<!-- Buy button -->
							<button
								class="mt-auto w-full inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg font-semibold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2
									${idx === 0 ? 'focus:ring-violet-400' : idx === 1 ? 'focus:ring-amber-400' : 'focus:ring-emerald-400'}
									${isLoggedIn
										? `${idx === 0
												? 'bg-violet-500 hover:bg-violet-600'
												: idx === 1
												? 'bg-amber-500 hover:bg-amber-600'
												: 'bg-emerald-500 hover:bg-emerald-600'
											} text-slate-900`
										: 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed pointer-events-none'
									}"
								?disabled=${!isLoggedIn}
								@click=${(e) => {
									e.preventDefault();
									this.canvasb.topup(idx, p.price, p.credits);
								}}
							>
								${isLoggedIn
									? html`Get ${p.credits.toLocaleString()} credits`
									: html`Log in to buy credits`
								}
							</button>
						</section>
					`)}
				</section>
				<br>
	
				<!-- Small helper text -->
				<section class="text-xs text-slate-400">
					<h2 class="font-semibold text-slate-200 mb-1">Notes</h2>
					<ul class="list-disc list-inside space-y-1">
						<li>You can top up again at any time as you need more pixels.</li>
					</ul>
				</section>
			</div>
		`;
	}
	
}