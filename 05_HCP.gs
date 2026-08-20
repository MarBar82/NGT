/* ════════════════════ HCP NGT (WHS) ════════════════════ */

const TEE_DEFAULT = 'BLANCAS';

/**
 * Read RATING sheet from NGT DB.
 * Cols: A=ID cancha, B=nombre, C=color salidas, D=rating, E=slope.
 * Returns: { [canchaId]: { nombre, byColor: { [COLOR]: { rating, slope } } } }
 */
function getRatingsMap_() {
  const sh = getHistSheet_('RATING');
  if (!sh) return {};
  const lr = sh.getLastRow();
  if (lr < 2) return {};
  const data = sh.getRange(2, 1, lr - 1, 5).getValues();
  const map = {};
  data.forEach(r => {
    const id = String(r[0] || '').trim();
    if (!id) return;
    const nombre = String(r[1] || '').trim();
    const color = String(r[2] || '').trim().toUpperCase();
    const rating = parseFloat(r[3]);
    const slope = parseFloat(r[4]);
    if (!color || isNaN(rating) || isNaN(slope)) return;
    if (!map[id]) map[id] = { nombre: nombre, byColor: {} };
    map[id].byColor[color] = { rating: rating, slope: Math.round(slope) };
  });
  return map;
}

/** Lookup rating/slope for a course + tee color, with fallback to BLANCAS. */
function lookupRating_(ratingsMap, canchaId, color) {
  const c = ratingsMap[canchaId];
  if (!c) return null;
  const colorKey = String(color || TEE_DEFAULT).toUpperCase();
  if (c.byColor[colorKey]) return c.byColor[colorKey];
  if (c.byColor[TEE_DEFAULT]) return c.byColor[TEE_DEFAULT];
  const keys = Object.keys(c.byColor);
  if (keys.length) return c.byColor[keys[0]];
  return null;
}

/**
 * Calculate strokes received per hole for WHS Score Adjusted (Net Double Bogey cap).
 * indices: array of 18 numbers (1..18), one per hole.
 * Returns array of 18 stroke counts.
 */
function calcStrokesPerHole_(courseHcp, indices) {
  const cHcp = Math.round(courseHcp || 0);
  const absH = Math.abs(cHcp);
  const base = Math.floor(absH / 18);
  const extra = absH - base * 18;
  const sign = cHcp >= 0 ? 1 : -1;
  const strokes = new Array(18).fill(0);
  for (let h = 0; h < 18; h++) {
    const idx = indices[h];
    if (idx === null || idx === undefined || isNaN(idx)) continue;
    let s = base;
    if (extra > 0 && idx <= extra) s += 1;
    strokes[h] = sign * s;
  }
  return strokes;
}

/**
 * WHS Score Adjusted: cap each hole at Net Double Bogey (par + 2 + strokes received).
 * Returns total adjusted gross, or null if any hole missing.
 */
function calcScoreAdjusted_(scores, pares, indices, courseHcp) {
  if (!scores || !pares || !indices) return null;
  const strokes = calcStrokesPerHole_(courseHcp, indices);
  let total = 0;
  for (let h = 0; h < 18; h++) {
    const sc = scores[h];
    const par = pares[h];
    const st = strokes[h] || 0;
    if (sc === null || sc === undefined || isNaN(sc) || sc <= 0) return null;
    if (!par) return null;
    const cap = par + 2 + st; // Net Double Bogey
    total += Math.min(parseInt(sc), cap);
  }
  return total;
}

/** WHS Diferencial = (Score Adjusted - Course Rating) × 113 / Slope */
function calcDiferencial_(scoreAdjusted, rating, slope) {
  if (scoreAdjusted === null || scoreAdjusted === undefined || isNaN(scoreAdjusted)) return null;
  if (!rating || !slope) return null;
  return ((scoreAdjusted - rating) * 113) / slope;
}

/**
 * WHS table: how many "best diferenciales" to use based on count (last 20).
 * Returns { count, adjust } where formula = avg(best `count`) + adjust.
 */
function getWhsTableEntry_(n) {
  if (n <= 2) return null;            // no HCP Index possible
  if (n === 3) return { count: 1, adjust: -2 };
  if (n === 4) return { count: 1, adjust: -1 };
  if (n === 5) return { count: 1, adjust: 0 };
  if (n === 6) return { count: 2, adjust: -1 };
  if (n <= 8)  return { count: 2, adjust: 0 };
  if (n <= 11) return { count: 3, adjust: 0 };
  if (n <= 14) return { count: 4, adjust: 0 };
  if (n <= 16) return { count: 5, adjust: 0 };
  if (n <= 18) return { count: 6, adjust: 0 };
  if (n === 19) return { count: 7, adjust: 0 };
  return { count: 8, adjust: 0 };     // 20+
}

/**
 * HCP Index calculation (WHS). diferenciales array must be sorted by date DESC.
 * Returns { hcpIndex: number, usedCount, totalCount } or null if not enough cards.
 */
function calcHcpIndex_(diferencialesDescOrder) {
  const valid = (diferencialesDescOrder || []).filter(d => d !== null && d !== undefined && !isNaN(d));
  if (valid.length < 3) return null;
  const last20 = valid.slice(0, 20);
  const cfg = getWhsTableEntry_(last20.length);
  if (!cfg) return null;
  const sorted = last20.slice().sort((a, b) => a - b);
  const bestN = sorted.slice(0, cfg.count);
  const sum = bestN.reduce((acc, v) => acc + v, 0);
  const avg = sum / bestN.length;
  const idx = avg + cfg.adjust;
  return {
    hcpIndex: Math.round(idx * 10) / 10, // 1 decimal
    usedCount: cfg.count,
    totalCount: last20.length,
    bestDiferenciales: bestN.map(d => Math.round(d * 10) / 10),
  };
}

/**
 * Read 2026 NGT TARJETAS sheet for one matricula.
 * Structure: A=FM, B=FECHA(nro), C=MATRICULA, D=NOMBRE, E=HCP, F=CANCHA(name), G=ID, H..Y=18 holes
 */
function getTarjetas2026Jugador_(matricula) {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return [];
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  const data = sh.getRange(2, 1, lr - 1, 25).getValues();
  const matStr = String(matricula).trim();
  const out = [];
  data.forEach(r => {
    const m = String(r[2] || '').trim();
    if (m !== matStr) return;
    const nroFecha = parseInt(r[1]);
    const hcp = r[4];
    const canchaId = String(r[6] || '').trim();
    const scores = r.slice(7, 25).map(s => (s === '' || s === null) ? null : parseInt(s));
    out.push({
      nroFecha: isNaN(nroFecha) ? null : nroFecha,
      cancha: canchaId,
      hcp: (hcp === '' || hcp === null) ? null : parseFloat(hcp),
      scores: scores,
      anio: 2026,
      esActual: true, // marker
    });
  });
  return out;
}

/**
 * Get tee color for each fecha 2026.
 * Reads from TARJETAS sheet, col AB (28) = COLOR_TEE (set when admin creates fecha).
 * If empty, defaults to BLANCAS.
 * Returns map: { nroFecha → COLOR_UPPERCASE }
 */
function getFechaColors2026_() {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return {};
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return {};
  // A(0)=fecha, Y(24)=colorTee
  const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();
  const map = {};
  data.forEach(function(r) {
    const n = parseInt(r[0]);
    const c = String(r[24] || '').trim().toUpperCase();
    if (!isNaN(n) && c && !map[n]) map[n] = c;
  });
  return map;
}

/**
 * Compute HCP NGT (WHS HCP Index) for a player using historic + 2026 cards.
 * Returns { hcpIndex, courseHcp_blancas, ... } or null if not enough data.
 */
function getHcpNGT_(matricula) {
  if (!matricula) return null;
  const matStr = String(matricula).trim();

  const ratingsMap = getRatingsMap_();
  if (!Object.keys(ratingsMap).length) return null;
  const canchasMap = getCanchasHistMap_();

  // 2026 fecha → color map
  const fechaColors = getFechaColors2026_();

  // Process all cards: compute diferencial per card, with their date for sort
  const allDiferenciales = []; // { fechaSort, diferencial, anio }

  // 1) Historic
  const tarjetasHist = getTarjetasHistJugador_(matStr);
  tarjetasHist.forEach(t => {
    const cancha = canchasMap[t.cancha];
    if (!cancha) return;
    const ratingInfo = lookupRating_(ratingsMap, t.cancha, TEE_DEFAULT);
    if (!ratingInfo) return;
    const sa = calcScoreAdjusted_(t.scores, cancha.pares, cancha.indices, t.hcp);
    if (sa === null) return;
    const diff = calcDiferencial_(sa, ratingInfo.rating, ratingInfo.slope);
    if (diff === null) return;
    const fechaSort = t.fechaReal instanceof Date ? t.fechaReal.getTime() : 0;
    allDiferenciales.push({
      fechaSort: fechaSort,
      diferencial: diff,
      anio: t.fechaReal instanceof Date ? t.fechaReal.getFullYear() : null,
      origen: 'hist',
    });
  });

  // 2) 2026
  const tarjetas2026 = getTarjetas2026Jugador_(matStr);
  tarjetas2026.forEach(t => {
    const cancha = canchasMap[t.cancha];
    if (!cancha) return;
    const color = fechaColors[t.nroFecha] || TEE_DEFAULT;
    const ratingInfo = lookupRating_(ratingsMap, t.cancha, color);
    if (!ratingInfo) return;
    const sa = calcScoreAdjusted_(t.scores, cancha.pares, cancha.indices, t.hcp);
    if (sa === null) return;
    const diff = calcDiferencial_(sa, ratingInfo.rating, ratingInfo.slope);
    if (diff === null) return;
    // 2026 cards always sort AFTER historic (use a base of year 2026 + nroFecha)
    const fechaSort = new Date(2026, 0, 1).getTime() + ((t.nroFecha || 0) * 86400000);
    allDiferenciales.push({
      fechaSort: fechaSort,
      diferencial: diff,
      anio: 2026,
      origen: '2026',
    });
  });

  if (!allDiferenciales.length) return null;

  // Sort DESC by date (most recent first)
  allDiferenciales.sort((a, b) => b.fechaSort - a.fechaSort);

  const diferenciales = allDiferenciales.map(d => d.diferencial);
  const result = calcHcpIndex_(diferenciales);
  if (!result) return null;

  return {
    hcpIndex: result.hcpIndex,
    usedCount: result.usedCount,
    totalCount: result.totalCount,
    cardsConsidered: allDiferenciales.length,
    bestDiferenciales: result.bestDiferenciales,
  };
}

/**
 * List available tee colors for a given canchaId from RATING sheet.
 * Returns array of { color, rating, slope }.
 */
function getColoresCancha_(canchaId) {
  if (!canchaId) return [];
  const map = getRatingsMap_();
  const c = map[String(canchaId).trim()];
  if (!c) return [];
  return Object.keys(c.byColor).map(color => ({
    color: color,
    rating: c.byColor[color].rating,
    slope: c.byColor[color].slope,
  }));
}

/**
 * Returns tee colors for ALL canchas at once: { [canchaId]: [{color, rating, slope}] }.
 * Used by the admin panel to pre-load all colors in a single API call, eliminating
 * the per-cancha call that was causing a visible delay every time the user picked a course.
 */
function getAllColoresCancha_() {
  const COLOR_ORDER = ['NEGRAS', 'AZULES', 'BLANCAS', 'DORADAS', 'ROJAS', 'AMARILLAS', 'AMARRILAS'];
  const map = getRatingsMap_();
  const result = {};
  Object.keys(map).forEach(function(id) {
    const colors = Object.keys(map[id].byColor).map(function(color) {
      return { color: color, rating: map[id].byColor[color].rating, slope: map[id].byColor[color].slope };
    });
    colors.sort(function(a, b) {
      const ia = COLOR_ORDER.indexOf(a.color);
      const ib = COLOR_ORDER.indexOf(b.color);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    result[id] = colors;
  });
  return result;
}

/* ════════════════════ end HCP NGT ════════════════════ */

// ════════════ HCP INDEX — Actualización semanal desde VistagolfSouth ════════════

/**
 * Calcula el handicap de juego (course handicap) a partir del HCP Index y el Slope.
 * Fórmula WHS: round(hcpIndex × slope / 113)
 * Opcional: + (courseRating - par) para mayor precisión.
 */
function calcHandicapJuego_(hcpIndex, slope, courseRating, par) {
  if (hcpIndex === null || hcpIndex === undefined || !slope) return null;
  let ch = hcpIndex * (slope / 113);
  if (courseRating && par) ch += (courseRating - par);
  return Math.round(ch);
}

/**
 * Consulta el HCP Index de un jugador en vistagolf.com.ar.
 * Retorna el valor float o null si no se encontró / error.
 */
function fetchHcpIndex_(matricula) {
  try {
    const url = 'http://www.vistagolf.com.ar/handicap/DiferencialesArg.asp'
              + '?strCampo=Campo1&strValor=' + encodeURIComponent(String(matricula).trim());
    const resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      deadline: 15,           // 15s máximo por request — evita colgar la ejecución
    });
    const code = resp.getResponseCode();
    if (code !== 200) {
      Logger.log('fetchHcpIndex_ [' + matricula + '] HTTP ' + code);
      return null;
    }
    // Página en ISO-8859-1 (ASP clásico en español)
    const html = resp.getContentText('ISO-8859-1');
    // El HCP Index aparece como "HCP Index: 17,5" (coma) o "17.5" (punto) según el idioma del sitio
    const m = html.match(/HCP\s+Index\s*:?\s*([0-9]+[.,][0-9]+|[0-9]+)/i);
    if (!m) {
      Logger.log('fetchHcpIndex_ [' + matricula + '] regex no match. HTML snippet: ' + html.substring(0, 300));
      return null;
    }
    const val = parseFloat(m[1].replace(',', '.'));  // normalizar coma → punto antes de parsear
    return isNaN(val) ? null : val;
  } catch(e) {
    Logger.log('fetchHcpIndex_ [' + matricula + '] exception: ' + e.message);
    return null;
  }
}

/**
 * TEST — ejecutar desde el editor para diagnosticar la conexión con vistagolf.
 * Cambiá MATRICULA_TEST por una matrícula real antes de correr.
 */
function testFetchHcpUno() {
  const MATRICULA_TEST = '89837'; // ← reemplazá con una matrícula real
  Logger.log('=== Test fetchHcpIndex_ ===');
  Logger.log('Matrícula: ' + MATRICULA_TEST);
  const url = 'http://www.vistagolf.com.ar/handicap/DiferencialesArg.asp'
            + '?strCampo=Campo1&strValor=' + encodeURIComponent(String(MATRICULA_TEST).trim());
  Logger.log('URL: ' + url);
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, deadline: 15 });
    Logger.log('HTTP code: ' + resp.getResponseCode());
    const html = resp.getContentText('ISO-8859-1');
    Logger.log('Response length: ' + html.length);
    Logger.log('First 500 chars: ' + html.substring(0, 500));
    const m = html.match(/HCP\s+Index\s*:?\s*([0-9]+\.?[0-9]*)/i);
    Logger.log('Regex match: ' + JSON.stringify(m));
    Logger.log('HCP Index resultado: ' + (m ? parseFloat(m[1]) : 'NO ENCONTRADO'));
  } catch(e) {
    Logger.log('ERROR: ' + e.message);
  }
}

/**
 * Actualiza el HCP Index de todos los jugadores consultando vistagolf.com.ar.
 * Se puede llamar:
 *   (a) Desde el admin vía API: params = { adminKey }
 *   (b) Desde el trigger semanal: params = null
 * Escribe en JUGADORES col E = HCP Index, col F = fecha de actualización.
 */
function actualizarHcpIndices_(params) {
  if (params && params.adminKey && !checkAdmin_(params.adminKey)) {
    return { ok: false, error: 'No autorizado' };
  }
  const jugSh = getSheet_(SHEETS.JUGADORES);
  if (!jugSh) return { ok: false, error: 'No se encontró hoja JUGADORES' };

  const data   = jugSh.getDataRange().getValues();
  const now    = new Date();
  const nowStr = Utilities.formatDate(now, 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
  const results = { updated: 0, notFound: 0, details: [] };

  // Recolectar jugadores con matrícula válida
  const players = [];
  for (let i = 1; i < data.length; i++) {
    const mat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (!mat) continue;
    players.push({ sheetRow: i + 1, mat: mat });
  }
  if (!players.length) return { ok: true, updated: 0, notFound: 0, details: [] };

  // Construir requests para fetchAll — todos los jugadores en paralelo
  const requests = players.map(p => ({
    url: 'http://www.vistagolf.com.ar/handicap/DiferencialesArg.asp'
       + '?strCampo=Campo1&strValor=' + encodeURIComponent(p.mat),
    muteHttpExceptions: true,
    followRedirects: true,
    deadline: 10,   // 10s timeout por jugador — en paralelo, no se acumulan
  }));

  // Ejecutar todos los requests en paralelo (UrlFetchApp.fetchAll)
  let responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch(e) {
    return { ok: false, error: 'Error al consultar vistagolf: ' + e.message };
  }

  const hcpCol = COL_J.HCP_INDEX  + 1; // col E (1-based)
  const updCol = COL_J.HCP_UPDATED + 1; // col F (1-based)

  responses.forEach(function(resp, idx) {
    const p = players[idx];
    try {
      if (resp.getResponseCode() !== 200) {
        results.notFound++;
        results.details.push({ mat: p.mat, hcpIndex: null, err: 'HTTP ' + resp.getResponseCode() });
        return;
      }
      const html = resp.getContentText('ISO-8859-1');
      const m    = html.match(/HCP\s+Index\s*:?\s*([0-9]+[.,][0-9]+|[0-9]+)/i);
      if (!m) {
        results.notFound++;
        results.details.push({ mat: p.mat, hcpIndex: null, err: 'no match' });
        return;
      }
      const val = parseFloat(m[1].replace(',', '.'));
      if (isNaN(val)) {
        results.notFound++;
        results.details.push({ mat: p.mat, hcpIndex: null, err: 'NaN' });
        return;
      }
      jugSh.getRange(p.sheetRow, hcpCol).setValue(val);
      jugSh.getRange(p.sheetRow, updCol).setValue(nowStr);
      results.updated++;
      results.details.push({ mat: p.mat, hcpIndex: val });
    } catch(e2) {
      results.notFound++;
      results.details.push({ mat: p.mat, hcpIndex: null, err: e2.message });
    }
  });

  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().remove('jugadores'); } catch(e) {}
  audit_('ACTUALIZAR_HCP_INDICES', (params && params.adminKey) ? 'admin' : 'trigger',
    { updated: results.updated, notFound: results.notFound, date: nowStr });
  return { ok: true, updated: results.updated, notFound: results.notFound, details: results.details };
}

/**
 * Entry point para el trigger de tiempo.
 * Se registra como handler en crearTriggerJueves().
 */
function triggerActualizarHcp() {
  actualizarHcpIndices_(null);
}

/**
 * Crea (o recrea) el trigger semanal del jueves a las 8am Argentina.
 * EJECUTAR UNA VEZ desde el editor de Apps Script (Run → crearTriggerJueves).
 * Requiere que el huso horario del proyecto esté en America/Argentina/Buenos_Aires
 * (Project Settings → Time zone).
 */
function crearTriggerJueves() {
  // Eliminar triggers anteriores del mismo handler para evitar duplicados
  ScriptApp.getProjectTriggers()
    .filter(function(t){ return t.getHandlerFunction() === 'triggerActualizarHcp'; })
    .forEach(function(t){ ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('triggerActualizarHcp')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(8)   // 8am en la TZ del proyecto (Buenos Aires)
    .create();

  Logger.log('Trigger creado: triggerActualizarHcp — jueves 8am');
}

// ════════════ fin HCP INDEX ════════════

/**
 * Recalcula y sobreescribe el HCP de juego (col E de TARJETAS) para todos los jugadores
 * de una fecha, usando la fórmula WHS completa: round(HCPindex × slope/113 + (rating−par)).
 * Útil cuando la fecha fue creada con una versión anterior del código sin el ajuste (rating−par).
 */
function recalcularHcpFecha_(params) {
  const { adminKey, fecha } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return { ok: false, error: 'TARJETAS vacía' };

  // A(0)=fecha, B(1)=mat, C(2)=hcp, D(3)=canchaId, E..V(4..21)=H1..H18, W(22)=LD, X(23)=BA, Y(24)=colorTee
  const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();

  // Leer canchaId + colorTee de las filas de esta fecha
  var canchaId = '', colorTee = 'BLANCAS';
  for (var ri = 0; ri < data.length; ri++) {
    var row = data[ri];
    if (String(row[0] || '').trim() !== String(fecha)) continue;
    if (!canchaId) canchaId = String(row[3] || '').trim();
    var ct = String(row[24] || '').trim().toUpperCase();
    if (ct) colorTee = ct;
    if (canchaId && colorTee !== 'BLANCAS') break;
  }

  if (!canchaId) {
    return { ok: false, error: 'No se encontró cancha para fecha ' + fecha };
  }

  var hcpInfo = buildHcpJuegoMap_(canchaId, '', colorTee);
  if (!hcpInfo || !Object.keys(hcpInfo.hcpMap).length) {
    return { ok: false, error: 'Sin datos de slope/rating para canchaId ' + canchaId + ' (' + colorTee + ')' };
  }

  var updated = 0;
  data.forEach(function(row, i) {
    var f = String(row[0] || '').trim();
    var m = String(row[1] || '').trim();
    if (f !== String(fecha) || !m || m.indexOf('INV') === 0) return;
    var newHcp = hcpInfo.hcpMap[m];
    if (newHcp !== undefined) {
      sh.getRange(i + 2, 3).setValue(newHcp); // col C = hcp
      updated++;
    }
  });

  return {
    ok: true,
    data: {
      cancha: canchaName,
      colorTee: colorTee,
      slope: hcpInfo.slope,
      rating: hcpInfo.rating,
      par: hcpInfo.par,
      ajuste: hcpInfo.rating !== null && hcpInfo.par !== null ? +(hcpInfo.rating - hcpInfo.par).toFixed(1) : null,
      updated: updated,
    }
  };
}