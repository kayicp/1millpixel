import { html, render } from 'lit-html';
import { px1m_backend } from 'declarations/px1m_backend';
import PubSub from '../../util/js/pubsub';
import Notif from './model/Notif';
import Wallet from './model/Wallet';
import { Principal } from '@dfinity/principal';
import Topup from './element/Topup';
import Draw from './element/Draw';
import Canvas from './model/Canvas';
import Home from './element/Home';

Principal.prototype.toString = function () {
  return this.toText();
}
Principal.prototype.toJSON = function () {
  return this.toString();
}
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const blob2hex = blob => Array.from(blob).map(byte => byte.toString(16).padStart(2, '0')).join('');
Uint8Array.prototype.toJSON = function () {
  return blob2hex(this) // Array.from(this).toString();
}
const pubsub = new PubSub();
const notif = new Notif(pubsub);
const wallet = new Wallet(notif);
const backend = new Canvas(wallet);
const topup = new Topup(backend);
const draw = new Draw(backend);
const home = new Home(backend);

pubsub.on('render', _render);
window.addEventListener('popstate', _render);

function _render() {
  const pathn = window.location.pathname;
  let page = html`<div class="text-xs text-slate-400">404: Not Found</div>`;
  if (pathn == Home.PATH) {
    page = home.render();
  } else if (pathn.startsWith(Topup.PATH)) {
    page = topup.render();
  } else if (pathn.startsWith(Draw.PATH)) {
    page = draw.render();
  }

  const body = html`
    <div class="min-h-screen flex flex-col">
      <header class="flex items-center gap-2 p-2 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <button
          class="inline-flex items-center px-2 py-1 text-xs rounded-md font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 ring-1 ring-slate-700"
          @click=${() => {
            history.pushState({}, '', '/'); 
            window.dispatchEvent(new PopStateEvent('popstate'));
            _render();
          }}>
          MillionPixels
        </button>

        <div class="flex items-center gap-2 ml-2">
          ${draw.button}
          ${topup.button}
        </div>

        <div class="ml-auto">
          ${wallet.button()}
        </div>
      </header>
      <main class="p-3 max-w-6xl mx-auto flex-1 relative">
        ${page}
      </main>
      <footer class="p-2 text-xs text-slate-400">
        © MillionPixels
      </footer>
      ${notif.draw()}
    </div>
  `;
  render(body, document.getElementById('root'));
}

class App {
  constructor() {
    _render();
  }
}

export default App;
