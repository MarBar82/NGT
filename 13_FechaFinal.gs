// ════════════ FECHA FINAL (36 hoyos, Medal Play) ════════════
// Estructura separada de las fechas regulares: la Final son 2 días + 2 canchas,
// mientras que una "fecha" normal es 1 día + 1 cancha. Para no tocar ni arriesgar
// el sistema de Stableford + Match que ya funciona, la Final vive en su propia
// hoja (TARJETAS FINAL) y su propia metadata (Document Properties, clave
// FINAL_META) — mismo patrón que ya usa FECHA_META para las fechas regulares.

const FINAL_SHEET_NAME = 'TARJETAS FINAL';

function ensureFinalSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FINAL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(FINAL_SHEET_NAME);
    const headers = ['DIA', 'MATRICULA', 'HCP', 'ID CANCHA', 'COLOR TEE'];
    for (let h = 1; h <= 18; h++) headers.push('HOYO ' + h);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getFinalMeta_() {
  const props = PropertiesService.getDocumentProperties();
  return JSON.parse(props.getProperty('FINAL_META') || 'null');
}

function saveFinalMeta_(meta) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('FINAL_META', JSON.stringify(meta));
}

/**
 * Calcula el ranking de la clasificación general de la temporada (mismo criterio
 * que ya usa la hoja LEADERBOARD para ordenar) y devuelve, para los primeros 8
 * puestos, los golpes a favor cargados a mano en LEADERBOARD!M2:M9 — un valor
 * por puesto, ya en formato "listo para sumar" (negativo = descuento).
 * No confía en el ORDEN que ya esté guardado en LEADERBOARD (lo recalcula desde
 * los puntos reales), solo lee de ahí la columna M — así siempre queda
 * sincronizado con los puntos actuales, incluso si LEADERBOARD no se refrescó
 * después del último cambio de puntos.
 */
function getGolpesFavorMap_() {
  const jugs = getJugadores_();
  const playerMats = jugs.map(function(j) { return j.matricula; });
  const numP = playerMats.length;
  if (!numP) return {};

  const ngtRows = getAllNGTScoreData_();
  const ngtMap = {};
  ngtRows.forEach(function(r) {
    if (!ngtMap[r.mat]) ngtMap[r.mat] = {};
    ngtMap[r.mat][r.fecha] = r;
  });

  const cVals = playerMats.map(function(mat) {
    const playerFdMap = ngtMap[mat] || {};
    let total = 0;
    for (let n = 1; n <= 8; n++) {
      const fd = playerFdMap[String(n)] || { st: 0, ma: 0, pb: 0, db: 0 };
      total += (fd.st || 0) + (fd.ma || 0) + (fd.pb || 0) + (fd.db || 0);
    }
    return total;
  });

  const allRanks = cVals.map(function(ci, i) {
    let rank = 1;
    for (let j = 0; j < cVals.length; j++) { if (cVals[j] > ci) rank++; }
    let cntBefore = 0;
    for (let j = 0; j <= i; j++) { if (cVals[j] === ci) cntBefore++; }
    return rank + cntBefore - 1;
  });

  const lbSh = getSheet_('LEADERBOARD');
  const golpesMap = {};
  if (lbSh) {
    const golpesVals = lbSh.getRange(2, 13, 8, 1).getValues(); // M2:M9
    for (let pos = 1; pos <= 8; pos++) {
      const idx = allRanks.indexOf(pos);
      if (idx < 0) continue;
      const mat = playerMats[idx];
      const raw = golpesVals[pos - 1][0];
      const val = (raw === '' || raw === null || raw === undefined) ? 0 : (parseFloat(raw) || 0);
      if (mat) golpesMap[mat] = val;
    }
  }
  return golpesMap;
}

/**
 * crearFechaFinal_ — Admin crea la Fecha Final: 2 canchas (una por día), calcula
 * el hándicap de juego de cada jugador en cada cancha, y guarda una copia
 * ("congelada") de los golpes a favor vigentes en LEADERBOARD!M2:M9.
 * params: { adminKey, canchaId1, colorTee1, canchaId2, colorTee2,
 *           jugadores:[matricula,...], invitados:[nombre,...] }
 */
function crearFechaFinal_(params) {
  const { adminKey, canchaId1, colorTee1, canchaId2, colorTee2, jugadores, invitados } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!canchaId1 || !canchaId2) return { ok: false, error: 'Faltan las 2 canchas' };
  if ((!jugadores || !jugadores.length) && (!invitados || !invitados.length)) {
    return { ok: false, error: 'Faltan jugadores' };
  }

  const existing = getFinalMeta_();
  if (existing && existing.estado) {
    return { ok: false, error: 'Ya existe una Fecha Final activa. Eliminala primero si querés volver a crearla.' };
  }

  const canchaName1 = lookupCanchaName_(canchaId1);
  const canchaName2 = lookupCanchaName_(canchaId2);
  if (!canchaName1) return { ok: false, error: 'Cancha del Día 1 no encontrada: ' + canchaId1 };
  if (!canchaName2) return { ok: false, error: 'Cancha del Día 2 no encontrada: ' + canchaId2 };

  const colorFinal1 = String(colorTee1 || 'BLANCAS').trim().toUpperCase();
  const colorFinal2 = String(colorTee2 || 'BLANCAS').trim().toUpperCase();

  const hcpInfo1 = buildHcpJuegoMap_(canchaId1, canchaName1, colorFinal1);
  const hcpInfo2 = buildHcpJuegoMap_(canchaId2, canchaName2, colorFinal2);
  if (!hcpInfo1 || !hcpInfo1.par) return { ok: false, error: 'No se encontró rating/par para la cancha del Día 1' };
  if (!hcpInfo2 || !hcpInfo2.par) return { ok: false, error: 'No se encontró rating/par para la cancha del Día 2' };
  const hcpMap1 = hcpInfo1.hcpMap, hcpMap2 = hcpInfo2.hcpMap;

  const sh = ensureFinalSheet_();

  const mats = Array.isArray(jugadores) ? jugadores.map(String) : [];
  const invitadosInfo = {};
  const baseTs = Date.now();
  const invMats = [];
  if (Array.isArray(invitados)) {
    invitados.forEach(function(nombre, idx) {
      const n = String(nombre || '').trim();
      if (!n) return;
      const mat = 'INV' + baseTs + idx;
      invitadosInfo[mat] = n;
      invMats.push(mat);
    });
  }
  const allMats = mats.concat(invMats);
  if (!allMats.length) return { ok: false, error: 'Faltan jugadores' };

  // Filas: 1 por jugador y por día (día 1 primero, después día 2)
  const rows = [];
  allMats.forEach(function(mat) {
    const hcp1 = (hcpMap1[mat] !== undefined) ? hcpMap1[mat] : '';
    rows.push([1, mat, hcp1, canchaId1, colorFinal1].concat(new Array(18).fill('')));
  });
  allMats.forEach(function(mat) {
    const hcp2 = (hcpMap2[mat] !== undefined) ? hcpMap2[mat] : '';
    rows.push([2, mat, hcp2, canchaId2, colorFinal2].concat(new Array(18).fill('')));
  });
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

  const golpesFavor = getGolpesFavorMap_();

  const meta = {
    estado: 'armada', // armada | dia1_en_curso | dia1_cerrado | dia2_en_curso | finalizada
    canchaId1: canchaId1, canchaName1: canchaName1, colorTee1: colorFinal1, par1: hcpInfo1.par,
    canchaId2: canchaId2, canchaName2: canchaName2, colorTee2: colorFinal2, par2: hcpInfo2.par,
    jugadores: mats,
    invitadosInfo: invitadosInfo,
    golpesFavor: golpesFavor, // { matricula: valor } — copia congelada, no se recalcula después
    lineasDia1: [],
    lineasDia2: [],
    creadoEn: new Date().toISOString(),
  };
  saveFinalMeta_(meta);

  audit_('CREAR_FECHA_FINAL', 'admin', { canchaId1: canchaId1, canchaId2: canchaId2, jugadores: mats, invitados: invMats.length, golpesFavor: golpesFavor });

  return { ok: true, jugadores: mats.length, invitados: invMats.length, par1: hcpInfo1.par, par2: hcpInfo2.par, golpesFavor: golpesFavor };
}

/**
 * eliminarFechaFinal_ — Admin borra la Fecha Final por completo (los 2 días
 * juntos, todo o nada), para poder probar el flujo sin miedo a romper nada.
 * Deja el sistema como si nunca se hubiera creado.
 */
function eliminarFechaFinal_(params) {
  const { adminKey } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };

  const meta = getFinalMeta_();
  if (!meta) return { ok: false, error: 'No hay ninguna Fecha Final creada' };

  const sh = getSheet_(FINAL_SHEET_NAME);
  if (sh) {
    const lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
  }
  PropertiesService.getDocumentProperties().deleteProperty('FINAL_META');

  audit_('ELIMINAR_FECHA_FINAL', 'admin', { canchaId1: meta.canchaId1, canchaId2: meta.canchaId2 });

  return { ok: true };
}
