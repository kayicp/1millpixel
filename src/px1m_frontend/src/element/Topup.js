import { html } from 'lit-html';

export default class Topup {
	static PATH = '/topup';
	constructor(backend) {
		this.canvasb = backend;
		this.wallet = backend.wallet;
		this.notif = backend.wallet.notif;

		this.button = html`
		<button 
			class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 ring-1 ring-slate-700"
			@click=${(e) => {
				e.preventDefault();
				if (window.location.pathname.startsWith(Topup.PATH)) return;
				this.render();
				history.pushState({}, '', Topup.PATH);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}}>Topup</button>
		`;
	}

	render() {
		if (this.canvasb.linker == null) return html`<div>Loading metadata...</div>`;
		if (this.canvasb.linker.token == null) return html`<div>Loading linker...</div>`;
		if (this.canvasb.linker.token.symbol == null) return html`<div>Loading token...</div>`;
		const token = this.canvasb.linker.token;
		const plans = this.canvasb.plans.map(v => {
			return {
				credits: v.credits, // number
				per_credit: token.fee * v.multiplier,
				price: token.fee * v.credits * v.multiplier,
			}
		});
		const base_plan = plans[0];
		plans.forEach(v => {
			v.savings_pct = Math.max(0, Math.round((Number(base_plan.per_credit - v.per_credit) / Number(base_plan.per_credit)) * 100));
		});

		const isLoggedIn = this.wallet.principal != null;

		return html`
		<div class="max-w-4xl mx-auto p-6">
			<!-- Current credit / account summary -->
			<div class="mb-6 flex items-center justify-between bg-white/5 p-4 rounded-2xl shadow-sm">
				<div>
					<h3 class="text-sm font-semibold">Your credits</h3>
					<p class="mt-1 text-xs text-slate-300">1 credit = 1 pixel</p>
				</div>
				<div class="text-right">
					${isLoggedIn ? html`
						<div class="text-3xl font-bold">${this.canvasb.credits}</div>
						<div class="text-xs text-slate-400">available credits</div>
					` : html`
						<div class="text-sm font-medium text-slate-200">Anonymous</div>
						<div class="text-xs text-slate-400">Sign in to see your credits and purchase</div>
					`}
				</div>
			</div>
			<!-- Plans grid -->
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				${plans.map((p, idx) => html`
					<section class="relative rounded-2xl p-4 ring-1 ring-slate-700 bg-gradient-to-b from-slate-900/40 to-slate-900/20">
						${idx === 1 ? html`<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 px-3 py-1 text-xs rounded-full font-semibold">Best value</div>` : ''}
						<div class="flex items-baseline justify-between">
							<div>
								<h4 class="text-lg font-semibold">${idx === 0 ? 'Starter' : idx === 1 ? 'Creator' : 'Pro'}</h4>
								<p class="text-xs text-slate-400 mt-1">${p.credits} credits</p>
							</div>
							<div class="text-right">
								<div class="text-xl font-bold">${token.clean(p.price)} ${token.symbol}</div>
							</div>
						</div>

						<hr class="my-3 border-slate-700" />

						<!-- Buy button (disabled if not logged in) -->
						<button
							class="w-full inline-flex justify-center items-center gap-2 px-4 py-2 rounded-lg font-semibold transition shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${idx === 0 ? 'focus:ring-violet-400' : idx === 1 ? 'focus:ring-amber-400' : 'focus:ring-emerald-400'} ${isLoggedIn ? `${idx === 0 ? 'bg-violet-500' : idx === 1 ? 'bg-amber-500' : 'bg-emerald-500'} ${idx === 0 ? 'hover:bg-violet-600' : idx === 1 ? 'hover:bg-amber-600' : 'hover:bg-emerald-600'} text-slate-900` : 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed pointer-events-none'}"
							?disabled=${!isLoggedIn}
							@click=${(e) => {
                e.preventDefault();
                this.canvasb.topup(idx, p.price, p.credits);
							}}
						>
							${isLoggedIn ? html`Buy ${p.credits} credits — ${token.clean(p.price)} ${token.symbol}` : html`Log in to buy`}
						</button>
						<ul class="text-sm space-y-2 mb-4">
							${p.savings_pct > 0 ? html`<li class="text-emerald-400">You save ~${p.savings_pct}% vs Starter</li>` : ''}
						</ul>
					</section>
				`)}
			</div>
		</div>
		`;
	}
}