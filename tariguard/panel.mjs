import {leerPaquete, obtenerAlertas, leerMicrobitEnArduino} from './telemetria.mjs?v=3';

const elemento = id => document.getElementById(id);
const fuentes = {
  A:{port:null, reader:null, writer:null, muestra:null, ultimo:0, cerrando:false, abriendo:false, ultimaLinea:0},
  M:{port:null, reader:null, writer:null, muestra:null, ultimo:0, cerrando:false, abriendo:false, ultimaLinea:0, receptora:0, diagnostico:''}
};
const caducidad = 9000;
let audio = null;
let sonidoActivo = false;
let ultimoSonido = 0;
let avisosPrevios = new Set();
let huboRegistro = false;
let microbitPorArduino = null;
let ultimoMicrobitPorArduino = 0;

function registrar(texto) {
  const lista = elemento('historial');
  if (!huboRegistro) {lista.replaceChildren(); huboRegistro = true;}
  const item = document.createElement('li');
  item.textContent = new Date().toLocaleTimeString('es-UY') + ' · ' + texto;
  lista.prepend(item);
  while (lista.children.length > 50) lista.lastElementChild.remove();
}

function datoReciente(origen) {
  const fuente = fuentes[origen];
  return fuente.port && Date.now() - fuente.ultimo <= caducidad ? fuente.muestra : null;
}

function limite(id, predeterminado) {
  const campo = elemento(id);
  return campo.value !== '' && campo.validity.valid ? Number(campo.value) : predeterminado;
}

function valor(id, dato, unidad, decimales = 1) {
  elemento(id).textContent = dato === null || dato === undefined ?
    '—' : dato.toFixed(decimales) + unidad;
}

function actualizar() {
  const arduino = datoReciente('A'), porRadio = datoReciente('M');
  const porCable = fuentes.A.port && Date.now() - ultimoMicrobitPorArduino <= caducidad ?
    microbitPorArduino : null;
  const microbit = porRadio || porCable;
  elemento('origen-microbit').textContent = porRadio ?
    'Inclinación y YL-69 recibidos por radio → USB de la receptora.' :
    (porCable ? 'Inclinación y YL-69 recibidos por P0 → Arduino → USB.' :
      'Esperando lecturas de inclinación y YL-69.');
  valor('aire', arduino?.aire, ' °C');
  valor('humedad', arduino?.humedad, ' %');
  valor('sustrato', arduino?.sustrato, ' °C');
  valor('agua', arduino?.agua, '/100', 0);
  valor('angulo', microbit?.angulo, '°');
  valor('bruto', microbit?.bruto, '', 0);
  valor('ph', arduino?.ph, '');
  const avisos = obtenerAlertas(arduino, microbit, {
    agua:limite('limite-agua', 80),
    angulo:limite('limite-angulo', 5),
    temperatura:elemento('activar-temperatura').checked,
    maxima:limite('limite-temperatura', 35)
  });
  for (const [origen, fuente] of Object.entries(fuentes)) {
    const dato = datoReciente(origen);
    if (!fuente.port) continue;
    const edad = Math.floor((Date.now() - fuente.ultimo) / 1000);
    let estado = 'Puerto abierto · esperando lecturas válidas';
    if (origen === 'M') {
      if (fuente.diagnostico) estado = fuente.diagnostico;
      else if (Date.now() - fuente.receptora < 6000) {
        estado = 'Receptora USB detectada · esperando radio de la emisora';
      } else if (fuente.ultimaLinea && Date.now() - fuente.ultimaLinea < 6000) {
        estado = 'Llegan mensajes USB · revisar programa de la receptora';
      }
    }
    elemento('estado-' + origen).textContent = dato ?
      'Recibiendo · hace ' + edad + ' s' : estado;
    if (!dato && !(origen === 'M' && porCable)) avisos.push({id:'enlace-' + origen, texto:
      (origen === 'A' ? 'Arduino' : 'Radio micro:bit') + ' · sin lecturas recientes. Revisar el enlace y el programa.'});
  }
  if (arduino) {
    if (arduino.aire === null || arduino.humedad === null) avisos.push({id:'dht',texto:'DHT22 sin lectura válida.'});
    if (arduino.sustrato === null) avisos.push({id:'ds',texto:'DS18B20 sin lectura válida. Revisar sensor de sustrato.'});
    if (arduino.agua === null) avisos.push({id:'cal',texto:'Agua sin índice disponible. Revisar la recepción y completar la calibración.'});
  }
  const contenedor = elemento('alertas');
  contenedor.replaceChildren();
  if (avisos.length) {
    for (const aviso of avisos) {
      const p = document.createElement('p');
      p.className = 'aviso';
      p.textContent = aviso.texto;
      contenedor.append(p);
      if (!avisosPrevios.has(aviso.id)) registrar(aviso.texto);
    }
  } else {
    contenedor.textContent = arduino && microbit ?
      'Lecturas recientes. Ningún límite configurado está superado.' :
      'Esperando conectar los dos dispositivos para completar el panel.';
  }
  avisosPrevios = new Set(avisos.map(aviso => aviso.id));
  if (sonidoActivo && avisos.length && Date.now() - ultimoSonido > 10000) emitirSonido();
}

function emitirSonido() {
  if (!audio || audio.state !== 'running') return;
  ultimoSonido = Date.now();
  const oscilador = audio.createOscillator(), volumen = audio.createGain();
  oscilador.frequency.value = 740;
  volumen.gain.setValueAtTime(0.0001, audio.currentTime);
  volumen.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.025);
  volumen.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
  oscilador.connect(volumen);
  volumen.connect(audio.destination);
  oscilador.start();
  oscilador.stop(audio.currentTime + 0.4);
}

function botones(origen, ocupado) {
  elemento('conectar-' + origen).disabled = ocupado || !('serial' in navigator);
  elemento('desconectar-' + origen).disabled = !fuentes[origen].port;
  if (origen === 'A') {
    elemento('seco').disabled = !fuentes.A.port;
    elemento('mojado').disabled = !fuentes.A.port;
  }
}

function procesar(linea, origen) {
  fuentes[origen].ultimaLinea = Date.now();
  if (origen === 'A') {
    const lectura = leerMicrobitEnArduino(linea);
    if (lectura) {
      microbitPorArduino = lectura;
      ultimoMicrobitPorArduino = Date.now();
      actualizar();
    }
  }
  if (origen === 'M') {
    elemento('ultimo-mensaje-M').textContent = linea.slice(0,160) || '(línea vacía)';
    if (/^TGSTATUS\|RECEPTORA\|\d+$/.test(linea) || linea === 'TARIGUARD_RECEPTORA_LISTA') {
      fuentes.M.receptora = Date.now();
      fuentes.M.diagnostico = '';
    } else if (linea.startsWith('TG1|A|')) {
      fuentes.M.diagnostico = 'Seleccionaste el Arduino. Desconecta este puerto y elige la micro:bit receptora.';
    } else if (/Traceback|Error:/.test(linea)) {
      fuentes.M.diagnostico = 'El programa de micro:bit informó un error. Consulta el diagnóstico de abajo.';
    }
  }
  if (origen === 'A' && /^(Seco registrado:|Calibracion|Lecturas casi iguales|Primero enviar)/.test(linea)) {
    elemento('calibracion').textContent = linea;
    registrar(linea);
  }
  const muestra = leerPaquete(linea, origen);
  if (!muestra) return;
  fuentes[origen].muestra = muestra;
  if (origen === 'M') fuentes.M.diagnostico = '';
  fuentes[origen].ultimo = Date.now();
  actualizar();
}

async function conectar(origen) {
  const fuente = fuentes[origen];
  if (fuente.abriendo || fuente.port) return;
  fuente.abriendo = true;
  fuente.cerrando = false;
  botones(origen, true);
  try {
    const port = await navigator.serial.requestPort();
    if (Object.values(fuentes).some(f => f.port === port)) {
      throw new Error('Ese puerto ya está conectado. Selecciona la otra placa.');
    }
    await port.open({baudRate:origen === 'A' ? 9600 : 115200});
    fuente.port = port;
    fuente.muestra = null;
    fuente.ultimo = 0;
    fuente.ultimaLinea = 0;
    if (origen === 'M') {
      fuente.receptora = 0;
      fuente.diagnostico = '';
      elemento('ultimo-mensaje-M').textContent = 'Esperando mensajes del USB…';
    }
    botones(origen, true);
    registrar((origen === 'A' ? 'Arduino' : 'micro:bit receptora') + ' conectado por USB.');
    const decoder = new TextDecoder();
    let buffer = '';
    fuente.reader = port.readable.getReader();
    while (!fuente.cerrando) {
      const {value, done} = await fuente.reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      let salto;
      while ((salto = buffer.indexOf('\n')) !== -1) {
        const linea = buffer.slice(0, salto).replace(/\r$/, '');
        buffer = buffer.slice(salto + 1);
        if (linea.length <= 160) procesar(linea, origen);
      }
      if (buffer.length > 512) buffer = '';
    }
  } catch (error) {
    if (!fuente.cerrando && error.name !== 'NotFoundError') {
      registrar('Conexión ' + origen + ' · ' + error.message);
      elemento('estado-' + origen).textContent = 'Error · ' + error.message;
    }
  } finally {
    if (fuente.reader) {fuente.reader.releaseLock(); fuente.reader = null;}
    if (fuente.writer) {await fuente.writer.catch(() => {}); fuente.writer = null;}
    if (fuente.port) {
      try {await fuente.port.close();} catch {}
    }
    fuente.port = null;
    fuente.muestra = null;
    fuente.abriendo = false;
    botones(origen, false);
    if (fuente.cerrando) elemento('estado-' + origen).textContent = 'Desconectado';
    actualizar();
  }
}

async function desconectar(origen) {
  const fuente = fuentes[origen];
  fuente.cerrando = true;
  if (fuente.reader) {
    try {await fuente.reader.cancel();} catch {}
  }
}

async function calibrar(orden) {
  const fuente = fuentes.A;
  if (!fuente.port || fuente.writer || fuente.cerrando) return;
  const escritor = fuente.port.writable.getWriter();
  fuente.writer = (async () => {
    try {
      await escritor.write(new TextEncoder().encode(orden + '\n'));
      elemento('calibracion').textContent = 'Orden enviada. Esperando confirmación del Arduino…';
    } catch (error) {
      elemento('calibracion').textContent = 'No se pudo enviar la orden. ' + error.message;
    } finally {
      escritor.releaseLock();
    }
  })();
  await fuente.writer;
  fuente.writer = null;
}

for (const origen of ['A','M']) {
  elemento('conectar-' + origen).addEventListener('click', () => conectar(origen));
  elemento('desconectar-' + origen).addEventListener('click', () => desconectar(origen));
  botones(origen, false);
}
elemento('seco').addEventListener('click', () => calibrar('s'));
elemento('mojado').addEventListener('click', () => calibrar('m'));
for (const id of ['limite-agua','limite-angulo','limite-temperatura','activar-temperatura']) {
  elemento(id).addEventListener('input', actualizar);
}
elemento('sonido').addEventListener('click', async () => {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    sonidoActivo = !sonidoActivo;
    elemento('sonido').setAttribute('aria-pressed', String(sonidoActivo));
    elemento('sonido').textContent = sonidoActivo ? 'Silenciar alertas' : 'Activar sonido';
    if (sonidoActivo) emitirSonido();
  } catch {
    registrar('El navegador no pudo activar el sonido.');
  }
});
if (!('serial' in navigator)) {
  elemento('soporte').textContent = 'Este navegador no ofrece acceso serie. Abre el enlace en una ventana normal de Chrome o Edge de escritorio.';
}
setInterval(actualizar, 1000);
actualizar();
