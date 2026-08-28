/* ============================================================
 * Cobranza Or Barak — app
 *
 * Pega aquí la URL /exec de tu Apps Script. Es lo único
 * que hay que cambiar al reimplementar el backend.
 * ============================================================ */
var API = 'https://script.google.com/macros/s/AKfycbxOOSNUEaEQbDjratqEVT5RJUdvlZCGCzMqqLzT4xtO-AlCn-gSkH5vpvLeLpRYl-Z8/exec';

var TK = '', D = { conceptos: [], saldo: { mxn:0, usd:0, cobros:0 }, pendientes: [] };
var sel = null, hits = [], opMail = '', forzando = false, reemplazando = false;
var cola = [], enviando = false, timerBusca = null;
var entregas = [], entActual = null, ultimoCobro = null;
var impresora = null;

/* ============ LLAMADAS A LA API ============ */

function api(fn, params) {
  var url = API + '?fn=' + encodeURIComponent(fn) + '&t=' + encodeURIComponent(TK);
  for (var k in (params || {})) {
    if (params[k] !== undefined && params[k] !== null) {
      url += '&' + k + '=' + encodeURIComponent(params[k]);
    }
  }
  return fetch(url, { method: 'GET', redirect: 'follow' })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      // Si Google devuelve una pantalla de login o de error, llega HTML.
      // Sin esto el mensaje sería "Unexpected token '<'", que no dice nada.
      if (t.charAt(0) === '<') {
        if (t.indexOf('accounts.google.com') >= 0 || t.indexOf('ServiceLogin') >= 0) {
          throw new Error('El servidor pide iniciar sesión con Google.\n\n' +
            'La app está publicada como "Cualquier usuario CON CUENTA DE GOOGLE". ' +
            'Hay que cambiarla a "Cualquier usuario".');
        }
        throw new Error('El servidor respondió con una página, no con datos. ' +
          'Revisa que la URL de la API sea la correcta y termine en /exec.');
      }
      var j;
      try { j = JSON.parse(t); }
      catch (e) { throw new Error('Respuesta inesperada del servidor.'); }
      if (!j.ok) throw new Error(j.error || 'Error del servidor');
      return j.data;
    });
}

/* ============ ARRANQUE ============ */

window.addEventListener('load', function () {
  var url = new URL(location.href);
  var tParam = url.searchParams.get('t');
  if (tParam) {
    localStorage.setItem('token', tParam);
    history.replaceState({}, '', url.pathname);   // limpia el token de la barra
  }
  TK = localStorage.getItem('token') || '';
  cola = JSON.parse(localStorage.getItem('cola') || '[]');

  if (!TK) { mostrar('sinToken'); return; }

  var ses = localStorage.getItem('sesion');
  if (ses) {
    api('entrarConSesion', { ses: ses })
      .then(function (r) { entrarOk(r); })
      .catch(function () { localStorage.removeItem('sesion'); pedirPin(); });
  } else {
    pedirPin();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  window.addEventListener('online', function () { pintarBarras(); sincronizarCola(); });
  window.addEventListener('offline', pintarBarras);
});

function mostrar(id) {
  ['cargando', 'pantPin', 'sinToken', 'app'].forEach(function (x) {
    document.getElementById(x).classList.toggle('oculto', x !== id);
  });
  if (id === 'cargando') document.getElementById('cargando').classList.remove('oculto');
}

function usarToken() {
  var t = document.getElementById('tokenManual').value.trim();
  var err = document.getElementById('errToken');
  err.innerHTML = '';
  if (t.length < 20) {
    err.innerHTML = '<div class="error">Esa clave se ve incompleta.</div>';
    return;
  }
  TK = t;
  api('ping', {})
    .then(function () { localStorage.setItem('token', t); pedirPin(); })
    .catch(function (e) {
      err.innerHTML = '<div class="error">' + e.message + '</div>';
      TK = '';
    });
}

function pedirPin() {
  var n = localStorage.getItem('nombre');
  document.getElementById('pinNombre').textContent = n || '';
  mostrar('pantPin');
  document.getElementById('pin').focus();
}

document.getElementById('btnPin').onclick = function () {
  var pin = document.getElementById('pin').value.trim();
  var err = document.getElementById('errPin'); err.innerHTML = '';
  if (pin.length !== 4) { err.innerHTML = '<div class="error">Son 4 dígitos.</div>'; return; }
  var b = this; b.textContent = 'Entrando…'; b.disabled = true;

  api('entrar', { pin: pin })
    .then(function (r) {
      if (r.sesion) localStorage.setItem('sesion', r.sesion);
      entrarOk(r);
    })
    .catch(function (e) {
      err.innerHTML = '<div class="error">' + e.message + '</div>';
      b.textContent = 'Entrar'; b.disabled = false;
      document.getElementById('pin').value = '';
    });
};

document.getElementById('pin').addEventListener('keyup', function (ev) {
  if (this.value.length === 4 || ev.key === 'Enter') document.getElementById('btnPin').click();
});

function entrarOk(r) {
  localStorage.setItem('nombre', r.nombre);
  localStorage.setItem('rol', r.rol);
  mostrar('cargando');
  api('datosApp', {}).then(iniciar).catch(function (e) {
    document.getElementById('cargando').innerHTML =
      '<p style="color:#c5221f">' + e.message + '</p>' +
      '<button class="btn azul" onclick="location.reload()">Reintentar</button>';
  });
}

function iniciar(d) {
  D = d;
  mostrar('app');
  document.getElementById('quien').textContent = d.yo.nombre;
  pintarSaldo(); pintarPendientes(); pintarBarras(); sincronizarCola();

  if (d.yo.rol === 'Encargado' || d.yo.rol === 'Admin') {
    document.getElementById('tRecibir').classList.remove('oculto');
    cargarEntregas();
  }
}

function salir() {
  if (!confirm('Vas a cerrar la sesión. Tendrás que meter tu PIN otra vez.')) return;
  localStorage.removeItem('sesion');
  location.reload();
}

/* ============ SALDO Y PENDIENTES ============ */

function pintarSaldo() {
  document.getElementById('saldo').textContent = '$' + D.saldo.mxn.toLocaleString('es-MX');
  var t = D.saldo.cobros + (D.saldo.cobros === 1 ? ' cobro' : ' cobros') + ' sin entregar';
  if (D.saldo.usd) t += ' · US$' + D.saldo.usd.toLocaleString('en-US');
  document.getElementById('subSaldo').textContent = t;
}

function pintarPendientes() {
  var c = document.getElementById('listaPend');
  if (!D.pendientes.length) {
    c.innerHTML = '<p class="nota">No traes efectivo pendiente.</p>';
    document.getElementById('btnEntregar').disabled = true;
    return;
  }
  document.getElementById('btnEntregar').disabled = false;
  var h = '';
  D.pendientes.forEach(function (p) {
    h += '<div class="item"><span class="m">$' + (p.mxn || p.usd).toLocaleString('es-MX') + '</span>' +
         p.nombre + '<small>' + p.fecha + ' · ' + (p.concepto || 'sin concepto') + ' · ' + p.folio + '</small></div>';
  });
  h += '<div class="item" style="border-top:2px solid #1a3a6b;padding-top:12px"><span class="m">$' +
       D.saldo.mxn.toLocaleString('es-MX') + '</span><b>Total a entregar</b></div>';
  c.innerHTML = h;
}

function pintarBarras() {
  document.getElementById('barraCola').style.display = cola.length ? 'block' : 'none';
  document.getElementById('nPend').textContent = cola.length;
  document.getElementById('barraOffline').style.display = navigator.onLine ? 'none' : 'block';
}

/* ============ BUSCADOR ============ */

document.getElementById('busca').addEventListener('input', function () {
  var q = this.value.trim();
  var caja = document.getElementById('resultados');
  clearTimeout(timerBusca);
  if (q.length < 2) { caja.innerHTML = ''; return; }
  caja.innerHTML = '<div class="res" style="color:#888">Buscando…</div>';
  timerBusca = setTimeout(function () {
    api('buscarDonadores', { q: q })
      .then(pintarHits)
      .catch(function (e) { caja.innerHTML = '<div class="res" style="color:#c5221f">' + e.message + '</div>'; });
  }, 300);
});

function pintarHits(r) {
  hits = r;
  var caja = document.getElementById('resultados');
  caja.innerHTML = r.length
    ? r.map(function (c, i) {
        var faltan = [];
        if (!c.t) faltan.push('sin teléfono');
        if (!c.e) faltan.push('sin correo');
        return '<div class="res" onclick="elegir(' + i + ')">' + c.n +
               (faltan.length ? '<small>' + faltan.join(' · ') + '</small>' : '') + '</div>';
      }).join('')
    : '<div class="res" style="color:#888">Sin resultados. Revisa cómo está escrito.</div>';
}

function elegir(i) {
  sel = hits[i];
  document.getElementById('busca').value = sel.n;
  document.getElementById('resultados').innerHTML = '';
  document.getElementById('formCobro').classList.remove('oculto');

  var inp = document.getElementById('correo');
  reemplazando = false;
  if (sel.e) {
    inp.value = sel.e; inp.setAttribute('readonly', 'readonly');
    marcarOp('Ya tenía');
    setAviso('avisoCorreo', 'Ya tenemos su correo. Confírmaselo.', '#666');
    document.getElementById('lnkCambiar').classList.remove('oculto');
  } else {
    inp.value = ''; inp.removeAttribute('readonly');
    marcarOp('');
    setAviso('avisoCorreo', 'Pregúntale su correo para mandarle el comprobante.', '#666');
    document.getElementById('lnkCambiar').classList.add('oculto');
  }
  document.getElementById('bloqueTel').classList.toggle('oculto', !!sel.t);
  cargarConceptos();
  document.getElementById('monto').focus();
}

function setAviso(id, txt, color) {
  var e = document.getElementById(id);
  e.innerHTML = txt; e.style.color = color;
}

/* ============ CONCEPTOS ============ */

function cargarConceptos() {
  var s = document.getElementById('concepto');
  var propios = sel.conceptos || [];
  forzando = false;

  if (propios.length) {
    s.innerHTML = '<option value="">— elige el concepto —</option>' +
      propios.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    setAviso('avisoConcepto', propios.length === 1
      ? 'Es su único donativo abierto.'
      : 'Tiene ' + propios.length + ' donativos abiertos. Pregúntale por cuál está pagando.', '#666');
    document.getElementById('bloqueOtro').classList.remove('oculto');
    if (propios.length === 1) s.selectedIndex = 1;
  } else {
    s.innerHTML = '<option value="">— elige el concepto —</option>' +
      D.conceptos.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    setAviso('avisoConcepto', '⚠️ No tiene donativos abiertos. Elige de la lista general.', '#e37400');
    document.getElementById('bloqueOtro').classList.add('oculto');
    forzando = true;
  }
}

function verOtros() {
  if (!confirm('Los conceptos de abajo NO están entre sus donativos comprometidos.\n\n' +
               'Si eliges uno, el cobro va a quedar marcado como ERROR en el sistema.\n\n¿Seguir?')) return;
  var s = document.getElementById('concepto');
  s.innerHTML = '<option value="">— elige el concepto —</option>' +
    D.conceptos.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
  setAviso('avisoConcepto', '⚠️ Lista general — quedará marcado como ERROR.', '#d93025');
  document.getElementById('bloqueOtro').classList.add('oculto');
  forzando = true;
}

/* ============ CORREO ============ */

Array.prototype.forEach.call(document.querySelectorAll('.op'), function (el) {
  el.onclick = function () {
    marcarOp(el.getAttribute('data-op'));
    var inp = document.getElementById('correo');
    if (opMail === 'No quiso') { inp.value = ''; inp.setAttribute('readonly', 'readonly'); reemplazando = false; }
    else if (!sel || !sel.e || reemplazando) { inp.removeAttribute('readonly'); inp.focus(); }
  };
});

function marcarOp(v) {
  opMail = v;
  Array.prototype.forEach.call(document.querySelectorAll('.op'), function (el) {
    el.classList.toggle('sel', el.getAttribute('data-op') === v);
  });
}

function cambiarCorreo() {
  if (!confirm('Vas a reemplazar el correo de ' + sel.n + '.\n\nActual: ' + sel.e +
               '\n\n¿El donador te está dando uno diferente?')) return;
  reemplazando = true;
  var inp = document.getElementById('correo');
  inp.removeAttribute('readonly'); inp.value = ''; inp.focus();
  marcarOp('Capturado');
  document.getElementById('lnkCambiar').classList.add('oculto');
  setAviso('avisoCorreo', 'Reemplazando <b>' + sel.e + '</b>. El comprobante va al nuevo.', '#e37400');
}

/* ============ GUARDAR COBRO ============ */

document.getElementById('btnGuardar').onclick = function () {
  if (enviando) return;
  var err = document.getElementById('errCobro'); err.innerHTML = '';
  var monto = parseFloat(document.getElementById('monto').value);

  if (!sel) { err.innerHTML = '<div class="error">Elige al donador.</div>'; return; }
  if (!monto || monto <= 0) { err.innerHTML = '<div class="error">Pon el monto.</div>'; return; }
  var concepto = document.getElementById('concepto').value;
  if (!concepto) { err.innerHTML = '<div class="error">Falta el concepto.</div>'; return; }
  if (!opMail) { err.innerHTML = '<div class="error">Falta el correo: escríbelo, o marca "Ya está" o "No quiso".</div>'; return; }

  var correo = document.getElementById('correo').value.trim();
  if (opMail === 'Capturado' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
    err.innerHTML = '<div class="error">Ese correo no se ve bien. Revísalo.</div>'; return;
  }

  var moneda = document.getElementById('moneda').value;
  var d = {
    idLocal: 'L' + Date.now() + Math.floor(Math.random() * 1000),
    nombre: sel.n,
    mxn: moneda === 'MXN' ? monto : 0,
    usd: moneda === 'USD' ? monto : 0,
    concepto: concepto,
    forzarConcepto: forzando,
    emailNuevo: opMail === 'Capturado' ? correo : '',
    reemplazarEmail: reemplazando,
    telNuevo: document.getElementById('telefono').value.trim(),
    capturaMail: opMail
  };

  enviando = true;
  this.textContent = 'Guardando…'; this.disabled = true;

  api('registrarCobro', { d: JSON.stringify(d) })
    .then(function (r) { exito(r, d); })
    .catch(function (e) { guardarLocal(d, e); });
};

function exito(r, d) {
  restaurarBoton();
  D.saldo = r.saldo;
  D.pendientes.unshift({ folio:r.folio, fecha:'hoy', nombre:d.nombre, mxn:d.mxn, usd:d.usd, concepto:d.concepto });
  pintarSaldo(); pintarPendientes();
  if (d.emailNuevo) sel.e = d.emailNuevo;
  if (d.telNuevo && !sel.t) sel.t = true;

  ultimoCobro = { nombre:d.nombre, mxn:d.mxn, usd:d.usd, concepto:d.concepto,
                  folio:r.folio, cobrador:D.yo.nombre, urlQR:r.urlQR || '' };

  document.getElementById('okNombre').textContent = d.nombre;
  document.getElementById('okMonto').textContent = '$' + (d.mxn || d.usd).toLocaleString('es-MX');
  document.getElementById('okFolio').textContent = r.folio;
  document.getElementById('errImpr').innerHTML = '';

  var m = document.getElementById('okCorreo');
  if (r.correoEnviado && r.correoEnviado.indexOf('ERROR') !== 0) {
    m.innerHTML = '✉️ Comprobante enviado a <b>' + r.correoEnviado + '</b>';
  } else if (opMail === 'No quiso') {
    m.textContent = 'No dejó correo.';
  } else {
    m.textContent = 'Sin correo registrado.';
  }

  var wa = document.getElementById('okWa');
  if (r.waUrl) { wa.href = r.waUrl; wa.classList.remove('oculto'); }
  else { wa.classList.add('oculto'); }

  document.getElementById('btnImprimir').classList.toggle('oculto', !('bluetooth' in navigator));
  document.getElementById('exito').style.display = 'block';
}

function cerrarExito() { document.getElementById('exito').style.display = 'none'; limpiar(); }

function limpiar() {
  sel = null; marcarOp(''); reemplazando = false; forzando = false;
  ['busca','monto','correo','telefono'].forEach(function (x) { document.getElementById(x).value = ''; });
  document.getElementById('concepto').selectedIndex = 0;
  document.getElementById('resultados').innerHTML = '';
  document.getElementById('errCobro').innerHTML = '';
  document.getElementById('lnkCambiar').classList.add('oculto');
  document.getElementById('formCobro').classList.add('oculto');
  restaurarBoton();
}

function restaurarBoton() {
  enviando = false;
  var b = document.getElementById('btnGuardar');
  b.textContent = 'Registrar cobro'; b.disabled = false;
}

/* ============ COLA SIN CONEXIÓN ============ */

function guardarLocal(d, e) {
  restaurarBoton();
  cola.push(d);
  localStorage.setItem('cola', JSON.stringify(cola));
  pintarBarras();
  document.getElementById('errCobro').innerHTML =
    '<div class="error">No se pudo enviar (' + (e.message || 'sin conexión') + ').<br>' +
    'El cobro quedó guardado en el celular y se manda solo cuando vuelva la señal.<br>' +
    '<b>Anota el monto en papel por si acaso.</b></div>';
}

function sincronizarCola() {
  pintarBarras();
  if (!cola.length || !navigator.onLine) return;
  api('registrarCobro', { d: JSON.stringify(cola[0]) })
    .then(function () {
      cola.shift();
      localStorage.setItem('cola', JSON.stringify(cola));
      pintarBarras();
      if (cola.length) sincronizarCola();
      else api('miSaldo', {}).then(function (s) { D.saldo = s; pintarSaldo(); });
    })
    .catch(function () { setTimeout(sincronizarCola, 30000); });
}

/* ============ ENTREGA ============ */

document.getElementById('btnEntregar').onclick = function () {
  if (!confirm('Vas a declarar la entrega de $' + D.saldo.mxn.toLocaleString('es-MX') +
               ' en ' + D.saldo.cobros + ' cobros.\n\n¿Traes ese dinero contigo?')) return;
  var b = this; b.textContent = 'Declarando…'; b.disabled = true;
  api('declararEntrega', {})
    .then(function (r) {
      alert('Entrega ' + r.folio + ' declarada por $' + r.mxn.toLocaleString('es-MX') +
            '.\n\nEl encargado ya fue avisado.');
      D.saldo = { mxn:0, usd:0, cobros:0 }; D.pendientes = [];
      pintarSaldo(); pintarPendientes();
      b.textContent = 'Declarar entrega';
    })
    .catch(function (e) {
      document.getElementById('errEntrega').innerHTML = '<div class="error">' + e.message + '</div>';
      b.textContent = 'Declarar entrega'; b.disabled = false;
    });
};

/* ============ RECIBIR ============ */

function cargarEntregas() {
  api('entregasPorRecibir', {}).then(function (r) {
    entregas = r; pintarEntregas();
    var f = new URL(location.href).searchParams.get('e');
    if (f) for (var i = 0; i < entregas.length; i++) {
      if (entregas[i].folio === f) { ver('recibir'); abrirEnt(i); break; }
    }
  }).catch(function () {});
}

function pintarEntregas() {
  var c = document.getElementById('listaEnt');
  var t = document.getElementById('tRecibir');
  if (!entregas.length) {
    c.innerHTML = '<p class="nota">No hay entregas pendientes. 👌</p>';
    t.innerHTML = '<span class="ic">🧾</span>Recibir'; return;
  }
  t.innerHTML = '<span class="ic">🧾</span>Recibir (' + entregas.length + ')';
  c.innerHTML = entregas.map(function (e, i) {
    return '<div class="ent" onclick="abrirEnt(' + i + ')"><b>' + e.cobrador + '</b>' +
           '<small>' + e.fecha + ' · ' + e.cobros + ' cobros · ' + e.folio + '</small></div>';
  }).join('');
}

function abrirEnt(i) {
  entActual = entregas[i];
  document.getElementById('tituloContar').textContent = 'Entrega de ' + entActual.cobrador;
  document.getElementById('datosEnt').textContent =
    entActual.folio + ' · ' + entActual.fecha + ' · ' + entActual.cobros + ' cobros' +
    (entActual.nota ? ' · ' + entActual.nota : '');
  document.getElementById('bloqueUSD').classList.toggle('oculto', !entActual.tieneUSD);
  ['contMXN','contUSD','notasEnt'].forEach(function (x) { document.getElementById(x).value = ''; });
  document.getElementById('errContar').innerHTML = '';
  document.getElementById('recLista').classList.add('oculto');
  document.getElementById('recResultado').classList.add('oculto');
  document.getElementById('recContar').classList.remove('oculto');
}

document.getElementById('btnConfirmar').onclick = function () {
  var err = document.getElementById('errContar'); err.innerHTML = '';
  var mxn = parseFloat(document.getElementById('contMXN').value);
  if (isNaN(mxn) || mxn < 0) { err.innerHTML = '<div class="error">Escribe cuánto contaste.</div>'; return; }
  var usd = parseFloat(document.getElementById('contUSD').value) || 0;
  if (!confirm('Vas a registrar que contaste $' + mxn.toLocaleString('es-MX') + ' MXN.\n\n' +
               'Esto no se puede cambiar después. ¿Ya lo contaste bien?')) return;

  var b = this; b.textContent = 'Registrando…'; b.disabled = true;
  api('autorizarEntrega', { folio: entActual.folio, mxn: mxn, usd: usd,
                            notas: document.getElementById('notasEnt').value.trim() })
    .then(function (r) { resultadoEnt(r); b.textContent = 'Confirmar mi conteo'; b.disabled = false; })
    .catch(function (e) {
      err.innerHTML = '<div class="error">' + e.message + '</div>';
      b.textContent = 'Confirmar mi conteo'; b.disabled = false;
    });
};

function resultadoEnt(r) {
  var cuadra = r.difMXN === 0 && r.difUSD === 0;
  document.getElementById('tituloRes').textContent = cuadra ? '✅ Cuadró' : '⚠️ Hay diferencia';
  document.getElementById('rDec').textContent = '$' + r.declaradoMXN.toLocaleString('es-MX');
  document.getElementById('rCont').textContent = '$' + r.contadoMXN.toLocaleString('es-MX');
  var d = document.getElementById('rDif');
  if (cuadra) {
    d.textContent = 'Sin diferencia'; d.style.color = '#188038';
    document.getElementById('rNota').innerHTML = '';
  } else {
    d.textContent = (r.difMXN > 0 ? '+' : '') + '$' + r.difMXN.toLocaleString('es-MX');
    d.style.color = '#d93025';
    document.getElementById('rNota').innerHTML =
      '<div class="amarillo">Quedaron registradas las dos cifras. Se avisó por correo. ' +
      'Habla con ' + r.cobrador + ' para aclararlo.</div>';
  }
  entregas = entregas.filter(function (e) { return e.folio !== r.folio; });
  pintarEntregas();
  document.getElementById('recContar').classList.add('oculto');
  document.getElementById('recResultado').classList.remove('oculto');
}

function volverRec() {
  document.getElementById('recContar').classList.add('oculto');
  document.getElementById('recResultado').classList.add('oculto');
  document.getElementById('recLista').classList.remove('oculto');
}

/* ============ NAVEGACIÓN ============ */

function ver(v) {
  ['cobrar', 'entregar', 'recibir'].forEach(function (x) {
    var cap = x.charAt(0).toUpperCase() + x.slice(1);
    var vista = document.getElementById('v' + cap), tab = document.getElementById('t' + cap);
    if (vista) vista.classList.toggle('oculto', v !== x);
    if (tab) tab.classList.toggle('act', v === x);
  });
  if (v === 'recibir') cargarEntregas();
}

/* ============================================================
 * IMPRESIÓN TÉRMICA (ESC/POS por Web Bluetooth)
 *
 * Solo Chrome en Android. Requiere HTTPS y contexto de nivel
 * superior — por eso hizo falta salir de Apps Script.
 * ============================================================ */

document.getElementById('btnImprimir').onclick = function () {
  var err = document.getElementById('errImpr'); err.innerHTML = '';
  if (!ultimoCobro) return;
  var b = this; b.textContent = 'Imprimiendo…'; b.disabled = true;

  imprimir(ultimoCobro)
    .then(function () { b.textContent = '✅ Impreso'; setTimeout(function () {
        b.textContent = '🖨️ Imprimir otra copia'; b.disabled = false; }, 1500); })
    .catch(function (e) {
      err.innerHTML = '<div class="error">' + e.message + '</div>';
      b.textContent = '🖨️ Imprimir recibo'; b.disabled = false;
    });
};

function imprimir(c) {
  return conectarImpresora().then(function (car) {
    return bytesLogo().then(function (logo) {
      // El logo va aparte: centrado, y luego el texto
      var pre = new Uint8Array([27, 64, 27, 97, 1]);   // reset + centrar
      return enviarBytes(car, pre)
        .then(function () { return enviarBytes(car, logo); })
        .then(function () { return enviarBytes(car, ticketESCPOS(c)); });
    }).catch(function () {
      // Si el logo falla por lo que sea, el recibo sale igual
      return enviarBytes(car, ticketESCPOS(c));
    });
  });
}

function conectarImpresora() {
  if (impresora && impresora.gatt.connected) return caracteristicaDe(impresora);
  if (!('bluetooth' in navigator)) {
    return Promise.reject(new Error('Este navegador no soporta impresión bluetooth. Usa Chrome en Android.'));
  }
  return navigator.bluetooth.requestDevice({
    filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb']
  }).then(function (dev) { impresora = dev; return caracteristicaDe(dev); });
}

function caracteristicaDe(dev) {
  return dev.gatt.connect()
    .then(function (srv) { return srv.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb'); })
    .then(function (s) { return s.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb'); });
}

/** Envía en trozos de 100 bytes: los módulos BLE no aguantan más. */
function enviarBytes(car, bytes) {
  var i = 0;
  function siguiente() {
    if (i >= bytes.length) return Promise.resolve();
    var trozo = bytes.slice(i, i + 100);
    i += 100;
    return car.writeValue(trozo).then(function () {
      return new Promise(function (r) { setTimeout(r, 30); });
    }).then(siguiente);
  }
  return siguiente();
}

function ticketESCPOS(c) {
  var monto = c.mxn ? '$' + c.mxn.toLocaleString('es-MX') + ' MXN'
                    : '$' + c.usd.toLocaleString('en-US') + ' USD';
  var f = new Date();
  var fecha = ('0' + f.getDate()).slice(-2) + '/' + ('0' + (f.getMonth() + 1)).slice(-2) +
              '/' + f.getFullYear() + '  ' + ('0' + f.getHours()).slice(-2) + ':' +
              ('0' + f.getMinutes()).slice(-2);

  var out = [];
  var ESC = 27, GS = 29;
  out.push(ESC, 116, 16);         // codepage 1252 para acentos
  out.push(ESC, 97, 1);           // centrado
  txt(out, 'RECIBO DE DONATIVO\n');
  txt(out, '--------------------------------\n');
  out.push(ESC, 97, 0);           // izquierda
  txt(out, 'Donador:\n' + c.nombre + '\n\n');
  txt(out, 'Concepto: ' + (c.concepto || '-') + '\n');
  txt(out, 'Fecha:    ' + fecha + '\n');
  txt(out, 'Folio:    ' + c.folio + '\n');
  txt(out, 'Recibio:  ' + c.cobrador + '\n');
  txt(out, '--------------------------------\n');
  out.push(ESC, 97, 1);
  out.push(ESC, 33, 32);          // doble ancho
  txt(out, monto + '\n');
  out.push(ESC, 33, 0);

  if (c.urlQR) {
    txt(out, '\nVerifique este recibo:\n');
    qrESCPOS(out, c.urlQR);
    txt(out, 'Escanee el codigo\n');
  }

  txt(out, '\nTizku lemitzvot\n');
  txt(out, 'Este comprobante no es un CFDI\n');
  txt(out, 'Or Barak - 55 3989 6174\n');
  txt(out, '\n\n\n');
  out.push(GS, 86, 66, 0);        // corte
  return new Uint8Array(out);
}

/**
 * QR nativo de la impresora (comandos GS ( k).
 * Sale mucho mas nitido que mandarlo como imagen, y pesa nada.
 */
function qrESCPOS(out, texto) {
  var GS = 29;
  var datos = [];
  txt(datos, texto);

  // tamano del modulo: 6 de 1-16
  out.push(GS, 40, 107, 3, 0, 49, 67, 6);
  // correccion de error nivel H (el mas alto): aguanta papel arrugado
  out.push(GS, 40, 107, 3, 0, 49, 69, 51);
  // guardar los datos
  var len = datos.length + 3;
  out.push(GS, 40, 107, len & 0xFF, (len >> 8) & 0xFF, 49, 80, 48);
  for (var i = 0; i < datos.length; i++) out.push(datos[i]);
  // imprimir
  out.push(GS, 40, 107, 3, 0, 49, 81, 48);
  txt(out, '\n');
}

/** Texto a bytes en Windows-1252, para que salgan los acentos. */
function txt(arr, s) {
  var mapa = { 'á':225,'é':233,'í':237,'ó':243,'ú':250,'ñ':241,'Á':193,'É':201,
               'Í':205,'Ó':211,'Ú':218,'Ñ':209,'ü':252,'¿':191,'¡':161,'°':176 };
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    var code = mapa[ch] !== undefined ? mapa[ch] : s.charCodeAt(i);
    arr.push(code > 255 ? 63 : code);
  }
}
