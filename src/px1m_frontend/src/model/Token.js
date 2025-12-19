import { idlFactory } from 'declarations/icp_token';
import { Principal } from '@dfinity/principal';
import { shortPrincipal } from '../../../util/js/principal';
import { genActor } from '../../../util/js/actor';
import { html } from 'lit-html';

export default class Token {
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
			if (this.power == null) {
				const [name, symbol, decimals, fee] = await Promise.all([
					this.anon.icrc1_name(),
					this.anon.icrc1_symbol(),
					this.anon.icrc1_decimals(),
					this.anon.icrc1_fee(),
				]);
				this.name = name;
				this.symbol = symbol;
				this.fee = fee;
				this.decimals = Number(decimals);
				this.power = BigInt(10 ** this.decimals);
			}
			this.render();
		} catch (cause) {
			this.get_busy = false;
			return this.notif.errorToast(`Token ${shortPrincipal(this.id_p)} Meta Failed`, cause);
		};
	}

	clean(n){
		const intPart = n / (this.power ?? 1n);
		const decPart = (n % (this.power ?? 1n)).toString().padStart(this.decimals ?? 1, '0');
		return `${intPart}.${decPart}`;
  }

	cleaner(n) {
    const intPart = n / (this.power ?? 1n);
    let decPart = (n % (this.power ?? 1n)).toString().padStart(this.decimals ?? 1, '0');
    
    // Remove trailing zeros from decimal part
    decPart = decPart.replace(/0+$/, '');
    
    // If the decimal part becomes empty, return just the integer part
    return decPart ? `${intPart}.${decPart}` : `${intPart}`;
	}


  raw(n_str) {
		let [intPart, decPart = ""] = n_str.split(".");
	
		// ensure we have only digits
		intPart = intPart || "0";
		decPart = decPart.replace(/\D/g, "");
	
		// truncate or pad to 8 decimal places
		decPart = decPart.padEnd(this.decimals, "0").slice(0, this.decimals);
	
		return BigInt(intPart + decPart);
	}
}