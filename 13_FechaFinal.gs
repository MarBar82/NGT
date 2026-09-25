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
 * Calcula el ranking de la clasificación general de la temporada: para cada
 * jugador de JUGADORES, su puesto (1 = mejor) según la suma de puntos de las
 * 8 fechas regulares (st+ma+pb+db), con el mismo criterio de desempate que ya
 * usa la hoja LEADERBOARD. Se recalcula siempre desde los puntos reales (no
 * lee el orden ya guardado en LEADERBOARD), así queda sincronizado incluso si
 * LEADERBOARD no se refrescó después del último cambio de puntos.
 * Devuelve { matricula: puesto }. Reutilizada por getGolpesFavorMap_ y por
 * armarLineasFinalDia1_ (orden de salida del Día 1 de la Final).
 */
function computeSeasonRanking_() {
  const jugs = getJugadores_();
  const playerMats = jugs.map(function(j) { return j.matricula; });
  const rankMap = {};
  if (!playerMats.length) return rankMap;

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

  playerMats.forEach(function(mat, i) {
    let rank = 1;
    for (let j = 0; j < cVals.length; j++) { if (cVals[j] > cVals[i]) rank++; }
    let cntBefore = 0;
    for (let j = 0; j <= i; j++) { if (cVals[j] === cVals[i]) cntBefore++; }
    rankMap[mat] = rank + cntBefore - 1;
  });
  return rankMap;
}

/**
 * Devuelve, para los primeros 8 puestos de la clasificación general (según
 * computeSeasonRanking_), los golpes a favor cargados a mano en
 * LEADERBOARD!M2:M9 — un valor por puesto, ya en formato "listo para sumar"
 * (negativo = descuento).
 */
function getGolpesFavorMap_() {
  const rankMap = computeSeasonRanking_();
  const matsByRank = {};
  Object.keys(rankMap).forEach(function(mat) { matsByRank[rankMap[mat]] = mat; });

  const lbSh = getSheet_('LEADERBOARD');
  const golpesMap = {};
  if (lbSh) {
    const golpesVals = lbSh.getRange(2, 13, 8, 1).getValues(); // M2:M9
    for (let pos = 1; pos <= 8; pos++) {
      const mat = matsByRank[pos];
      if (!mat) continue;
      const raw = golpesVals[pos - 1][0];
      const val = (raw === '' || raw === null || raw === undefined) ? 0 : (parseFloat(raw) || 0);
      golpesMap[mat] = val;
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

/**
 * calcularTamanosGruposFinal_ — tamaños de los grupos de salida para la
 * Final, PREFIRIENDO grupos de 4 (a diferencia de las fechas regulares
 * "gestionadas", que prefieren 3). Solo usa grupos de 3 para absorber el
 * resto cuando N no es múltiplo de 4. Devuelve un array ordenado de "mejor
 * puesto" a "peor puesto" (ej. N=13 → [4,3,3,3]: el grupo de 4 se arma con
 * los 4 mejores puestos, los 3 grupos de 3 con el resto).
 */
function calcularTamanosGruposFinal_(n) {
  if (n <= 0) return [];
  if (n <= 5) return [n]; // muy pocos jugadores: un solo grupo
  const r = n % 4;
  let numFour, numThree;
  if (r === 0) { numFour = n / 4; numThree = 0; }
  else if (r === 1) { numFour = (n - 9) / 4; numThree = 3; } // n>=9 siempre acá (n<=5 ya salió antes)
  else if (r === 2) { numFour = (n - 6) / 4; numThree = 2; }
  else { numFour = (n - 3) / 4; numThree = 1; }
  const sizes = [];
  for (let i = 0; i < numFour; i++) sizes.push(4);
  for (let i = 0; i < numThree; i++) sizes.push(3);
  return sizes;
}

/**
 * armarLineasFinalDia1_ — arma las líneas de salida del Día 1 de la Final.
 * Orden: por clasificación general de la temporada (computeSeasonRanking_),
 * mejor puesto primero; los invitados van al final (no tienen puesto). Los
 * grupos se arman preferentemente de 4 (calcularTamanosGruposFinal_); si hay
 * que usar algún grupo de 3, queda del lado de los peores puestos/invitados.
 * Para el orden de salida se INVIERTE el resultado: el grupo con los peores
 * puestos sale primero (Línea 1) y los líderes salen últimos.
 */
function armarLineasFinalDia1_(params) {
  const { adminKey } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };

  const meta = getFinalMeta_();
  if (!meta) return { ok: false, error: 'No hay ninguna Fecha Final creada' };
  if (meta.estado !== 'armada') {
    return { ok: false, error: 'Las líneas del Día 1 ya fueron armadas (estado actual: ' + meta.estado + ')' };
  }

  const rankMap = computeSeasonRanking_();
  const clasificados = (meta.jugadores || []).slice();
  clasificados.sort(function(a, b) {
    const ra = rankMap[a] !== undefined ? rankMap[a] : 999999;
    const rb = rankMap[b] !== undefined ? rankMap[b] : 999999;
    return ra - rb;
  });
  const invitadosMats = Object.keys(meta.invitadosInfo || {});
  const ordered = clasificados.concat(invitadosMats); // mejor puesto ... peor puesto / invitados

  const n = ordered.length;
  if (n < 2) return { ok: false, error: 'Se necesitan al menos 2 jugadores para armar líneas' };

  // HCP del Día 1, ya calculado y guardado en TARJETAS FINAL al crear la fecha
  const sh = getSheet_(FINAL_SHEET_NAME);
  const hcpDia1 = {};
  if (sh) {
    const lastRow = sh.getLastRow();
    if (lastRow > 1) {
      const rows = sh.getRange(2, 1, lastRow - 1, 3).getValues(); // DIA, MATRICULA, HCP
      rows.forEach(function(r) {
        if (String(r[0]) === '1') hcpDia1[String(r[1])] = r[2];
      });
    }
  }

  // Apodos/nombres para mostrar
  const jugs = getJugadores_();
  const matToApodo = {};
  jugs.forEach(function(j) {
    matToApodo[j.matricula] = (j.apodo || (j.nombre ? j.nombre.split(' ')[0] : j.matricula) || '').toUpperCase();
  });

  const sizes = calcularTamanosGruposFinal_(n); // mejor puesto → peor puesto
  const blocks = [];
  let idx = 0;
  sizes.forEach(function(size) {
    blocks.push(ordered.slice(idx, idx + size));
    idx += size;
  });
  blocks.reverse(); // Línea 1 = peores puestos (sale primero) ... última línea = líderes

  const lineas = blocks.map(function(grp, i) {
    return {
      lineNum: i + 1,
      players: grp.map(function(mat) {
        const esInvitado = mat.indexOf('INV') === 0;
        return {
          matricula: mat,
          apodo: esInvitado ? (meta.invitadosInfo[mat] || mat) : (matToApodo[mat] || mat),
          hcp: hcpDia1[mat] !== undefined ? hcpDia1[mat] : '',
          invitado: esInvitado,
        };
      }),
    };
  });

  meta.lineasDia1 = lineas;
  meta.estado = 'dia1_en_curso';
  saveFinalMeta_(meta);

  audit_('ARMAR_LINEAS_FINAL_DIA1', 'admin', { lineas: lineas.length, jugadores: n });

  return { ok: true, lineas: lineas };
}
