// ════════════ ROUTING ════════════
function doGet(e) {
  const params = e.parameter || {};
  const action = params.action;
  const callback = params.callback || params.cb;
  let result;
  try {
    switch (action) {
      case 'version':           result = { ok: true, version: 'v38-canchaIdFix-perfCache-initData' }; break;
      // ── initData: un solo round-trip que carga todo lo necesario al arrancar ──
      case 'initData': {
        const iProx   = cachedRead_('proximaFecha',    300, getProximaFecha_);
        const iFechas = cachedRead_('fechasConEstado', 120, getFechasConEstado_);
        const iJugs   = cachedRead_('jugadoresHist',   300, getJugadoresHist_);
        const iActiva = cachedRead_('fechaActiva', 60, getFechaActiva_); // TTL 60s; se invalida en cargarTarjeta_
        result = { ok: true, data: { proximaFecha: iProx, fechasConEstado: iFechas, jugadoresHist: iJugs, fechaActiva: iActiva } };
        break;
      }
      case 'jugadoresHist':     result = { ok: true, data: cachedRead_('jugadoresHist', 300, getJugadoresHist_) }; break;
      case 'jugadorPerfil':     result = { ok: true, data: cachedRead_('perf_' + params.matricula, 300, function(){ return getJugadorPerfil_(params.matricula); }) }; break;
      case 'jugadorEclectic':   result = { ok: true, data: getJugadorEclectic_(params.matricula, params.cancha) }; break;
      case 'debugGolpesVsTarjetas': result = { ok: true, data: debugGolpesVsTarjetas_(params.matricula) }; break;
      case 'proximaFecha':     result = { ok: true, data: cachedRead_('proximaFecha', 300, getProximaFecha_) }; break;
      case 'jugadores':        result = { ok: true, data: cachedRead_('jugadores', 300, getJugadores_) }; break;
      case 'canchas':          result = { ok: true, data: cachedRead_('canchas', 300, getCanchas_) }; break;
      case 'canchaPares':      result = { ok: true, data: cachedRead_('cp2_' + params.cancha, 1800, function(){ return getCanchaPares_(params.cancha); }) }; break;
      case 'fechas':           result = { ok: true, data: cachedRead_('fechas', 60, getFechasActivas_) }; break;
      case 'fechasConEstado':  result = { ok: true, data: cachedRead_('fechasConEstado', 120, getFechasConEstado_) }; break;
      case 'fechaResultados':  result = { ok: true, data: params.nocache ? getFechaResultados_(params.fecha) : cachedRead_('fechaRes_' + params.fecha, 300, function(){ return getFechaResultados_(params.fecha); }) }; break;
      case 'fechaMeta':        result = { ok: true, data: getFechaMeta_(params.fecha) }; break;
      case 'jugadoresEnFecha': result = { ok: true, data: getJugadoresEnFecha_(params.fecha) }; break;
      case 'bonusWinners':     result = { ok: true, data: cachedRead_('bw_' + params.fecha, 30, function(){ return getBonusWinners_(params.fecha); }) }; break;
      case 'bonusesAcum':      result = { ok: true, data: cachedRead_('bonusesAcum', 120, getBonusesAcum_) }; break;
      case 'coloresCancha':    result = { ok: true, data: cachedRead_('colores_' + params.canchaId, 300, function(){ return getColoresCancha_(params.canchaId); }) }; break;
      case 'allColoresCancha': result = { ok: true, data: cachedRead_('allColoresCancha', 300, getAllColoresCancha_) }; break;
      case 'winProbabilities': result = { ok: true, data: getWinProbabilitiesCached_() }; break;
      case 'matchesForFecha':     result = { ok: true, data: getMatchesForFecha_(params.fecha) }; break;
      case 'matchesFullForFecha': result = { ok: true, data: getMatchesFullForFecha_(params.fecha) }; break;
      case 'misFechas':        result = { ok: true, data: cachedRead_('mf_' + params.matricula, 60, function(){ return getMisFechas_(params.matricula); }) }; break;
      case 'jugadorFechas':   result = { ok: true, data: getJugadorFechas_(params.matricula) }; break;
      case 'dobleDisponible':  result = { ok: true, data: { tieneDoble: getJugadoresConDobleDisponible_().indexOf(String(params.matricula)) >= 0 } }; break;
      case 'jugadoresConDoble': result = { ok: true, data: cachedRead_('jugadoresConDoble', 60, getJugadoresConDobleDisponible_) }; break;
      case 'fechaDetalle':     result = { ok: true, data: getFechaDetalle_(params.fecha) }; break;
      case 'fechaLineas':    result = { ok: true, data: cachedRead_('fl_' + params.fecha, 300, function(){ return getFechaLineas_(params.fecha); }) }; break;
      case 'tarjeta':          result = { ok: true, data: cachedRead_('tj_' + params.fecha + '_' + params.matricula, 60, function(){ return getTarjetaJugador_(params.fecha, params.matricula); }) }; break;
      case 'debugMatch':       result = { ok: true, data: debugMatch_() }; break;
      case 'debugDobles':      result = { ok: true, data: debugDobles_() }; break;
      case 'debugHcpCanchas':  result = { ok: true, data: debugHcpCanchas_() }; break;
      case 'debugHcpCalculo':  result = { ok: true, data: debugHcpCalculo_(params) }; break;
      case 'login': {
        const p = checkPlayerByMat_(params.matricula);
        result = { ok: !!p, player: p };
        break;
      }
      case 'validateSession': {
        const sess = validarSesion_(params.token);
        if (!sess) { result = { ok: false, error: 'Sesión inválida' }; break; }
        const jugsList = cachedRead_('jugadores', 300, getJugadores_);
        const jugInfo = jugsList.find(function(j){ return j.matricula === sess.mat; }) || {};
        result = { ok: true, player: { matricula: sess.mat, nombre: jugInfo.nombre || '', apodo: jugInfo.apodo || '', hcpIndex: jugInfo.hcpIndex || null, rol: sess.rol, fotoUrl: jugInfo.fotoUrl || '' } };
        break;
      }
      case 'getRankingCampeones': result = getRankingCampeones_(); break;
      case 'canchasAdmin':     result = { ok: true, data: getCanchasAdmin_() }; break;
      case 'getLineaLive':     result = getLineaLive_(params.fecha, params.matricula, params.lineaNum); break;
      case 'getBonusEstado':   result = getBonusEstado_(params); break;
      case 'getStbFecha':      result = getStbFecha_(params); break;
      default:                 result = { ok: false, error: 'Acción desconocida: ' + action };
    }
  } catch (err) { result = { ok: false, error: String(err.message || err) }; }
  return callback ? jsonpResponse_(callback, result) : jsonResponse_(result);
}

/**
 * Devuelve el ranking stableford de todos los jugadores de una fecha.
 * Usado por la tab "Stableford" en live scoring.
 */
function getStbFecha_(params) {
  const fStr = String(params.fecha || '').trim();
  if (!fStr) return { ok: false, error: 'Falta fecha' };

  const meta = getFechaMeta_(fStr);
  if (!meta) return { ok: false, error: 'Fecha no encontrada' };

  const canchaId = String(meta.canchaId || '').trim();
  const cd = canchaId
    ? cachedRead_('cp2_' + canchaId, 600, function(){ return getCanchaPares_(canchaId); })
    : null;
  const cpPares   = (cd && cd.pares)   || [];
  const cpIndices = (cd && cd.indices) || [];

  const shT = getSheet_(SHEETS.TARJETAS);
  if (!shT) return { ok: false, error: 'Hoja TARJETAS no encontrada' };
  const nextEmpty = findNextEmptyRow_(shT, 1);
  if (nextEmpty <= 2) return { ok: true, data: [] };
  const allRows = shT.getRange(2, 1, nextEmpty - 2, 24).getValues();

  const jugMap = {};
  cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap[String(j.matricula)] = j; });

  const results = [];
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (String(r[0]).trim() !== fStr) continue;
    const mat = String(r[1]).trim();
    const hcp = parseFloat(r[2]);
    const scores = r.slice(4, 22).map(function(v){ return (v === '' || v === null || v === undefined) ? null : Number(v); });
    const holesCargados = scores.filter(function(s){ return s !== null; }).length;
    const hcpEff = isNaN(hcp) ? 0 : hcp;
    const stbPorHoyo = scores.map(function(s, h) {
      return s !== null ? calcStablefordHole_(s, cpPares[h] || null, cpIndices[h] || null, hcpEff) : null;
    });
    const stbTotal = stbPorHoyo.reduce(function(t, v){ return t + (v || 0); }, 0);
    const gross = scores.reduce(function(t, s){ return t + (s !== null ? s : 0); }, 0);
    const jug = jugMap[mat] || {};
    results.push({
      matricula:     mat,
      apodo:         ((jug.apodo || (jug.nombre ? jug.nombre.split(' ')[0] : mat)) + '').toUpperCase(),
      hcp:           isNaN(hcp) ? null : hcp,
      stbTotal:      holesCargados > 0 ? stbTotal : null,
      holesCargados: holesCargados,
      grossParcial:  gross,
      scores:        scores,
      stbPorHoyo:    stbPorHoyo,
    });
  }

  results.sort(function(a, b){
    if (a.stbTotal === null && b.stbTotal === null) return 0;
    if (a.stbTotal === null) return 1;
    if (b.stbTotal === null) return -1;
    return b.stbTotal - a.stbTotal;
  });

  return { ok: true, data: results, pares: cpPares, indices: cpIndices };
}


function doPost(e) {
  let params = {};
  try { params = JSON.parse(e.postData.contents || '{}'); }
  catch (err) { return jsonResponse_({ ok: false, error: 'JSON inválido' }); }

  const action = params.action;
  let result;
  try {
    switch (action) {
      case 'crearFecha':     result = crearFecha_(params); break;
      case 'editarFecha':    result = editarFecha_(params); break;
      case 'cargarTarjeta':
        result = cargarTarjeta_(params);
        if (result && result.ok) {
          try { CacheService.getScriptCache().removeAll(['fechaActiva', 'fl_' + params.fecha]); } catch(e) {}
        }
        break;
      case 'resetFecha':            result = resetFecha_(params); break;
      case 'eliminarFecha':         result = eliminarFecha_(params); break;
      case 'getTarjetasForFecha':   result = getTarjetasForFecha_(params); break;
      case 'setBonusWinners':       result = setBonusWinners_(params); break;
      case 'setBonusHoyo':          result = setBonusHoyo_(params); break;
      case 'cargarMatches':       result = cargarMatches_(params); break;
      case 'editarMatches':       result = editarMatches_(params); break;
      case 'actualizarHcpIndices': result = actualizarHcpIndices_(params); break;
      case 'recalcularScore':          result = recalcularTotalesScore_(params); break;
      case 'calcularGanadoresFechas': result = calcularGanadoresFechas_(params); break;
      case 'recalcularHcpFecha':   result = recalcularHcpFecha_(params); break;
      case 'recalcularStbFecha':    result = recalcularStbFecha_(params); break;
      case 'updateCanchaHoyos':      result = updateCanchaHoyos_(params); break;
      case 'updateRating':           result = updateRating_(params); break;
      case 'recalcularMatchesFecha': result = recalcularMatchesFecha_(params); break;
      case 'crearCancha':            result = crearCancha_(params); break;
      case 'loginConPin':        result = loginConPin_(params); break;
      case 'crearPin':           result = crearPin_(params); break;
      case 'cambiarPin':         result = cambiarPin_(params); break;
      case 'resetPin':           result = resetPin_(params); break;
      case 'cerrarSesion':       result = cerrarSesion_(params); break;
      case 'subirFoto':          result = subirFoto_(params); break;
      case 'cargarHoyoLive':     result = cargarHoyoLive_(params); break;
      case 'setBonusGanador':    result = setBonusGanador_(params); break;
      case 'armarLineas':          result = armarLineas_(params); break;
      case 'fechaLineas':          result = { ok: true, data: cachedRead_('fl_' + params.fecha, 300, function(){ return getFechaLineas_(params.fecha); }) }; break;
      case 'setDoblesFecha':       result = setDoblesFecha_(params); break;
      default:               result = { ok: false, error: 'Acción desconocida: ' + action };
    }
  } catch (err) { result = { ok: false, error: String(err.message || err) }; }
  return jsonResponse_(result);
}