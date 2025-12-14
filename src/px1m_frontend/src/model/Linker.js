import { idlFactory } from 'declarations/icp_linker';
import { Principal } from '@dfinity/principal';
import { shortPrincipal } from '../../../util/js/principal';
import { genActor } from '../../../util/js/actor';
import { html } from 'lit-html';
import Token from './Token';

export default class Linker {
	get_busy = false

	constructor(id_p, wallet) {
		this.id_p = id_p;
		this.id = id_p.toText();
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
			if (this.anon == null) this.anon = await genActor(idlFactory, this.id);
			if (this.token == null) {
				const token_p = await this.anon.linker1_token();
				this.token = new Token(token_p, this.wallet);
			}
		} catch (cause) {
			this.notif.errorToast(`Linker ${shortPrincipal(this.id_p)} Meta Failed`, cause);
		}
	}
}