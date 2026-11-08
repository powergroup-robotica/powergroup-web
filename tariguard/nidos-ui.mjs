import {nidos, elegirNido, coordenadas, enlaceMapa, mapaIntegrado} from './nidos.mjs?v=1';

class UbicacionTariGuard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const raiz = this.attachShadow({mode:'open'});
    const monitor = this.hasAttribute('monitor');
    raiz.innerHTML = `
      <style>
        :host{display:block;margin:24px 0;color:#f2f2df;font:16px/1.5 system-ui,sans-serif}
        *{box-sizing:border-box}
        section{padding:20px;background:#193c31;border:1px solid #537d65;border-radius:14px}
        h2{font-size:1.3rem;line-height:1.2;margin:10px 0}
        p{margin:8px 0}
        .etiqueta{font-size:.72rem;letter-spacing:.08em;font-weight:800;color:#ffe7ab}
        .selector{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
        button,a{font:inherit}
        button{background:#294c3c;color:#f2f2df;border:1px solid #749681;border-radius:8px;padding:10px 12px;cursor:pointer;text-align:left;flex:1;min-width:140px}
        button[aria-pressed=true]{background:#c7e6a2;color:#14271b;border-color:#c7e6a2}
        button span{display:block;font-size:.8rem}
        button:focus-visible,a:focus-visible{outline:3px solid #ffdb8e;outline-offset:3px}
        .layout{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px}
        .nombre{font-weight:750;color:#d2efba}
        .gps{font:650 1.1rem/1.5 ui-monospace,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
        .detalle,.nota{font-size:.85rem;color:#d4e1d5}
        a{color:#d2efba;text-underline-offset:3px}
        iframe{display:block;width:100%;height:240px;border:0;border-radius:8px;background:#274c3a}
        .acciones{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0}
        details{font-size:.8rem;margin-top:14px}
        summary{cursor:pointer}
        ul{padding-left:20px}
      </style>
      <section aria-labelledby="titulo">
        <span class="etiqueta">GPS SIMULADO · GEOGRAFÍA REAL</span>
        <h2 id="titulo">Dos escenarios amazónicos</h2>
        <p class="nota">Posiciones fijas de demostración para representar nidos de prueba.</p>
        <div class="selector" role="group" aria-label="Elegir nido de demostración"></div>
        <div class="layout">
          <div>
            <p class="nombre" id="nombre"></p>
            <p id="zona"></p>
            <p class="gps" id="coordenadas"></p>
            <p class="detalle" id="referencia"></p>
            <p class="nota" id="contexto"></p>
            <div class="acciones">
              <a id="mapa" target="_blank" rel="noopener noreferrer">Ampliar mapa ↗</a>
              <a id="monitor" target="_blank" rel="noopener noreferrer">Ver nido en el monitor ↗</a>
            </div>
          </div>
          <iframe id="vista-mapa" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </div>
        <details><summary>Referencias del lugar</summary><ul id="fuentes"></ul></details>
      </section>`;
    const selector = raiz.querySelector('.selector');
    for (const nido of nidos) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.nido = nido.id;
      const nombre = document.createElement('strong');
      nombre.textContent = nido.nombre + ' · ' + nido.pais;
      const zona = document.createElement('span');
      zona.textContent = nido.zona;
      boton.append(nombre, zona);
      boton.addEventListener('click', () => this.mostrar(nido.id));
      selector.append(boton);
    }
    raiz.getElementById('monitor').hidden = monitor;
    raiz.getElementById('contexto').textContent = monitor ?
      'Las lecturas del prototipo conectado se presentan con la referencia del nido seleccionado. El GPS es una posición simulada fija.' :
      'Cada marcador usa una referencia geográfica pública de la región elegida para la demostración.';
    this.mostrar(new URLSearchParams(location.search).get('nido'));
  }

  mostrar(id) {
    const nido = elegirNido(id), raiz = this.shadowRoot;
    for (const boton of raiz.querySelectorAll('button[data-nido]')) {
      boton.setAttribute('aria-pressed', String(boton.dataset.nido === nido.id));
    }
    raiz.getElementById('nombre').textContent = nido.nombre + ' · ' + nido.pais;
    raiz.getElementById('zona').textContent = nido.zona;
    raiz.getElementById('coordenadas').textContent = coordenadas(nido);
    raiz.getElementById('referencia').textContent = nido.referencia;
    raiz.getElementById('mapa').href = enlaceMapa(nido);
    raiz.getElementById('monitor').href = new URL('panel.html?nido='+nido.id, import.meta.url).href;
    const mapa = raiz.getElementById('vista-mapa');
    mapa.title = 'Mapa de referencia de ' + nido.zona + ' · ubicación simulada';
    mapa.src = mapaIntegrado(nido);
    const fuentes = raiz.getElementById('fuentes');
    fuentes.replaceChildren();
    for (const fuente of nido.fuentes) {
      const item = document.createElement('li'), enlace = document.createElement('a');
      enlace.textContent = fuente.nombre;
      enlace.href = fuente.url;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      item.append(enlace);
      fuentes.append(item);
    }
  }
}

customElements.define('ubicacion-tariguard', UbicacionTariGuard);
