/* ============================================================
 * logo.js — logo de Or Barak para la impresora térmica
 *
 * Mapa de bits de 320 x 120 puntos, 1 bit por punto, comprimido
 * con deflate y en base64. Se descomprime en el navegador con
 * DecompressionStream, que ya trae Chrome.
 *
 * Para cambiarlo hay que regenerarlo desde la imagen original.
 * ============================================================ */

var LOGO = {
  bytesPorLinea: 40,
  alto: 120,
  b64:
  'eNrt171u2zAQAGAKGtSNQ9eifJPykToXSEIBGTLmDeoXKVoFBurRj2ABGTyKQQaxCMPrHSk5iknRStCtPmSQ4y/H/6' +
  'PC2DnOcY7/OhQMUfuPAG0JjnGw9NwU+GulS5dwtsLvOQA96wJadFXKOXQtp88ApgDNlEk6QKcF5qTcBRgm551B11Lu' +
  'AvspTbJ/cIOOBwfkhJ11NuHGuTm4DTpsVwfnmHCjk1nHnR8Hq47yrUO7Lw6C4/XEsRInROBiKM1YBTWfuGk+VqDj6K' +
  'Shv6mRVINTrxybuGJwN29yV0w+L3PK4mLNOgEb776iUxknYe1dXysrM04FhxOhrLjJuf3oHJfjetSRwzEeXKVG12Rd' +
  'M++KqWvzzo5OL3G1ckZmnMTDhPMHTLkLkXHCO5/vqso6HfonrbrOuFs8U2EcRq5Hdxc7Tt+pElql5T7r6ExW3vUZV3' +
  'nH0bUSsq4e3ORcZpw+4crBmanb4EPkmthtY1eMTi5xR3Voi5Nw5Jhfj6O6Fhz3ezPrHDnxyqk2rqdbG+ej2vVup+N2' +
  'aUyRa+J8SVcvc5guatfX4bc4WpOpc8GVwVExT7qK+mcpH6P6wg73IPv0ys3e58WvBQ5/aOynnaCdvcBxPKHtaVdzqi' +
  'ALxuGdGqp4PeMkXeD84GZD0sV8yn3wbo8VM+VUzWTrhFbCHVwLscMxKe2EUbQPvPt42biE27TqAQYnyLGLIuU6Tc7C' +
  '1NmIFdCZ4Fa4n7l3cJ1wfWePXAH3JpVv4rColuj2WacHx067khz3xzvv6IVCwKpNu8fR0XUI+IKQdvIRVhOHJb9J53' +
  'uC1bMfL/OuSey7F7cz44G7S2wDclfo/gTni/N9xj0EJ8h1LunM4GhRue+gPekq70zaqdA/6180KTRL7T+6qVZPwQ0T' +
  'mHRWQbd76neOjROYOrZY+1Xf7Z57+MnGiUmWgFsr993qsu++sGFibMqJ6odYb75/u//9mQ0D0Uv+9aH1XeJkuntRlM' +
  'uaPcc/ir8jOz93'
};

/** Devuelve los bytes ESC/POS listos para imprimir el logo centrado. */
function bytesLogo() {
  var bin = atob(LOGO.b64);
  var comp = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) comp[i] = bin.charCodeAt(i);

  return new Response(
    new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate'))
  ).arrayBuffer().then(function (buf) {
    var img = new Uint8Array(buf);
    // GS v 0 — imprimir mapa de bits raster
    var cab = [29, 118, 48, 0,
               LOGO.bytesPorLinea & 0xFF, (LOGO.bytesPorLinea >> 8) & 0xFF,
               LOGO.alto & 0xFF, (LOGO.alto >> 8) & 0xFF];
    var out = new Uint8Array(cab.length + img.length);
    out.set(cab, 0);
    out.set(img, cab.length);
    return out;
  });
}
