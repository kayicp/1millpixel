import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from '@dfinity/agent';
import { AccountIdentifier } from '@dfinity/ledger-icp'
import { shortPrincipal } from "../../../util/js/principal";
import { html } from "lit-html";

const network = process.env.DFX_NETWORK;
const identityProvider =
  network === 'ic'
    ? 'https://identity.ic0.app' // Mainnet
    : 'http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:8080'; // Local

const DAYS_30_NANOS = BigInt(30 * 24 * 60 * 60 * 1000 * 1000 * 1000);

class Wallet {
	busy = false;

  ii = null;
	agent = null;
	principal = null;
	accountid = null;

  constructor(notif) {
		this.notif = notif;
		this.#init();
  }

	render(busy) {
		this.busy = busy;
		this.notif.render();
	}

  async #init() {
		this.render(true);
    if (this.ii == null) try {
      this.ii = await AuthClient.create();
    } catch (cause) {
			this.busy = false;
			return this.notif.errorToast('Init Client Creation Failed', cause);
    }
    try {
      if (await this.ii.isAuthenticated()) {
				// proceed to #authed
			} else return this.render(false);
    } catch (cause) {
			this.busy = false;
			return this.notif.errorToast('Init IsConnected Failed', cause);
    }
		try {
			await this.#authed();
			this.render(false);
		} catch (cause) {
			this.busy = false;
			this.notif.errorToast('Auto Connect Failed', cause);
		}
  }

	async login() {
		this.render(true);
		return new Promise(async (resolve, reject) => {
			if (this.ii == null) try {
				this.ii = await AuthClient.create();
			} catch (cause) {
				this.busy = false;
				this.notif.errorToast('Client Creation Failed', cause);
				return reject(cause);
			}
			const self = this;
			async function onSuccess() {
				try {
					await self.#authed();
					self.notif.successToast('Connected', `Welcome, ${shortPrincipal(self.principal)}`);
					resolve();
				} catch (cause) {
					self.notif.errorToast('Connect Failed', cause);
					reject(cause);
				}
			}
			try {
				if (await this.ii.isAuthenticated()) {
					onSuccess();
				} else this.ii.login({
					maxTimeToLive: DAYS_30_NANOS,
					identityProvider,
					onSuccess,
				});
			} catch (cause) {
				this.busy = false;
				this.notif.errorToast('IsConnected Failed', cause);
				reject(cause);
			}
		});
	}

	async #authed() {
		return new Promise(async (resolve, reject) => {
			try {
				const identity = await this.ii.getIdentity();
				this.agent = await HttpAgent.create({ identity });
				this.principal = await identity.getPrincipal();
				this.accountid = AccountIdentifier.fromPrincipal({ principal: this.principal }).toHex();
				this.busy = false;
				resolve();
			} catch (err) {
				this.busy = false;
				reject(err);
			}
		});
	}

	async logout() {
		this.render(true);
		return new Promise(async (resolve, reject) => {
			try {
				await this.ii.logout();
				this.ii = null;
				this.agent = null;
				this.principal = null;
				this.accountid = null;
				this.busy = false;
				this.notif.successToast('Disconnected', `You are now Anonymous`);
				resolve();
			} catch (cause) {
				this.busy = false;
				this.notif.errorToast('Disconnect Failed', cause);
				reject(cause);
			}
		});
	}

	click(e) {
		e.preventDefault();
		if (this.principal == null) {
			this.login();
		} else this.logout();
	}

	button() {
    if (this.principal) {
      return this.btn(this.busy? "Logging out..." : "Logout from Internet ID");
    } else {
      return this.btn(this.busy? "Logging in..." : "Login via Internet ID");
    };
  }
  
  btn(inner) {
		return html`
			<button 
				class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium 
					${this.principal ? 'bg-slate-800 hover:bg-slate-700' : 'bg-green-800 hover:bg-green-700'} 
					text-slate-100 ring-1 ring-slate-700 
					disabled:opacity-50 disabled:cursor-not-allowed"
				?disabled=${this.busy}
				@click=${(e) => this.click(e)}>
				${inner}
			</button>`;
	}
}

export default Wallet;