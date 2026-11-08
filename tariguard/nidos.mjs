// Referencias geográficas públicas para dos escenarios escolares.
// Las coordenadas representan lugares de referencia, con precisión aproximada.
export const nidos = [
  {
    id:'co-01',
    nombre:'Nido CO-01',
    zona:'Río Caquetá · La Pedrera',
    pais:'Colombia',
    latitud:-(1 + 19/60 + 43/3600),
    longitud:-(69 + 34/60 + 47/3600),
    referencia:'Referencia geográfica de La Pedrera, Amazonas, a orillas del río Caquetá.',
    fuentes:[
      {nombre:'IGAC · La Pedrera, p. 37',url:'https://www.igac.gov.co/sites/default/files/2024-11/SPB_Urbano_VF.pdf#page=37'},
      {nombre:'Colombia Travel · Río Caquetá',url:'https://colombia.travel/es/amazonas/la-pedrera'}
    ]
  },
  {
    id:'pe-01',
    nombre:'Nido PE-01',
    zona:'Musa Karusha · Lago Rimachi',
    pais:'Perú',
    latitud:-(4 + 25.7/60),
    longitud:-(76 + 40.1/60),
    referencia:'Referencia de la ribera oriental del lago Rimachi o Musa Karusha, en Loreto. Coordenadas aproximadas de un sitio geográfico documentado.',
    fuentes:[
      {nombre:'García-Dávila y Magalhães · Referencia geográfica, p. 673',url:'https://research.nhm.org/pdfs/25521/25521.pdf#page=11'},
      {nombre:'Ministerio de Cultura · Lago Musa Karusha',url:'https://www.gob.pe/institucion/cultura/noticias/698330-ministerio-de-cultura-declaro-patrimonio-cultural-a-los-conocimientos-saberes-practicas-y-oralidad-del-pueblo-kandozi'}
    ]
  }
];

export function elegirNido(id) {
  return nidos.find(nido => nido.id === id) || nidos[0];
}

export function coordenadas(nido) {
  return nido.latitud.toFixed(5) + ', ' + nido.longitud.toFixed(5);
}

export function enlaceMapa(nido) {
  return 'https://www.openstreetmap.org/?mlat=' + nido.latitud.toFixed(5) +
    '&mlon=' + nido.longitud.toFixed(5) + '#map=12/' +
    nido.latitud.toFixed(5) + '/' + nido.longitud.toFixed(5);
}

export function mapaIntegrado(nido) {
  const parametros = new URLSearchParams({
    bbox:[nido.longitud-.05,nido.latitud-.035,nido.longitud+.05,nido.latitud+.035]
      .map(n => n.toFixed(5)).join(','),
    layer:'mapnik',
    marker:coordenadas(nido).replace(' ','')
  });
  return 'https://www.openstreetmap.org/export/embed.html?' + parametros;
}
