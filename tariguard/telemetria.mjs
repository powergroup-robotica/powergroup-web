// El protocolo distingue el USB del Arduino (A) y la radio de micro:bit (M).
function numero(campo, minimo, maximo, opcional = false) {
  if (opcional && campo === '?') return null;
  if (!/^-?\d+(\.\d+)?$/.test(campo)) throw new Error('Número inválido');
  const valor = Number(campo);
  if (!Number.isFinite(valor) || valor < minimo || valor > maximo) {
    throw new Error('Valor fuera de rango');
  }
  return valor;
}

export function leerPaquete(linea, origen) {
  const partes = linea.trim().split('|');
  if (partes[0] !== 'TG1' || partes[1] !== origen) return null;
  try {
    if (origen === 'A' && partes.length === 7) {
      return {
        aire: numero(partes[2], -40, 80, true),
        humedad: numero(partes[3], 0, 100, true),
        sustrato: numero(partes[4], -55, 125, true),
        ph: numero(partes[5], 0, 14, true),
        agua: numero(partes[6], 0, 100, true)
      };
    }
    if (origen === 'M' && partes.length === 5) {
      const eventos = numero(partes[3], 0, 4294967295);
      const bruto = numero(partes[4], 0, 1023);
      if (!Number.isInteger(eventos) || !Number.isInteger(bruto)) return null;
      return {angulo: numero(partes[2], 0, 180), eventos, bruto};
    }
  } catch {
    return null;
  }
  return null;
}

export function obtenerAlertas(arduino, microbit, limites) {
  const avisos = [];
  if (arduino?.agua !== null && arduino?.agua >= limites.agua) {
    avisos.push({id:'agua', texto:'Presencia elevada de agua. Revisar el nido de prueba.'});
  }
  if (microbit?.angulo >= limites.angulo) {
    avisos.push({id:'angulo', texto:'Posible invasión · origen indeterminado. Se detectó inclinación.'});
  }
  if (limites.temperatura && arduino?.sustrato !== null &&
      arduino?.sustrato > limites.maxima) {
    avisos.push({id:'calor', texto:'Temperatura del sustrato por encima del límite configurado.'});
  }
  return avisos;
}

// El Arduino ya imprime las lecturas recibidas por el cable P0 -> D10.
// Permite aprovechar ese recorrido cuando el USB de la receptora no entrega datos.
export function leerMicrobitEnArduino(linea) {
  const partes = /^Angulo: (-?\d+(?:\.\d+)?) grados \| Eventos: (\d+) \| Hum sustrato \(0-1023\): (\d+)$/.exec(linea.trim());
  if (!partes) return null;
  return leerPaquete('TG1|M|' + partes.slice(1).join('|'), 'M');
}
