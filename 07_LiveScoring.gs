// ════════════ LIVE SCORING ════════════

/**
 * Construye el snapshot completo de una línea (datos para `getLineaLive`).
 * Usado internamente por `getLineaLive_` y por `cargarHoyoLive_` (devuelve el
 * snapshot fresco como respuesta, req 6.2).
 */
function buildLineaSnapshot_(fStr, lineaIdx, meta, jugMap) {
  const lineaMats = meta.lineas[lineaIdx].map(String);
  const canchaId  = String(meta.canchaId || '').trim();

  const cd = canchaId
    ? cachedRead_('cp2_' + canchaId, 600, function(){ return getCanchaPares_(canchaId); })
    : null;
  const cpPares   = (cd && cd.pares)   || [];
  const cpIndices = (cd && cd.indices) || [];

  // TARJETAS: 0=fecha,1=mat,2=hcp,3=canchaId,4..21=H1..H18,22=LD,23=BA
  const shT = getSheet_(SHEETS.TARJETAS);
  if (!shT) return null;

  // Cache shared for row-index fast-path AND ultimoCargadoPor reads
  const cache = CacheService.getScriptCache();

  // Fast path: if all 4 player row indices are already in cache, read only that block
  // (avoids re-scanning the full TARJETAS sheet on every save/poll)
  const lineaRowIdxs = lineaMats.map(function(mat) {
    const v = cache.get('tRow_' + fStr + '_' + mat);
    return v ? parseInt(v) : 0;
  });
  const allRowsCached = lineaRowIdxs.every(function(r) { return r >= 2; });

  let allRows, rowStart;
  if (allRowsCached) {
    const minR = Math.min.apply(null, lineaRowIdxs);
    const maxR = Math.max.apply(null, lineaRowIdxs);
    allRows  = shT.getRange(minR, 1, maxR - minR + 1, 24).getValues();
    rowStart = minR;
  } else {
    const nextEmpty = findNextEmptyRow_(shT, 1);
    if (nextEmpty <= 2) return null;
    allRows  = shT.getRange(2, 1, nextEmpty - 2, 24).getValues();
    rowStart = 2;
  }

  const playerMap = {};
  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (String(r[0]).trim() !== fStr) continue;
    const mat = String(r[1]).trim();
    if (lineaMats.indexOf(mat) < 0) continue;
    // Populate row cache on slow-path reads so future calls take the fast path
    if (!allRowsCached) {
      try { cache.put('tRow_' + fStr + '_' + mat, String(rowStart + i), 21600); } catch(e) {}
    }
    const hcp    = parseFloat(r[2]);
    const scores = r.slice(4, 22).map(function(v) {
      return (v === '' || v === null || v === undefined) ? null : Number(v);
    });
    const stbPorHoyo = scores.map(function(s, h) {
      if (s === null) return null;
      return calcStablefordHole_(s, cpPares[h] || null, cpIndices[h] || null, hcp);
    });
    const stbTotal     = stbPorHoyo.reduce(function(t, v){ return t + (v || 0); }, 0);
    const holesCargados = scores.filter(function(s){ return s !== null; }).length;
    const grossParcial  = scores.reduce(function(t, s){ return t + (s !== null ? s : 0); }, 0);

    let ultimoCargadoPor = null;
    try {
      const raw = cache.get('lastCarg_' + fStr + '_' + mat);
      if (raw) ultimoCargadoPor = JSON.parse(raw);
    } catch(e) {}

    const bonusEst = meta.bonusEstado || {};
    const lineaNum = lineaIdx + 1;
    const ldFromSheet = (r[22] === 1 || r[22] === true || String(r[22]) === '1');
    const baFromSheet = (r[23] === 1 || r[23] === true || String(r[23]) === '1');
    const ldFromBonus = bonusEst.ld && String(bonusEst.ld.matricula || '').trim() === mat
                        && bonusEst.ld.lineaNum === lineaNum;
    const baFromBonus = bonusEst.ba && String(bonusEst.ba.matricula || '').trim() === mat
                        && bonusEst.ba.lineaNum === lineaNum;
    playerMap[mat] = {
      hcp:             isNaN(hcp) ? 0 : hcp,
      hcp85:           isNaN(hcp) ? 0 : hcp,
      scores:          scores,
      ld:              ldFromSheet || ldFromBonus,
      ba:              baFromSheet || baFromBonus,
      stbPorHoyo:      stbPorHoyo,
      stbTotal:        holesCargados > 0 ? stbTotal : null,
      grossParcial:    grossParcial,
      holesCargados:   holesCargados,
      ultimoCargadoPor: ultimoCargadoPor,
    };
  }

  const jugadores = lineaMats.map(function(mat) {
    const jug = jugMap[mat] || {};
    const pd  = playerMap[mat] || {
      hcp: 0, hcp85: 0, ld: false, ba: false,
      scores: new Array(18).fill(null), stbPorHoyo: new Array(18).fill(null),
      stbTotal: null, grossParcial: 0, holesCargados: 0, ultimoCargadoPor: null,
    };
    const firstNull = pd.scores.indexOf(null);
    return {
      matricula:        mat,
      apodo:           (jug.apodo || (jug.nombre ? jug.nombre.split(' ')[0] : mat)).toUpperCase(),
      hcpJuego:        pd.hcp,
      scores:          pd.scores,
      stbPorHoyo:      pd.stbPorHoyo,
      stbTotal:        pd.stbTotal,
      grossParcial:    pd.grossParcial,
      holesCargados:   pd.holesCargados,
      ld:              pd.ld,
      ba:              pd.ba,
      ultimoCargadoPor: pd.ultimoCargadoPor,
      nextHoyo:        firstNull >= 0 ? firstNull + 1 : 19,
    };
  });

  // Matches de esta línea
  const shM = getSheet_(SHEETS.MATCH);
  const matchPairs = [];
  if (shM) {
    const neM = shM.getLastRow();
    if (neM >= 2) {
      const mData = shM.getRange(2, 2, neM - 1, 3).getValues();
      for (let i = 0; i < mData.length; i++) {
        if (String(mData[i][0]).trim() !== fStr) continue;
        const m1 = String(mData[i][1]).trim();
        const m2 = String(mData[i][2]).trim();
        if (lineaMats.indexOf(m1) >= 0 && lineaMats.indexOf(m2) >= 0)
          matchPairs.push({ mat1: m1, mat2: m2 });
      }
    }
  }

  const matches = matchPairs.map(function(pair) {
    const pd1  = playerMap[pair.mat1];
    const pd2  = playerMap[pair.mat2];
    const jug1 = jugMap[pair.mat1] || {};
    const jug2 = jugMap[pair.mat2] || {};
    const a1   = (jug1.apodo || pair.mat1).toUpperCase();
    const a2   = (jug2.apodo || pair.mat2).toUpperCase();

    if (!pd1 || !pd2 || !cpIndices.length) {
      return { j1: pair.mat1, j1Apodo: a1, j2: pair.mat2, j2Apodo: a2,
               estado: '', hoyosJugados: 0, hoyosRestantes: 18, detallePorHoyo: new Array(18).fill(null) };
    }

    const ay1 = Math.max(0, pd1.hcp85 - pd2.hcp85);
    const ay2 = Math.max(0, pd2.hcp85 - pd1.hcp85);
    const bc1 = Math.max(0, ay1 - 18);
    const bc2 = Math.max(0, ay2 - 18);

    let pts1 = 0, pts2 = 0, hoyosJugados = 0;
    const detallePorHoyo = new Array(18).fill(null);
    for (let h = 0; h < 18; h++) {
      const g1 = pd1.scores[h], g2 = pd2.scores[h];
      if (g1 === null || g2 === null) continue;
      const idx  = cpIndices[h] || 0;
      const adj1 = (ay1 > 0 && ay1 >= idx ? -1 : 0) + (bc1 > 0 && idx <= bc1 ? -1 : 0);
      const adj2 = (ay2 > 0 && ay2 >= idx ? -1 : 0) + (bc2 > 0 && idx <= bc2 ? -1 : 0);
      const net1 = g1 + adj1, net2 = g2 + adj2;
      if (net1 < net2)      { pts1++; detallePorHoyo[h] = 'win'; }
      else if (net2 < net1) { pts2++; detallePorHoyo[h] = 'lose'; }
      else                  { detallePorHoyo[h] = 'halved'; }
      hoyosJugados++;
      // Early termination: match is decided when |diff| > holes remaining — stop counting.
      // Prevents impossible results like "8&2" when hoyos are still played for other formats.
      const diffSoFar = pts1 - pts2;
      if (Math.abs(diffSoFar) > (18 - hoyosJugados)) break;
    }

    const diff      = pts1 - pts2;
    const remaining = 18 - hoyosJugados;
    const abs       = Math.abs(diff);
    let estado = '';
    if (hoyosJugados > 0) {
      if (diff === 0) estado = 'AS';
      else if (abs > remaining) estado = abs + '&' + remaining + (diff < 0 ? ' DN' : '');
      else estado = diff > 0 ? (diff + ' UP') : (abs + ' DN');
    }

    return {
      j1: pair.mat1, j1Apodo: a1,
      j2: pair.mat2, j2Apodo: a2,
      estado:         estado,
      hoyosJugados:   hoyosJugados,
      hoyosRestantes: remaining,
      detallePorHoyo: detallePorHoyo,
    };
  });

  const canchaNombre = meta.canchaName || lookupCanchaName_(canchaId) || '';
  return {
    fecha:      fStr,
    lineaNum:   lineaIdx + 1,
    horario:    meta.horario || '',
    cancha:     { id: canchaId, nombre: canchaNombre, colorTee: meta.colorTee || 'BLANCAS' },
    hoyoSalida: meta.hoyoSalida || 1,
    pares:         cpPares,
    indices:       cpIndices,
    totalLineas:   meta.lineas ? meta.lineas.length : 1,
    updatedAt:     Date.now(),
    jugadores:     jugadores,
    matches:       matches,
    bonusPendiente: null,
  };
}

/**
 * Guarda el score de un hoyo durante la ronda. Verifica que matriculaCargador
 * pertenezca a la misma línea que matriculaJugador (req 6.1.c).
 * Devuelve el snapshot fresco de toda la línea (req 6.2 — mismo shape que getLineaLive).
 */
function cargarHoyoLive_(params) {
  const { fecha, matriculaJugador, matriculaCargador, hoyo, score } = params;
  if (!fecha || !matriculaJugador || !hoyo)
    return { ok: false, error: 'Faltan parámetros' };

  const hoyoNum = parseInt(hoyo);
  if (isNaN(hoyoNum) || hoyoNum < 1 || hoyoNum > 18)
    return { ok: false, error: 'Hoyo inválido (1-18)' };

  const fStr    = String(fecha);
  const jugStr  = String(matriculaJugador).trim();
  const cargStr = String(matriculaCargador || '').trim();
  if (!cargStr) return { ok: false, error: 'Falta matriculaCargador' };

  // Auth: matriculaCargador en la misma línea que matriculaJugador (o admin)
  const isAdmin = checkAdmin_(cargStr);
  const meta    = getFechaMeta_(fStr);
  if (!meta || !meta.lineas) return { ok: false, error: 'Fecha no encontrada' };

  let lineaIdx = -1;
  for (let i = 0; i < meta.lineas.length; i++) {
    const mats = meta.lineas[i].map(String);
    if (mats.indexOf(jugStr) >= 0 && (isAdmin || mats.indexOf(cargStr) >= 0)) {
      lineaIdx = i; break;
    }
  }
  if (lineaIdx < 0) return { ok: false, error: 'No autorizado para cargar en esta línea' };

  // score: null/'' borra; entero 1-15 guarda
  let scoreVal;
  if (score === null || score === '' || score === undefined) {
    scoreVal = '';
  } else {
    scoreVal = parseInt(score);
    if (isNaN(scoreVal) || scoreVal < 1 || scoreVal > 15)
      return { ok: false, error: 'Score inválido' };
  }

  // Hoja TARJETAS
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };

  // Índice de fila en cache (evita leer las N filas en cada tap — req 6.2)
  const cache    = CacheService.getScriptCache();
  const rowCacheKey = 'tRow_' + fStr + '_' + jugStr;
  let rowIdx = parseInt(cache.get(rowCacheKey) || '0');

  if (rowIdx < 2) {
    const ne = findNextEmptyRow_(sh, 1);
    if (ne <= 2) return { ok: false, error: 'Sin tarjetas' };
    const ab = sh.getRange(2, 1, ne - 2, 2).getValues();
    for (let i = 0; i < ab.length; i++) {
      if (String(ab[i][0]).trim() === fStr && String(ab[i][1]).trim() === jugStr) {
        rowIdx = i + 2;
        try { cache.put(rowCacheKey, String(rowIdx), 21600); } catch(e) {}
        break;
      }
    }
  }
  if (rowIdx < 2) return { ok: false, error: 'Tarjeta no encontrada para ' + jugStr };

  // Per-player mutex via CacheService — avoids global script lock contention with cargarTarjeta_,
  // which holds LockService.getScriptLock() for up to 30s during heavy 6-write operations.
  // TTL of 8s means the lock auto-expires if the process crashes mid-write.
  // Race condition risk: two simultaneous requests for the SAME player + hoyo in the ~30ms
  // window between cache.get() and cache.put(). Worst case: last write wins (no corruption).
  const lockKey = 'plk_' + fStr + '_' + jugStr;
  const lockId  = String(Date.now()) + '_' + Math.floor(Math.random() * 1e9);
  let lockAcquired = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!cache.get(lockKey)) {
      cache.put(lockKey, lockId, 8);
      Utilities.sleep(30);
      if (cache.get(lockKey) === lockId) { lockAcquired = true; break; }
    }
    Utilities.sleep(300);
  }
  if (!lockAcquired) return { ok: false, error: 'Servidor ocupado, reintentá' };

  try {
    sh.getRange(rowIdx, 4 + hoyoNum).setValue(scoreVal);
    SpreadsheetApp.flush();
  } finally {
    try { cache.remove(lockKey); } catch(e) {}
  }

  // Guardar ultimoCargadoPor en cache (6h = duración de una ronda)
  if (scoreVal !== '') {
    const jugMap = {};
    cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap[String(j.matricula)] = j; });
    const cargJug = jugMap[cargStr] || {};
    try {
      cache.put('lastCarg_' + fStr + '_' + jugStr,
        JSON.stringify({ hoyo: hoyoNum, matricula: cargStr,
                         apodo: (cargJug.apodo || cargStr).toUpperCase() }), 21600);
    } catch(e) {}
  }

  audit_('CARGAR_HOYO_LIVE', cargStr,
    { fecha: fStr, matriculaJugador: jugStr, hoyo: hoyoNum, score: scoreVal });

  // Devolver snapshot fresco (req 6.2: "el mismo shape que getLineaLive")
  const jugMap2 = {};
  cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap2[String(j.matricula)] = j; });
  const snap = buildLineaSnapshot_(fStr, lineaIdx, meta, jugMap2);

  // Detectar si el hoyo es de bonus (BA o LD) y no tiene ganador reportado aún.
  // Solo disparar cuando los 4 jugadores de la línea tengan score en ese hoyo.
  let bonusPendiente = null;
  if (scoreVal !== '' && meta.bonusHoyos && snap && snap.jugadores) {
    const bonusEstado = meta.bonusEstado || {};
    const hoyoIdx = hoyoNum - 1;
    const allHaveScore = snap.jugadores.every(function(j){ return j.scores[hoyoIdx] !== null; });
    if (allHaveScore) {
      if (hoyoNum === meta.bonusHoyos.ba && !bonusEstado.ba) {
        bonusPendiente = { tipo: 'ba', hoyo: hoyoNum };
      } else if (hoyoNum === meta.bonusHoyos.ld && !bonusEstado.ld) {
        bonusPendiente = { tipo: 'ld', hoyo: hoyoNum };
      }
    }
  }

  return Object.assign({ ok: true }, snap || {}, { bonusPendiente: bonusPendiente });
}

/**
 * Devuelve el estado completo de la línea a la que pertenece `matricula`.
 * Si `matricula` no está en ninguna línea de esa fecha, error.
 * Diseñado para polling cada 5-8s (req 6.3).
 */
function getLineaLive_(fecha, matricula, lineaNum) {
  const fStr = String(fecha || '').trim();
  if (!fStr) return { ok: false, error: 'Falta fecha' };

  const meta = getFechaMeta_(fStr);
  if (!meta || !meta.lineas) return { ok: false, error: 'Fecha no encontrada' };

  const jugMap = {};
  cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap[String(j.matricula)] = j; });

  // Si viene lineaNum explícito → vista de solo lectura (cualquier jugador puede pedir)
  if (lineaNum) {
    const idx = parseInt(lineaNum) - 1;
    if (idx < 0 || idx >= meta.lineas.length)
      return { ok: false, error: 'Línea ' + lineaNum + ' no existe en esta fecha' };
    const snap = buildLineaSnapshot_(fStr, idx, meta, jugMap);
    return Object.assign({ ok: true, soloLectura: true }, snap || {});
  }

  // Sin lineaNum → buscar la línea de la matrícula
  const matStr = String(matricula || '').trim();
  if (!matStr) return { ok: false, error: 'Faltan parámetros' };

  let lineaIdx = -1;
  for (let i = 0; i < meta.lineas.length; i++) {
    if (meta.lineas[i].map(String).indexOf(matStr) >= 0) { lineaIdx = i; break; }
  }
  if (lineaIdx < 0) return { ok: false, error: 'No pertenecés a ninguna línea de esta fecha' };

  const snap = buildLineaSnapshot_(fStr, lineaIdx, meta, jugMap);
  return Object.assign({ ok: true, soloLectura: false }, snap || {});
}

function getBonusEstado_(params) {
  const fStr = String(params.fecha || '').trim();
  if (!fStr) return { ok: false, error: 'Falta fecha' };
  const meta = getFechaMeta_(fStr);
  if (!meta) return { ok: false, error: 'Fecha no encontrada' };

  const bonusHoyos  = meta.bonusHoyos  || {};
  const bonusEstado = meta.bonusEstado || {};
  const totalLineas = meta.lineas ? meta.lineas.length : 0;
  const jugMap = {};
  cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap[String(j.matricula)] = j; });

  function buildBonusInfo(tipo) {
    const hoyo = bonusHoyos[tipo] || null;
    if (!hoyo) return null;
    const est = bonusEstado[tipo];
    let ganador = null;
    if (est && est.matricula) {
      const jug = jugMap[String(est.matricula)] || {};
      ganador = {
        matricula: est.matricula,
        apodo: ((jug.apodo || (jug.nombre ? jug.nombre.split(' ')[0] : est.matricula)) + '').toUpperCase(),
        lineaNum: est.lineaNum,
      };
    }
    // Simplified: any line without bonusEstado entry is pending
    const lineasFaltantes = [];
    if (!est) {
      for (let i = 1; i <= totalLineas; i++) lineasFaltantes.push('L' + i);
    }
    return { hoyo, ganador, final: lineasFaltantes.length === 0, lineasFaltantes };
  }

  return { ok: true, ba: buildBonusInfo('ba'), ld: buildBonusInfo('ld') };
}

function setBonusGanador_(params) {
  const { fecha, tipo, lineaNum, matricula, matriculaReporta } = params;
  if (!fecha || !tipo || !lineaNum) return { ok: false, error: 'Faltan parámetros' };

  const fStr = String(fecha).trim();
  const meta = getFechaMeta_(fStr);
  if (!meta) return { ok: false, error: 'Fecha no encontrada' };

  const tipoLower = String(tipo).toLowerCase();
  if (tipoLower !== 'ba' && tipoLower !== 'ld') return { ok: false, error: 'Tipo inválido' };

  const lineaIdx = parseInt(lineaNum) - 1;
  const reportaMat = String(matriculaReporta || '').trim();

  if (!checkAdmin_(params.adminKey)) {
    const linea = (meta.lineas || [])[lineaIdx] || [];
    if (linea.map(String).indexOf(reportaMat) < 0)
      return { ok: false, error: 'No autorizado' };
  }

  const props = PropertiesService.getDocumentProperties();
  let metaAll;
  try { metaAll = JSON.parse(props.getProperty('FECHA_META') || '{}'); } catch(e) { metaAll = {}; }
  if (!metaAll[fStr]) metaAll[fStr] = {};
  if (!metaAll[fStr].bonusEstado) metaAll[fStr].bonusEstado = {};

  let ganador = null;
  if (matricula) {
    const jugMap = {};
    cachedRead_('jugadores', 300, getJugadores_).forEach(function(j){ jugMap[String(j.matricula)] = j; });
    const jug = jugMap[String(matricula)] || {};
    ganador = {
      matricula: String(matricula),
      apodo: ((jug.apodo || (jug.nombre ? jug.nombre.split(' ')[0] : matricula)) + '').toUpperCase(),
      lineaNum: parseInt(lineaNum),
    };
    metaAll[fStr].bonusEstado[tipoLower] = { matricula: String(matricula), lineaNum: parseInt(lineaNum), timestamp: Date.now() };
    props.setProperty('FECHA_META', JSON.stringify(metaAll));
  }

  audit_('SET_BONUS_GANADOR', reportaMat, { fecha, tipo, lineaNum, matricula });
  return { ok: true, tipo, ganador, final: false };
}
