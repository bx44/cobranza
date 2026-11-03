/* ============================================================
 * ventas.js — Or Barak
 *
 * Agrega dos pestañas a la app de cobranza: "Vender" y
 * "Mis ventas". No toca app.js: se cuelga de sus funciones.
 *
 * Va DESPUÉS de app.js en index.html:
 *     <script src="app.js"></script>
 *     <script src="ventas.js"></script>
 *
 * Depende del backend 100_Ventas.gs / 101_Comisiones.gs y de
 * los casos nuevos de 40_API.gs.
 * ============================================================ */

(function () {
  'use strict';

  /* Tienen que decir EXACTAMENTE lo mismo que VT en 100_Ventas.gs,
     o el backend va a rechazar lo que mande la app. */
  var FORMAS = ['Efectivo (pasa cobrador)', 'Transferencia', 'Cheque',
                'Tarjeta / liga de pago', 'Depósito en banco', 'Lo entrega él'];
  var FORMA_PRESENCIAL = 'Efectivo (pasa cobrador)';
  var FISCALES = ['No', 'Sí — pide recibo fiscal'];
  var COBRAN = ['Cualquiera (lo coordina Sara)', 'El vendedor lo cobra',
                'Sólo con Jonathan'];

  var V = {
    contacto: null,     // { nombre, tel, email } si el teléfono ya existe
    esNuevo: false,
    completando: null,  // fila que se está completando desde Mis ventas
    ventas: null,
    timer: null
  };

  /* ---------- utilidades ---------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pesos(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');
  }

  function digitos(s) { return String(s || '').replace(/\D/g, ''); }

  function hoyISO(masDias) {
    var d = new Date();
    if (masDias) d.setDate(d.getDate() + masDias);
    return d.toISOString().slice(0, 10);
  }

  function opciones(lista, sel) {
    return lista.map(function (x) {
      return '<option value="' + esc(x) + '"' +
             (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>';
    }).join('');
  }

  function error(id, msg) {
    $(id).innerHTML = msg ? '<div class="error">' + esc(msg) + '</div>' : '';
  }

  /** Aviso propio. No se reusa el de app.js, que es de cobros. */
  function confirmacion(texto) {
    var c = $('vErr');
    c.innerHTML =
      '<div style="background:#e6f4ea;color:#137333;padding:14px;border-radius:10px;' +
      'margin-top:12px;font-size:15px"><b>Compromiso guardado</b><br>' +
      esc(texto) + '<br><span style="font-size:13px">Ya está en la cola de cobranza. ' +
      'Sara decide quién va por él.</span></div>';
    setTimeout(function () { if (c.innerHTML.indexOf('Compromiso guardado') >= 0) c.innerHTML = ''; }, 6000);
  }

  /* ---------- la interfaz, inyectada ---------- */

  var HTML_VENDER =
  '<div id="vVender" class="oculto">' +
    '<div class="card">' +
      '<h3>Nuevo compromiso</h3>' +

      '<label>Teléfono del donador</label>' +
      '<input id="vTel" type="tel" inputmode="tel" placeholder="55 1234 5678" autocomplete="off">' +
      '<div class="nota">Se empieza por el teléfono para no crear a alguien que ya existe.</div>' +
      '<div id="vQuien" style="margin-top:10px"></div>' +

      '<div id="vNombreNuevo" class="oculto">' +
        '<label>Nombre completo</label>' +
        '<input id="vNombre" placeholder="Sr. Nombre Apellido" autocomplete="off">' +
        '<div class="resultados" id="vParecidos"></div>' +
      '</div>' +

      '<div id="vDatos" class="oculto">' +
        '<label>Concepto</label>' +
        '<select id="vConcepto"></select>' +

        '<label>Monto por exhibición</label>' +
        '<input id="vMonto" type="number" inputmode="decimal" placeholder="0">' +

        '<label>Moneda</label>' +
        '<select id="vMoneda">' +
          '<option value="MXN">Pesos (MXN)</option>' +
          '<option value="USD">Dólares (USD)</option></select>' +

        '<label>¿En cuántos pagos?</label>' +
        '<input id="vMeses" type="number" inputmode="numeric" value="1" min="1">' +
        '<div class="nota" id="vTotal"></div>' +

        '<div style="margin:18px -16px 0;padding:16px 16px 0;border-top:3px solid #1f3864">' +
          '<h3 style="margin-top:0">Cómo se cobra</h3>' +
          '<div class="nota" style="margin-top:0">Sin esto el compromiso no entra a ' +
            'la cola de cobranza y nadie va a ir por el dinero.</div>' +

          '<label>Forma de cobro</label>' +
          '<select id="vForma"></select>' +

          '<label>¿Qué día se cobra la primera vez?</label>' +
          '<input id="vFecha" type="date">' +

          '<label id="vLblInstr">Dónde y con quién</label>' +
          '<input id="vInstr" placeholder="Ej. oficina Polanco, martes 10 a 14 h, preguntar por Lily" autocomplete="off">' +
          '<div class="nota" id="vNotaInstr"></div>' +

          '<label>¿Pide recibo fiscal?</label>' +
          '<select id="vFiscal"></select>' +

          '<label>¿Alguien en particular tiene que cobrarlo?</label>' +
          '<select id="vCobra"></select>' +
          '<div class="nota">Esto es una condición del donador, no una instrucción ' +
            'para cobranza. Sara decide quién va.</div>' +

          '<label>Nota (opcional)</label>' +
          '<input id="vNota" placeholder="Lo que haga falta saber" autocomplete="off">' +
        '</div>' +

        '<button class="btn azul" id="vGuardar" style="margin-top:18px">Guardar compromiso</button>' +
        '<button class="btn gris" id="vCancelar">Cancelar</button>' +
      '</div>' +
      '<div id="vErr"></div>' +
    '</div>' +
  '</div>';

  var HTML_MISVENTAS =
  '<div id="vMisVentas" class="oculto">' +
    '<div class="card">' +
      '<h3>Mis ventas</h3>' +
      '<label>Campaña</label>' +
      '<select id="mvCampana"><option value="">Todas</option></select>' +
      '<div id="mvTotales" style="margin-top:14px"></div>' +
      '<div id="mvComision"></div>' +
    '</div>' +
    '<div class="card"><div id="mvLista">Cargando…</div></div>' +
    '<div id="mvErr"></div>' +
  '</div>';

  var HTML_TABS =
    '<div class="tab" id="tVender" onclick="ver(\'vender\')">' +
      '<span class="ic">🤝</span>Vender</div>' +
    '<div class="tab" id="tMisVentas" onclick="ver(\'misventas\')">' +
      '<span class="ic">📊</span>Mis ventas</div>';

  function inyectar() {
    if ($('vVender')) return;                 // ya está
    var app = $('app'), tabs = app && app.querySelector('.tabs');
    if (!app || !tabs) return;
    tabs.insertAdjacentHTML('beforeend', HTML_TABS);
    tabs.insertAdjacentHTML('beforebegin', HTML_VENDER + HTML_MISVENTAS);

    $('vForma').innerHTML  = '<option value="">— elige —</option>' + opciones(FORMAS);
    $('vFiscal').innerHTML = opciones(FISCALES);
    $('vCobra').innerHTML  = opciones(COBRAN);
    $('vFecha').value = hoyISO(7);

    $('vTel').addEventListener('input', alTeclearTel);
    $('vNombre').addEventListener('input', alTeclearNombre);
    $('vForma').addEventListener('change', pintarInstrucciones);
    $('vMonto').addEventListener('input', pintarTotal);
    $('vMeses').addEventListener('input', pintarTotal);
    $('vGuardar').addEventListener('click', guardar);
    $('vCancelar').addEventListener('click', limpiarVenta);
    $('mvCampana').addEventListener('change', cargarMisVentas);
    pintarInstrucciones();
  }

  /* ---------- paso 1: el teléfono manda ---------- */

  function alTeclearTel() {
    var d = digitos($('vTel').value);
    $('vQuien').innerHTML = '';
    $('vNombreNuevo').classList.add('oculto');
    $('vDatos').classList.add('oculto');
    V.contacto = null; V.esNuevo = false;
    error('vErr', '');

    clearTimeout(V.timer);
    if (d.length < 10) return;

    $('vQuien').innerHTML = '<div class="nota">Buscando…</div>';
    V.timer = setTimeout(function () {
      api('contactoPorTel', { tel: d }).then(function (c) {
        if (c && c.nombre) {
          V.contacto = c; V.esNuevo = false;
          $('vQuien').innerHTML =
            '<div style="background:#e6f4ea;color:#137333;padding:12px;' +
            'border-radius:10px;font-size:15px">Ya está registrado:<br>' +
            '<b>' + esc(c.nombre) + '</b></div>';
          $('vNombreNuevo').classList.add('oculto');
          abrirDatos();
        } else {
          V.contacto = null;
          $('vQuien').innerHTML =
            '<div class="nota">Ese teléfono no está en Contactos. ' +
            'Escribe el nombre y revisa que no sea alguien que ya existe.</div>';
          $('vNombreNuevo').classList.remove('oculto');
          $('vNombre').focus();
        }
      }).catch(function (e) { error('vErr', e.message); $('vQuien').innerHTML = ''; });
    }, 350);
  }

  /* ---------- paso 1b: nombre nuevo, con red de duplicados ---------- */

  function alTeclearNombre() {
    var q = $('vNombre').value.trim();
    clearTimeout(V.timer);
    $('vParecidos').innerHTML = '';
    if (q.length < 3) { $('vDatos').classList.add('oculto'); return; }

    V.esNuevo = true;
    abrirDatos();

    V.timer = setTimeout(function () {
      api('buscarDonadores', { q: q }).then(function (lista) {
        if (!lista || !lista.length) {
          $('vParecidos').innerHTML =
            '<div class="nota">Nadie se parece. Se va a dar de alta como nuevo.</div>';
          return;
        }
        $('vParecidos').innerHTML =
          '<div class="nota" style="color:#b06000"><b>Ojo:</b> estos ya existen. ' +
          'Si es alguno, tócalo — así no se duplica el contacto.</div>' +
          lista.slice(0, 6).map(function (x) {
            var n = x.nombre || x.n || x;
            return '<div class="op" style="margin-top:6px;text-align:left;padding:11px" ' +
                   'data-nombre="' + esc(n) + '">' + esc(n) + '</div>';
          }).join('');

        Array.prototype.forEach.call(
          $('vParecidos').querySelectorAll('.op'), function (el) {
            el.addEventListener('click', function () {
              var n = this.getAttribute('data-nombre');
              $('vNombre').value = n;
              V.contacto = { nombre: n, tel: digitos($('vTel').value) };
              V.esNuevo = false;
              $('vParecidos').innerHTML =
                '<div class="nota" style="color:#137333">Se usará el contacto ' +
                'existente <b>' + esc(n) + '</b> y se le agrega este teléfono.</div>';
            });
          });
      }).catch(function () { /* la red de duplicados es ayuda, no bloqueo */ });
    }, 400);
  }

  function abrirDatos() {
    var s = $('vConcepto');
    if (!s.options.length) {
      var lista = (window.D && D.conceptos) ? D.conceptos : [];
      s.innerHTML = '<option value="">— elige —</option>' + opciones(lista);
    }
    $('vDatos').classList.remove('oculto');
    pintarTotal();
  }

  function pintarTotal() {
    var m = Number($('vMonto').value) || 0;
    var n = Number($('vMeses').value) || 1;
    if (!m || n <= 1) { $('vTotal').textContent = ''; return; }
    var total = $('vMoneda').value === 'USD'
      ? 'USD ' + Math.round(m * n).toLocaleString('en-US')
      : pesos(m * n);
    $('vTotal').textContent = 'Total del compromiso: ' + total +
                              '  (' + n + ' pagos)';
  }

  function pintarInstrucciones() {
    var presencial = $('vForma').value === FORMA_PRESENCIAL;
    $('vLblInstr').innerHTML = presencial
      ? 'Dónde y con quién <span style="color:#c5221f">· obligatorio</span>'
      : 'Instrucciones (opcional)';
    $('vNotaInstr').textContent = presencial
      ? 'Alguien va a ir físicamente por el dinero. Tiene que saber a dónde.'
      : '';
  }

  /* ---------- guardar ---------- */

  function guardar() {
    error('vErr', '');
    var nombre = V.contacto ? V.contacto.nombre : $('vNombre').value.trim();
    var d = {
      nombre: nombre,
      telefono: digitos($('vTel').value),
      concepto: $('vConcepto').value,
      mxn: $('vMoneda').value === 'MXN' ? Number($('vMonto').value) || 0 : 0,
      usd: $('vMoneda').value === 'USD' ? Number($('vMonto').value) || 0 : 0,
      meses: Number($('vMeses').value) || 1,
      forma: $('vForma').value,
      fechaCobro: $('vFecha').value,
      instrucciones: $('vInstr').value.trim(),
      fiscal: $('vFiscal').value,
      cobra: $('vCobra').value,
      nota: $('vNota').value.trim()
    };

    var falta = [];
    if (!d.nombre) falta.push('el nombre');
    if (d.telefono.length !== 10) falta.push('el teléfono a 10 dígitos');
    if (!d.concepto) falta.push('el concepto');
    if (!d.mxn && !d.usd) falta.push('el monto');
    if (!d.forma) falta.push('la forma de cobro');
    if (!d.fechaCobro) falta.push('la fecha del primer cobro');
    if (d.forma === FORMA_PRESENCIAL && !d.instrucciones)
      falta.push('dónde y con quién cobrarlo');
    if (falta.length) { error('vErr', 'Falta ' + falta.join(', ') + '.'); return; }

    var b = $('vGuardar');
    b.disabled = true; b.textContent = 'Guardando…';

    api('registrarCompromiso', { d: JSON.stringify(d) }).then(function (r) {
      b.disabled = false; b.textContent = 'Guardar compromiso';
      if (!r || !r.ok) {
        error('vErr', 'El servidor lo rechazó. Falta: ' +
              ((r && r.falta) ? r.falta.join(', ') : 'no dijo qué'));
        return;
      }
      // OJO: NO se llama a exito() de app.js. Esa función es la pantalla
      // de recibo de un cobro en efectivo: asigna D.saldo, mete un
      // pendiente en la custodia del cobrador y arma ultimoCobro, que es
      // lo que imprime la térmica. Una venta no es un cobro.
      limpiarVenta();
      V.ventas = null;
      confirmacion(r.resumen);
    }).catch(function (e) {
      b.disabled = false; b.textContent = 'Guardar compromiso';
      error('vErr', e.message);
    });
  }

  function limpiarVenta() {
    ['vTel','vNombre','vMonto','vInstr','vNota'].forEach(function (id) { $(id).value = ''; });
    $('vMeses').value = 1;
    $('vForma').value = '';
    $('vFecha').value = hoyISO(7);
    $('vQuien').innerHTML = ''; $('vParecidos').innerHTML = ''; $('vTotal').textContent = '';
    $('vNombreNuevo').classList.add('oculto');
    $('vDatos').classList.add('oculto');
    V.contacto = null; V.esNuevo = false;
    error('vErr', '');
    pintarInstrucciones();
  }

  /* ---------- Mis ventas ---------- */

  function cargarMisVentas() {
    error('mvErr', '');
    $('mvLista').innerHTML = 'Cargando…';
    var campana = $('mvCampana').value;

    api('misVentas', { campana: campana }).then(function (r) {
      V.ventas = r;
      pintarCampanas(r.campanas, campana);
      pintarTotales(r.totales);
      pintarLista(r.items);
      cargarComision(campana);
    }).catch(function (e) {
      $('mvLista').innerHTML = '';
      error('mvErr', e.message);
    });
  }

  function pintarCampanas(lista, sel) {
    var s = $('mvCampana');
    if (s.options.length > 1) return;          // ya están
    s.innerHTML = '<option value="">Todas</option>' + opciones(lista || [], sel);
    s.value = sel || '';
  }

  function pintarTotales(t) {
    var avance = t.avance || 0;
    $('mvTotales').innerHTML =
      '<div class="fila"><span>Comprometido</span><b>' + pesos(t.comprometido) + '</b></div>' +
      (t.usdComprometido
        ? '<div class="fila"><span>En dólares</span><b>USD ' +
          Math.round(t.usdComprometido).toLocaleString('en-US') + '</b></div>' : '') +
      '<div class="fila"><span>Cobrado</span><b style="color:#137333">' +
        pesos(t.cobrado) + '</b></div>' +
      '<div class="fila"><span>Pendiente</span><b style="color:#b06000">' +
        pesos(t.pendiente) + '</b></div>' +
      '<div style="background:#eef1f5;border-radius:8px;height:10px;margin-top:12px;' +
        'overflow:hidden"><div style="height:10px;width:' + avance + '%;' +
        'background:#137333"></div></div>' +
      '<div class="nota" style="text-align:center">' + avance + '% cobrado · ' +
        t.cuenta + ' compromiso(s)</div>' +
      (t.incompletos
        ? '<div style="background:#fce8e6;color:#c5221f;padding:12px;border-radius:10px;' +
          'margin-top:12px;font-size:14px">' + t.incompletos + ' compromiso(s) tuyos ' +
          'no se pueden cobrar porque les falta información. Están marcados abajo.</div>'
        : '');
  }

  function cargarComision(campana) {
    api('miComision', {}).then(function (r) {
      var t = r.totales;
      if (!t || !t.porcentaje) { $('mvComision').innerHTML = ''; return; }
      $('mvComision').innerHTML =
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eef1f5">' +
        '<div class="nota" style="margin-top:0"><b>Tu comisión</b> · ' +
          t.porcentaje + '% sobre ' + esc(t.baseUsada) + ' · todo el historial</div>' +
        '<div class="fila"><span>Neto generado</span><b>' + pesos(t.neto) + '</b></div>' +
        '<div class="fila"><span>Comisión</span><b>' + pesos(t.comisionGenerada) + '</b></div>' +
        '<div class="fila"><span>Ya pagada</span><b>' + pesos(t.yaPagado) + '</b></div>' +
        '<div class="fila"><span>Por pagar</span>' +
          '<b style="color:#b06000">' + pesos(t.porPagar) + '</b></div></div>';
    }).catch(function () { $('mvComision').innerHTML = ''; });
  }

  function pintarLista(items) {
    if (!items || !items.length) {
      $('mvLista').innerHTML = '<div class="nota">Todavía no tienes compromisos aquí.</div>';
      return;
    }
    $('mvLista').innerHTML = items.map(function (x, i) {
      var color = x.estado === 'Pagado' ? '#137333'
                : x.estado === 'Incompleto' ? '#c5221f'
                : x.estado === 'En cobranza' ? '#1a73e8' : '#b06000';
      return '<div style="padding:13px 0;border-bottom:1px solid #eef1f5">' +
        '<div style="display:flex;justify-content:space-between;gap:10px">' +
          '<b>' + esc(x.donador) + '</b>' +
          '<span style="color:' + color + ';font-size:13px;white-space:nowrap">' +
            esc(x.estado) + '</span></div>' +
        '<div class="nota" style="margin-top:3px">' + esc(x.concepto) +
          ' · ' + pesos(x.comprometido) +
          (x.cobrado ? ' · cobrado ' + pesos(x.cobrado) : '') +
          (x.pendiente ? ' · falta ' + pesos(x.pendiente) : '') + '</div>' +
        (x.asignado
          ? '<div class="nota">Lo cobra ' + esc(x.asignado) + '</div>' : '') +
        (x.faltan && x.faltan.length
          ? '<div class="nota" style="color:#c5221f">Le falta: ' +
            esc(x.faltan.join(', ')) + '</div>' +
            '<button class="btn gris" style="margin-top:8px;padding:11px;font-size:14px" ' +
            'data-fila="' + x.fila + '" data-donador="' + esc(x.donador) + '">' +
            'Completar</button>'
          : '') +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(
      $('mvLista').querySelectorAll('button[data-fila]'), function (b) {
        b.addEventListener('click', function () {
          abrirCompletar(Number(this.getAttribute('data-fila')),
                         this.getAttribute('data-donador'));
        });
      });
  }

  /* ---------- completar un compromiso a medias ---------- */

  function abrirCompletar(fila, donador) {
    var forma = prompt('¿Cómo se cobra a ' + donador + '?\n\n' +
      FORMAS.map(function (f, i) { return (i + 1) + '. ' + f; }).join('\n') +
      '\n\nEscribe el número:');
    if (!forma) return;
    var f = FORMAS[Number(forma) - 1];
    if (!f) { alert('Ese número no está en la lista.'); return; }

    var fecha = prompt('¿Qué día se cobra la primera vez? (aaaa-mm-dd)', hoyISO(7));
    if (!fecha) return;

    var instr = '';
    if (f === FORMA_PRESENCIAL) {
      instr = prompt('¿Dónde y con quién se cobra?\n' +
                     'Ej. oficina Polanco, martes 10 a 14 h, preguntar por Lily');
      if (!instr) { alert('Sin esto no se puede cobrar en efectivo.'); return; }
    }

    api('completarCompromiso', {
      d: JSON.stringify({ fila: fila, forma: f, fechaCobro: fecha, instrucciones: instr })
    }).then(function (r) {
      if (!r || !r.ok) { alert('No se pudo: ' + ((r && r.error) || 'error')); return; }
      if (r.estado === 'Listo para cobrar') alert('Listo. Ya entró a la cola de cobranza.');
      else alert('Todavía le falta: ' + (r.faltan || []).join(', '));
      cargarMisVentas();
    }).catch(function (e) { alert(e.message); });
  }

  /* ---------- enganche con app.js ---------- */

  var _verOrig = window.ver;
  window.ver = function (v) {
    var nuevos = { vender: 'Vender', misventas: 'MisVentas' };
    Object.keys(nuevos).forEach(function (k) {
      var vi = $('v' + nuevos[k]), ta = $('t' + nuevos[k]);
      if (vi) vi.classList.toggle('oculto', v !== k);
      if (ta) ta.classList.toggle('act', v === k);
    });

    if (nuevos[v]) {
      ['Cobrar', 'Entregar', 'Recibir'].forEach(function (c) {
        var vi = $('v' + c), ta = $('t' + c);
        if (vi) vi.classList.add('oculto');
        if (ta) ta.classList.remove('act');
      });
      if (v === 'misventas') cargarMisVentas();
    } else if (typeof _verOrig === 'function') {
      _verOrig(v);
    }
  };

  var _iniciarOrig = window.iniciar;
  window.iniciar = function (d) {
    if (typeof _iniciarOrig === 'function') _iniciarOrig(d);
    try { inyectar(); } catch (e) { console.error('ventas.js: ' + e.message); }
  };

  // por si la sesión ya estaba abierta cuando cargó el script
  if (document.readyState !== 'loading') {
    setTimeout(function () { if ($('app') && !$('app').classList.contains('oculto')) inyectar(); }, 0);
  }

  window.cargarMisVentas = cargarMisVentas;
})();
