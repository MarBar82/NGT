/**
 * NUMA GOLF TOUR — Apps Script Backend v5
 */

// ════════════ CONFIG ════════════
const ADMIN_KEY = '89837';
const ADMIN_MATRICULA = '89837';

const SHEETS = {
  TARJETAS:  'TARJETAS',
  MATCH:     'MATCH',
  JUGADORES: 'JUGADORES',
  CANCHAS:   'CANCHAS',
  FECHAS:    'FECHAS',
  SCORE:     'SCORE',
  AUDIT:     '_AUDIT',
};

const COL_J = { ORDEN: 0, MATRICULA: 1, NOMBRE: 2, APODO: 3 };
const COL_C = { ID: 0, NOMBRE: 1 };

// ════════════ UTILS ════════════
function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonpResponse_(callback, obj) {
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
/**
 * Cache wrapper for read-only endpoints that rarely change.
 * @param key  cache key
 * @param ttl  seconds (max 21600 = 6h)
 * @param fn   producer function
 */
function cachedRead_(key, ttl, fn) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(key);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    const result = fn();
    if (result !== null && result !== undefined) {
      try {
        const serialized = JSON.stringify(result);
        if (serialized.length < 99000) {  // CacheService limit ~100KB
          cache.put(key, serialized, ttl);
        }
      } catch (e) {}
    }
    return result;
  } catch (e) {
    return fn();
  }
}

function audit_(action, who, details) {
  try {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(SHEETS.AUDIT);
    if (!sh) {
      sh = ss.insertSheet(SHEETS.AUDIT);
      sh.appendRow(['Timestamp', 'Action', 'Who', 'Details']);
      sh.hideSheet();
    }
    sh.appendRow([new Date(), action, who, JSON.stringify(details)]);
  } catch (e) {}
}
function getSheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function findNextEmptyRow_(sh, col) {
  const maxScan = 500;
  const values = sh.getRange(2, col, maxScan, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const v = values[i][0];
    if (v === '' || v === null || v === undefined) {
      return i + 2;
    }
  }
  return maxScan + 2;
}

// ════════════ AUTH ════════════
function checkAdmin_(key) { return String(key).trim() === ADMIN_KEY; }
function checkPlayer_(matricula, apodo) {
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return false;
  const data = sh.getDataRange().getValues();
  const matStr = String(matricula).trim();
  const apoStr = String(apodo).trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][COL_J.MATRICULA] || '').trim();
    const a = String(data[i][COL_J.APODO] || '').trim().toUpperCase();
    if (m === matStr && a === apoStr) {
      return {
        matricula: m,
        nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
        apodo: String(data[i][COL_J.APODO] || '').trim(),
      };
    }
  }
  return false;
}

function checkPlayerByMat_(matricula) {
  // Login solo con matrícula
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return false;
  const data = sh.getDataRange().getValues();
  const matStr = String(matricula).trim();
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][COL_J.MATRICULA] || '').trim();
    if (m === matStr) {
      return {
        matricula: m,
        nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
        apodo: String(data[i][COL_J.APODO] || '').trim(),
      };
    }
  }
  return false;
}

// ════════════ READS ════════════
function getJugadores_() {
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][COL_J.MATRICULA] || '').trim();
    if (!m) continue;
    out.push({
      matricula: m,
      nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
      apodo: String(data[i][COL_J.APODO] || '').trim(),
    });
  }
  return out;
}

function getCanchas_() {
  const sh = getSheet_(SHEETS.CANCHAS);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  const out = [];
  data.forEach(row => {
    const id = row[0];
    const nombre = row[1];
    if (id === '' || id === null || id === undefined) return;
    if (!nombre || String(nombre).trim() === '') return;
    out.push({ id: String(id), nombre: String(nombre).trim() });
  });
  return out;
}

function lookupCanchaName_(id) {
  const canchas = getCanchas_();
  const match = canchas.find(c => String(c.id) === String(id));
  return match ? match.nombre : '';
}

function lookupJugadorName_(matricula) {
  const jugs = getJugadores_();
  const match = jugs.find(j => String(j.matricula) === String(matricula));
  return match ? match.nombre : '';
}

// ════════ SCORE SHEET HELPERS ════════
// SCORE!A2:AW20
// A=matricula, B=nombre, C=total, D=ranking
// E/F/G/H = ST/MA/PB/DB for fecha 1
// I/J/K/L = ST/MA/PB/DB for fecha 2
// ... pattern: (fecha n) starts at col (4*n + 1) = 5, 9, 13, 17, 21, 25, 29, 33
//      so DB for fecha n is at col (4*n + 4) = 8, 12, 16, 20, 24, 28, 32, 36
// AT = col 46 = global "already used" checkbox

function getScoreRowForMat_(matricula) {
  const sh = getSheet_('SCORE');
  if (!sh) return -1;
  const data = sh.getRange(2, 1, 19, 1).getValues(); // A2:A20
  for (let i = 0; i < data.length; i++) {
    const m = String(data[i][0] || '').trim();
    if (m === String(matricula)) return i + 2;
  }
  return -1;
}

function getDbColForFecha_(fechaNum) {
  const n = parseInt(fechaNum);
  if (!n || n < 1 || n > 8) return -1;
  // Fecha 1 DB → col H = 8
  // Fecha 2 DB → col L = 12
  // Formula: 4*n + 4
  return 4 * n + 4;
}

function getJugadoresConDobleDisponible_() {
  // Returns list of matriculas that have NOT used their doble yet
  // Check SCORE column AT (col 46) — TRUE means already used
  const sh = getSheet_('SCORE');
  if (!sh) return [];
  const data = sh.getRange(2, 1, 19, 46).getValues(); // A2:AT20
  const available = [];
  data.forEach(row => {
    const mat = String(row[0] || '').trim();
    if (!mat) return;
    // Check various TRUE representations — checkbox, formula result, text
    const v = row[45];
    const isTrue = (v === true)
      || (v === 1)
      || (v === 'TRUE')
      || (v === 'VERDADERO')
      || (typeof v === 'string' && v.toUpperCase() === 'TRUE')
      || (typeof v === 'string' && v.toUpperCase() === 'VERDADERO');
    if (!isTrue) available.push(mat);
  });
  return available;
}

// Debug endpoint: see raw values of column AT
function debugDobles_() {
  const sh = getSheet_('SCORE');
  if (!sh) return { error: 'SCORE no existe' };
  const data = sh.getRange(2, 1, 19, 46).getValues();
  const out = [];
  data.forEach(row => {
    const mat = String(row[0] || '').trim();
    if (!mat) return;
    out.push({
      matricula: mat,
      nombre: row[1],
      AT_value: row[45],
      AT_type: typeof row[45],
    });
  });
  return out;
}

function setDobleForFecha_(matricula, fecha) {
  // Mark DB=TRUE in the SCORE row for this matricula at this fecha's column
  const sh = getSheet_('SCORE');
  if (!sh) return { ok: false, error: 'SCORE no encontrada' };
  const row = getScoreRowForMat_(matricula);
  if (row < 0) return { ok: false, error: 'Matrícula no está en SCORE' };
  const col = getDbColForFecha_(fecha);
  if (col < 0) return { ok: false, error: 'Fecha inválida' };
  sh.getRange(row, col).setValue(true);
  return { ok: true };
}

/**
 * Returns the ST column index for a given fecha number.
 * Fecha 1 ST = col E = 5, Fecha 2 ST = col I = 9, ... Pattern: 4*n + 1
 */
function getStColForFecha_(fechaNum) {
  const n = parseInt(fechaNum);
  if (!n || n < 1 || n > 8) return -1;
  return 4 * n + 1;
}

/**
 * Read the ST value from SCORE for a player at a given fecha.
 * Returns null if not found or empty.
 */
function getStForPlayerInFecha_(matricula, fecha) {
  const sh = getSheet_('SCORE');
  if (!sh) return null;
  const row = getScoreRowForMat_(matricula);
  if (row < 0) return null;
  const col = getStColForFecha_(fecha);
  if (col < 0) return null;
  const v = sh.getRange(row, col).getValue();
  if (v === '' || v === null || v === undefined) return null;
  const num = parseFloat(String(v).replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Write the ST score (single, not doubled) for the player into SCORE!AU
 * AU = column 47 — used by the leaderboard formula to display the doble points
 */
function writeDobleStScore_(matricula, fecha) {
  const sh = getSheet_('SCORE');
  if (!sh) return { ok: false, error: 'SCORE no encontrada' };
  const row = getScoreRowForMat_(matricula);
  if (row < 0) return { ok: false, error: 'Matrícula no está en SCORE' };

  // Need to flush pending writes so SCORE formulas recalculate before reading ST
  SpreadsheetApp.flush();

  const stVal = getStForPlayerInFecha_(matricula, fecha);
  if (stVal === null) return { ok: false, error: 'No se pudo leer ST de fecha ' + fecha };

  sh.getRange(row, 47).setValue(stVal); // AU = col 47
  return { ok: true, st: stVal };
}

/**
 * Read Stableford rankings for a specific fecha from STB sheet.
 * STB!A:K — col B=fecha, col C=matricula, col D=nombre, col K=stableford total
 * Returns array ordered by stableford descending.
 */
function getStableforFromSTB_(fecha) {
  const sh = getSheet_('STB');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // Read cols B-K (10 cols, starting at col 2)
  const data = sh.getRange(2, 2, lastRow - 1, 10).getValues();

  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  const out = [];
  data.forEach(row => {
    const f = String(row[0] || '').trim();  // col B
    const m = String(row[1] || '').trim();  // col C
    const n = String(row[2] || '').trim();  // col D
    const stb = row[9];                     // col K (index 9 within the 10-col slice)
    if (f !== String(fecha) || !m) return;
    const stbNum = parseFloat(String(stb || '').replace(',', '.'));
    if (isNaN(stbNum)) return;
    const j = jugMap[m];
    out.push({
      matricula: m,
      nombre: j ? j.nombre : n,
      apodo: j ? j.apodo : '',
      stb: stbNum,
    });
  });
  // Sort by stb desc
  out.sort((a, b) => b.stb - a.stb);
  return out;
}

/**
 * Read HCP for every player of a given fecha from TARJETAS
 * Returns map: matricula -> hcp (integer) or null if not cargado
 */
function getHcpsForFecha_(fecha) {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return {};
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return {};
  const data = sh.getRange(2, 2, nextEmpty - 2, 4).getValues(); // B,C,D,E
  const out = {};
  data.forEach(row => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    const hcp = row[3];
    if (f !== String(fecha) || !m) return;
    const h = parseFloat(String(hcp || '').replace(',', '.'));
    out[m] = isNaN(h) ? null : h;
  });
  return out;
}

/**
 * Get the bonus winners (LD and BA) for a fecha.
 * Reads cols Z (LD) and AA (BA) in TARJETAS.
 */
function getBonusWinnersDetailed_(fecha) {
  return getBonusWinners_(fecha); // already defined
}

/**
 * Get cancha name for a fecha (reads first row of that fecha in TARJETAS)
 */
function getCanchaForFecha_(fecha) {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return '';
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return '';
  const data = sh.getRange(2, 2, nextEmpty - 2, 5).getValues(); // B..F
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][0] || '').trim();
    const c = String(data[i][4] || '').trim();
    if (f === String(fecha) && c) return c;
  }
  return '';
}

/**
 * Get all matches for a fecha with full scores (for Match Play calculation in the frontend).
 * Reads MATCH!D..X : D=jugador, E=hcp85, F-W=H1-H18, X=resultado
 */
function getMatchesFullForFecha_(fecha) {
  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return [];
  const nextEmpty = findNextEmptyRow_(sh, 4);
  if (nextEmpty <= 2) return [];
  // cols B(fecha), D(jugador), E(hcp), F-W(scores H1-H18), X(resultado)
  // Read B through X : cols 2..24
  const data = sh.getRange(2, 2, nextEmpty - 2, 23).getValues();

  const matches = [];
  for (let i = 0; i < data.length; i += 2) {
    const rowA = data[i];
    const rowB = i + 1 < data.length ? data[i + 1] : null;
    if (!rowB) break;
    const fA = String(rowA[0] || '').trim();
    const fB = String(rowB[0] || '').trim();
    if (fA !== String(fecha) || fB !== String(fecha)) continue;
    const nameA = String(rowA[2] || '').trim(); // col D
    const nameB = String(rowB[2] || '').trim();
    if (!nameA || !nameB) continue;

    matches.push({
      j1Name: nameA,
      j2Name: nameB,
      j1Hcp: rowA[3],            // col E
      j2Hcp: rowB[3],
      j1Scores: rowA.slice(4, 22), // F..W — 18 hoyos
      j2Scores: rowB.slice(4, 22),
      j1Result: rowA[22],         // col X
      j2Result: rowB[22],
    });
  }
  return matches;
}

/**
 * Returns a list of ALL active fechas with a "completa" flag.
 * A fecha is "completa" if every player has HCP loaded (tarjeta firmada)
 */
function getFechasConEstado_() {
  const fechas = getFechasActivas_();
  const result = [];
  fechas.forEach(f => {
    const hcps = getHcpsForFecha_(f);
    const totalJugs = Object.keys(hcps).length;
    const firmados = Object.values(hcps).filter(h => h !== null).length;
    result.push({
      fecha: f,
      totalJugadores: totalJugs,
      firmados: firmados,
      completa: totalJugs > 0 && firmados === totalJugs,
    });
  });
  return result;
}

/**
 * MAIN endpoint: get full results for a fecha.
 * Returns: cancha, bonus winners, stableford sorted list, matches
 */
function getFechaResultados_(fecha) {
  if (!fecha) return null;

  const cancha = getCanchaForFecha_(fecha);
  const bonus = getBonusWinners_(fecha);
  const hcps = getHcpsForFecha_(fecha);
  const stableford = getStableforFromSTB_(fecha);
  const matches = getMatchesFullForFecha_(fecha);

  // Decorate stableford with HCP
  const stbWithHcp = stableford.map(s => ({
    ...s,
    hcp: hcps[s.matricula] !== undefined ? hcps[s.matricula] : null,
  }));

  const totalJugs = Object.keys(hcps).length;
  const firmados = Object.values(hcps).filter(h => h !== null).length;

  return {
    fecha: fecha,
    cancha: cancha,
    ldWinner: bonus.ldWinner,
    baWinner: bonus.baWinner,
    stableford: stbWithHcp,
    matches: matches,
    totalJugadores: totalJugs,
    firmados: firmados,
    completa: totalJugs > 0 && firmados === totalJugs,
  };
}

function getMisFechas_(matricula) {
  // Returns fechas where this matricula has a row in TARJETAS, plus the pares + indices
  // for each cancha. Embedding pares+indices saves a round-trip when entering score screen.
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return [];
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return [];
  // Cols: A=FM, B=FECHA, C=MATRICULA, D=NOMBRE, E=HCP, F=CANCHA
  const data = sh.getRange(2, 2, nextEmpty - 2, 5).getValues();
  const out = [];
  const canchasNeeded = {};
  data.forEach((row, i) => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    if (m === String(matricula) && f) {
      const c = String(row[4] || '').trim();
      out.push({
        fecha: f,
        hcp: row[3] || '',
        cancha: c,
        rowIndex: i + 2,
      });
      if (c) canchasNeeded[c.toUpperCase()] = true;
    }
  });

  // Build cancha→{pares, indices} map for the canchas this player has played.
  const paresMap = {};
  const indicesMap = {};
  if (Object.keys(canchasNeeded).length){
    // Read CANCHAS for pares
    const shC = getSheet_(SHEETS.CANCHAS);
    if (shC){
      const lr = shC.getLastRow();
      if (lr >= 2){
        const cdata = shC.getRange(2, 1, lr - 1, 20).getValues();
        cdata.forEach(r => {
          const id = String(r[0] || '').trim();
          const nom = String(r[1] || '').trim();
          const upN = nom.toUpperCase();
          const upI = id.toUpperCase();
          if (canchasNeeded[upN] || canchasNeeded[upI]){
            const pares = r.slice(2, 20).map(v => parseInt(v) || null);
            paresMap[upN] = pares;
            paresMap[upI] = pares;
          }
        });
      }
    }
    // Read indices from NGT DB CANCHAS (A=ID, B=NOMBRE, C=hoyo, D=PAR, E=ÍNDICE)
    const shDb = getHistSheet_('CANCHAS');
    if (shDb) {
      const lr = shDb.getLastRow();
      if (lr >= 2) {
        const idata = shDb.getRange(2, 1, lr - 1, 5).getValues();
        const canchaHoles = {};
        idata.forEach(r => {
          const id = String(r[0] || '').trim().toUpperCase();
          const nom = String(r[1] || '').trim().toUpperCase();
          const hoyo = parseInt(r[2]);
          const indice = parseInt(r[4]);
          if (!hoyo || !indice) return;
          const key = canchasNeeded[id] ? id : (canchasNeeded[nom] ? nom : null);
          if (!key) return;
          if (!canchaHoles[key]) canchaHoles[key] = [];
          canchaHoles[key].push({ hoyo, indice });
        });
        Object.keys(canchaHoles).forEach(key => {
          const holes = canchaHoles[key];
          if (holes.length === 18) {
            holes.sort((a, b) => a.hoyo - b.hoyo);
            indicesMap[key] = holes.map(h => h.indice);
          }
        });
      }
    }
  }

  // Attach pares + indices to each fecha
  out.forEach(f => {
    const k = String(f.cancha || '').toUpperCase();
    if (paresMap[k]) f.pares = paresMap[k];
    if (indicesMap[k]) f.indices = indicesMap[k];
  });
  return out.sort((a, b) => parseInt(b.fecha) - parseInt(a.fecha)); // most recent first
}

function getCanchaPares_(canchaNombreOrId) {
  // Returns { id, nombre, pares: [18], indices: [18] } for a given cancha (by ID or name)
  // Name matching is case-insensitive.
  const sh = getSheet_(SHEETS.CANCHAS);
  if (!sh) return null;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  const data = sh.getRange(2, 1, lastRow - 1, 20).getValues();
  const keyRaw = String(canchaNombreOrId).trim();
  const keyUp = keyRaw.toUpperCase();

  let cancha = null;
  for (let i = 0; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const nombre = String(data[i][1] || '').trim();
    if (id === keyRaw || nombre.toUpperCase() === keyUp) {
      cancha = {
        id: id,
        nombre: nombre,
        pares: data[i].slice(2, 20).map(v => parseInt(v) || null),
        indices: [],
      };
      break;
    }
  }
  if (!cancha) return null;

  // Read indices from NGT DB CANCHAS (A=ID, B=NOMBRE, C=hoyo, D=PAR, E=ÍNDICE)
  const shDb = getHistSheet_('CANCHAS');
  if (shDb) {
    const lr = shDb.getLastRow();
    if (lr >= 2) {
      const hcpData = shDb.getRange(2, 1, lr - 1, 5).getValues();
      const holes = [];
      hcpData.forEach(r => {
        const id = String(r[0] || '').trim();
        const nombre = String(r[1] || '').trim();
        if (id === cancha.id || nombre.toUpperCase() === cancha.nombre.toUpperCase()) {
          const hoyo = parseInt(r[2]);
          const indice = parseInt(r[4]);
          if (hoyo >= 1 && hoyo <= 18 && indice) holes.push({ hoyo, indice });
        }
      });
      if (holes.length === 18) {
        holes.sort((a, b) => a.hoyo - b.hoyo);
        cancha.indices = holes.map(h => h.indice);
      }
    }
  }
  return cancha;
}

function debugHcpCanchas_() {
  // Lists all sheets that might match, and shows their data
  const all = SpreadsheetApp.getActive().getSheets();
  const allNames = all.map(s => s.getName());
  const candidates = allNames.filter(n =>
    n.toUpperCase().indexOf('HCP') >= 0 || n.toUpperCase().indexOf('INDIC') >= 0
  );

  const result = { allSheetNames: allNames, candidateSheets: candidates, data: {} };

  candidates.forEach(name => {
    const sh = getSheet_(name);
    if (!sh) return;
    const lr = sh.getLastRow();
    const lc = sh.getLastColumn();
    const sample = sh.getRange(1, 1, Math.min(lr, 5), Math.min(lc, 20)).getValues();
    result.data[name] = { lastRow: lr, lastCol: lc, firstRows: sample };
  });

  return result;
}

function getFechasActivas_() {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return [];
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return [];
  const data = sh.getRange(2, 2, nextEmpty - 2, 1).getValues();
  const fechas = new Set();
  data.forEach(r => {
    const v = String(r[0] || '').trim();
    if (v) fechas.add(v);
  });
  return [...fechas].sort((a, b) => parseInt(a) - parseInt(b));
}

function getJugadoresEnFecha_(fecha) {
  const shT = getSheet_(SHEETS.TARJETAS);
  if (!shT) return [];
  const nextEmpty = findNextEmptyRow_(shT, 2);
  if (nextEmpty <= 2) return [];

  const data = shT.getRange(2, 2, nextEmpty - 2, 3).getValues();

  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  const out = [];
  const seen = new Set();
  data.forEach(r => {
    const f = String(r[0] || '').trim();
    const m = String(r[1] || '').trim();
    const n = String(r[2] || '').trim();
    if (f !== String(fecha) || !m) return;
    if (seen.has(m)) return;
    seen.add(m);

    const j = jugMap[m];
    out.push({
      matricula: m,
      nombre: j ? j.nombre : n,
      apodo: j ? j.apodo : '',
      isInvitado: !j,
    });
  });
  return out;
}

function getTarjetaJugador_(fecha, matricula) {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return null;
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return null;
  const data = sh.getRange(2, 1, nextEmpty - 2, 32).getValues();
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][1] || '').trim();
    const m = String(data[i][2] || '').trim();
    if (f === String(fecha) && m === String(matricula)) {
      return {
        rowIndex: i + 2,
        fecha: f, matricula: m,
        nombre: data[i][3], hcp: data[i][4],
        cancha: data[i][5],   // col F = cancha name
        canchaId: data[i][6], // col G = cancha ID (needed for canchaPares lookup)
        scores: data[i].slice(7, 25),
        ld: data[i][25], ba: data[i][26],
      };
    }
  }
  return null;
}

/**
 * Returns who (if anyone) already won LD and BA for this fecha.
 * Used to disable the checkboxes when another player already claimed the bonus.
 */
function getBonusWinners_(fecha) {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ldWinner: null, baWinner: null };
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return { ldWinner: null, baWinner: null };

  const data = sh.getRange(2, 2, nextEmpty - 2, 26).getValues();
  // cols: B=fecha(0), C=matricula(1), D=nombre(2), ..., Z=LD(24), AA=BA(25)

  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  let ldWinner = null;
  let baWinner = null;
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][0] || '').trim();
    const m = String(data[i][1] || '').trim();
    if (f !== String(fecha) || !m) continue;
    const ldVal = data[i][24];
    const baVal = data[i][25];
    if (!ldWinner && (ldVal === 1 || ldVal === true || String(ldVal) === '1')) {
      ldWinner = {
        matricula: m,
        apodo: (jugMap[m] && jugMap[m].apodo) || '',
        nombre: (jugMap[m] && jugMap[m].nombre) || String(data[i][2] || '').trim(),
      };
    }
    if (!baWinner && (baVal === 1 || baVal === true || String(baVal) === '1')) {
      baWinner = {
        matricula: m,
        apodo: (jugMap[m] && jugMap[m].apodo) || '',
        nombre: (jugMap[m] && jugMap[m].nombre) || String(data[i][2] || '').trim(),
      };
    }
  }
  return { ldWinner: ldWinner, baWinner: baWinner };
}

/**
 * Accumulated bonus totals (LD + BA) per player for the current 2026 NGT season.
 * Returns: { 'NOMBRE_NORMALIZADO': { ld: N, ba: N, matricula: '...', apodo: '...', nombre: '...' }, ... }
 * Reads TARJETAS sheet 2026 NGT (col Z = LD flag, AA = BA flag).
 */
function getBonusesAcum_() {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return {};
  const lr = sh.getLastRow();
  if (lr < 2) return {};

  // Read cols B..AA (B=fecha, C=matricula, D=nombre, ..., Z=LD, AA=BA)
  const data = sh.getRange(2, 2, lr - 1, 26).getValues();
  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[String(j.matricula).trim()] = j; });

  const totals = {};   // matricula → {ld, ba, ...}
  data.forEach(r => {
    const m = String(r[1] || '').trim();
    if (!m) return;
    const ldVal = r[24];
    const baVal = r[25];
    const isLd = (ldVal === 1 || ldVal === true || String(ldVal) === '1');
    const isBa = (baVal === 1 || baVal === true || String(baVal) === '1');
    if (!isLd && !isBa) return;
    if (!totals[m]){
      const j = jugMap[m] || {};
      totals[m] = {
        matricula: m,
        apodo: j.apodo || '',
        nombre: j.nombre || String(r[2] || '').trim(),
        ld: 0, ba: 0,
      };
    }
    if (isLd) totals[m].ld++;
    if (isBa) totals[m].ba++;
  });
  return totals;
}

function getFechaMeta_(fecha) {
  const props = PropertiesService.getDocumentProperties();
  const meta = JSON.parse(props.getProperty('FECHA_META') || '{}');
  return meta[String(fecha)] || null;
}

/**
 * Get full detail of an existing fecha: all players in it, cancha, dobles
 */
function getFechaDetalle_(fecha) {
  const shT = getSheet_(SHEETS.TARJETAS);
  if (!shT) return null;
  const nextEmpty = findNextEmptyRow_(shT, 2);
  if (nextEmpty <= 2) return null;

  // Cols B=fecha (idx0), C=matricula (1), D=nombre (2), E=hcp (3), F=cancha (4) ... AG=color (32)
  const data = shT.getRange(2, 2, nextEmpty - 2, 32).getValues();
  const jugadores = [];
  const invitados = [];
  let cancha = '';
  let colorTee = '';
  data.forEach((row, i) => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    const n = String(row[2] || '').trim();
    const c = String(row[4] || '').trim();
    const ct = String(row[31] || '').trim();   // AG = col 33 → idx 31 in slice starting at B
    if (f !== String(fecha) || !m) return;
    if (!cancha && c) cancha = c;
    if (!colorTee && ct) colorTee = ct.toUpperCase();
    if (m.indexOf('INV') === 0) {
      invitados.push({ matricula: m, nombre: n, row: i + 2 });
    } else {
      jugadores.push({ matricula: m, nombre: n, row: i + 2 });
    }
  });

  // Get dobles for this fecha from SCORE
  const dobles = getDoblesForFecha_(fecha);

  return { fecha: fecha, cancha: cancha, colorTee: colorTee, jugadores: jugadores, invitados: invitados, dobles: dobles };
}

/**
 * Returns list of matriculas who have DB=TRUE in SCORE for the given fecha
 */
function getDoblesForFecha_(fecha) {
  const sh = getSheet_('SCORE');
  if (!sh) return [];
  const col = getDbColForFecha_(fecha);
  if (col < 0) return [];
  const data = sh.getRange(2, 1, 19, 46).getValues();
  const result = [];
  data.forEach(row => {
    const mat = String(row[0] || '').trim();
    if (!mat) return;
    const v = row[col - 1];
    const isTrue = (v === true)
      || (v === 1)
      || (typeof v === 'string' && (v.toUpperCase() === 'TRUE' || v.toUpperCase() === 'VERDADERO'));
    if (isTrue) result.push(mat);
  });
  return result;
}

/**
 * Edit existing fecha: update cancha, add new players, remove removed ones, update dobles
 */
function editarFecha_(params) {
  const { adminKey, fecha, canchaId, jugadores, dobles, invitados, colorTee } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };

  let canchaName = null;
  if (canchaId) {
    canchaName = lookupCanchaName_(canchaId);
    if (!canchaName) return { ok: false, error: 'Cancha no encontrada: ' + canchaId };
  }

  const colorFinal = colorTee ? String(colorTee).trim().toUpperCase() : null;

  // Find existing rows for this fecha
  const nextEmpty = findNextEmptyRow_(sh, 2);
  const existingRows = [];
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 2, nextEmpty - 2, 5).getValues();
    data.forEach((row, i) => {
      const f = String(row[0] || '').trim();
      const m = String(row[1] || '').trim();
      const n = String(row[2] || '').trim();
      if (f === String(fecha) && m) {
        existingRows.push({
          row: i + 2,
          matricula: m,
          nombre: n,
          isInvitado: m.indexOf('INV') === 0,
        });
      }
    });
  }

  const targetJugadores = (jugadores || []).map(String);
  const targetInvitadoNames = (invitados || []).map(n => String(n).trim()).filter(n => n);

  const changes = { removed: [], added: [], canchaUpdated: false, colorUpdated: false, doblesSet: [], doblesCleared: [], errors: [] };

  // Step 1a: Update cancha name (F) + cancha ID (G) para todos los rows existentes.
  // Escribir ambas columnas juntas evita que G quede con el ID viejo si la fórmula
  // fue sobreescrita previamente por cargarTarjeta_ (que hace batch E→AA).
  if (canchaName) {
    try {
      existingRows.forEach(er => {
        sh.getRange(er.row, 6, 1, 2).setValues([[canchaName, canchaId]]); // F + G
      });
      changes.canchaUpdated = true;
    } catch (e) { changes.errors.push('cancha: ' + e.message); }
  }

  // Step 1b: Update color tee (col AB = 28) for all existing rows
  if (colorFinal) {
    try {
      existingRows.forEach(er => {
        sh.getRange(er.row, 33).setValue(colorFinal);   // AG = col 33
      });
      changes.colorUpdated = true;
    } catch (e) { changes.errors.push('color: ' + e.message); }
  }

  // Step 2: Remove players no longer in the list
  existingRows.forEach(er => {
    const keep = er.isInvitado
      ? targetInvitadoNames.indexOf(er.nombre) >= 0
      : targetJugadores.indexOf(er.matricula) >= 0;
    if (!keep) {
      try {
        // Clear col B, C, D, E, F (fecha, matricula, nombre, hcp, cancha) and scores H:Y and LD/BA
        // Only clear specific columns, not ranges with tricky validation
        sh.getRange(er.row, 2).clearContent(); // B
        sh.getRange(er.row, 3).clearContent(); // C
        sh.getRange(er.row, 4).clearContent(); // D
        sh.getRange(er.row, 5).clearContent(); // E
        sh.getRange(er.row, 6).clearContent(); // F
        // Scores H:Y = cols 8 to 25
        sh.getRange(er.row, 8, 1, 18).clearContent();
        sh.getRange(er.row, 26).clearContent(); // LD
        sh.getRange(er.row, 27).clearContent(); // BA
        changes.removed.push(er.matricula);
      } catch (e) { changes.errors.push('remove ' + er.matricula + ': ' + e.message); }
    }
  });

  // Step 3: Add new players
  const currentMatriculas = existingRows
    .filter(er => {
      const kept = er.isInvitado
        ? targetInvitadoNames.indexOf(er.nombre) >= 0
        : targetJugadores.indexOf(er.matricula) >= 0;
      return kept && !er.isInvitado;
    })
    .map(er => er.matricula);
  const currentInvitadoNames = existingRows
    .filter(er => {
      const kept = er.isInvitado
        ? targetInvitadoNames.indexOf(er.nombre) >= 0
        : targetJugadores.indexOf(er.matricula) >= 0;
      return kept && er.isInvitado;
    })
    .map(er => er.nombre);

  let nextRow = findNextEmptyRow_(sh, 2);

  targetJugadores.forEach(mat => {
    if (currentMatriculas.indexOf(mat) >= 0) return;
    try {
      sh.getRange(nextRow, 2).setValue(fecha);
      sh.getRange(nextRow, 3).setValue(mat);
      if (canchaName) sh.getRange(nextRow, 6, 1, 2).setValues([[canchaName, canchaId]]); // F + G
      if (colorFinal) sh.getRange(nextRow, 33).setValue(colorFinal);   // AG = col 33
      nextRow++;
      changes.added.push(mat);
    } catch (e) { changes.errors.push('add ' + mat + ': ' + e.message); }
  });

  const baseTs = Date.now();
  targetInvitadoNames.forEach((nombre, idx) => {
    if (currentInvitadoNames.indexOf(nombre) >= 0) return;
    try {
      const invMat = 'INV' + baseTs + idx;
      sh.getRange(nextRow, 2).setValue(fecha);
      sh.getRange(nextRow, 3).setValue(invMat);
      sh.getRange(nextRow, 4).setValue(nombre);
      if (canchaName) sh.getRange(nextRow, 6, 1, 2).setValues([[canchaName, canchaId]]); // F + G
      if (colorFinal) sh.getRange(nextRow, 33).setValue(colorFinal);   // AG = col 33
      nextRow++;
      changes.added.push('INV:' + nombre);
    } catch (e) { changes.errors.push('addInv ' + nombre + ': ' + e.message); }
  });

  // Step 4: Update dobles
  const currentDobles = getDoblesForFecha_(fecha);
  const targetDobles = (dobles || []).map(String);
  const shScore = getSheet_('SCORE');
  if (shScore) {
    const dbCol = getDbColForFecha_(fecha);
    if (dbCol > 0) {
      targetDobles.forEach(mat => {
        if (currentDobles.indexOf(mat) >= 0) return;
        try {
          const scoreRow = getScoreRowForMat_(mat);
          if (scoreRow > 0) {
            shScore.getRange(scoreRow, dbCol).setValue(true);
            changes.doblesSet.push(mat);
          } else {
            changes.errors.push('score row not found for ' + mat);
          }
        } catch (e) { changes.errors.push('doble set ' + mat + ': ' + e.message); }
      });
      currentDobles.forEach(mat => {
        if (targetDobles.indexOf(mat) >= 0) return;
        try {
          const scoreRow = getScoreRowForMat_(mat);
          if (scoreRow > 0) {
            shScore.getRange(scoreRow, dbCol).setValue(false);
            changes.doblesCleared.push(mat);
          }
        } catch (e) { changes.errors.push('doble clear ' + mat + ': ' + e.message); }
      });
    }
  }

  audit_('EDITAR_FECHA', 'admin', { fecha, canchaId, canchaName, targetJugadores, targetInvitadoNames, targetDobles, changes });
  if (changes.errors.length > 0) {
    return { ok: false, error: 'Errores al guardar: ' + changes.errors.join(' | '), changes: changes };
  }
  return { ok: true, changes: changes };
}

// Debug endpoint — inspect MATCH sheet state
function debugMatch_() {
  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return { error: 'MATCH no existe' };
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const nextEmptyD = findNextEmptyRow_(sh, 4);
  const nextEmptyB = findNextEmptyRow_(sh, 2);
  // Show last 5 rows of cols A-E
  const start = Math.max(2, lastRow - 4);
  const snapshot = sh.getRange(start, 1, Math.min(5, lastRow - start + 1), 5).getValues();
  return {
    sheetName: sh.getName(),
    lastRow: lastRow,
    lastCol: lastCol,
    nextEmptyColD: nextEmptyD,
    nextEmptyColB: nextEmptyB,
    last5Rows_A_to_E: snapshot,
  };
}

// ════════════ WRITES ════════════
function crearFecha_(params) {
  const { adminKey, fecha, canchaId, jugadores, dobles, invitados, colorTee } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha || !canchaId || ((!jugadores || !jugadores.length) && (!invitados || !invitados.length))) {
    return { ok: false, error: 'Faltan datos' };
  }
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };

  // Lookup cancha NAME from ID — that's what col F expects (data validation list)
  const canchaName = lookupCanchaName_(canchaId);
  if (!canchaName) return { ok: false, error: 'Cancha no encontrada: ' + canchaId };

  // Tee color: defaults to BLANCAS if not provided
  const colorFinal = String(colorTee || 'BLANCAS').trim().toUpperCase();

  const existing = [];
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 2, nextEmpty - 2, 2).getValues();
    data.forEach(r => {
      const f = String(r[0] || '').trim();
      const m = String(r[1] || '').trim();
      if (f === String(fecha) && m) existing.push(m);
    });
  }

  let added = 0;
  let nextRow = nextEmpty;

  // ── Jugadores: batch write instead of 4 setValue calls per player ──────────
  // Before: 4 × N individual setValue calls (~68 for 17 players).
  // After:  3 batch setValues calls total regardless of player count.
  const newJugMats = [];
  if (Array.isArray(jugadores)) {
    jugadores.forEach(mat => {
      if (existing.indexOf(String(mat)) >= 0) return;
      newJugMats.push(String(mat));
      added++;
    });
  }
  if (newJugMats.length) {
    const startJug = nextRow;
    sh.getRange(startJug, 2, newJugMats.length, 2)
      .setValues(newJugMats.map(m => [fecha, m]));                    // B-C
    sh.getRange(startJug, 6, newJugMats.length, 2)
      .setValues(newJugMats.map(() => [canchaName, canchaId]));        // F-G (nombre + ID estático)
    sh.getRange(startJug, 33, newJugMats.length, 1)
      .setValues(newJugMats.map(() => [colorFinal]));                  // AG
    nextRow += newJugMats.length;
  }

  // ── Invitados: batch write (B-C-D together, then F and AG) ─────────────────
  let invAdded = 0;
  if (Array.isArray(invitados)) {
    const baseTs = Date.now();
    const newInvRows = [];
    invitados.forEach((nombre, idx) => {
      const n = String(nombre || '').trim();
      if (!n) return;
      newInvRows.push({ mat: 'INV' + baseTs + idx, nombre: n });
      invAdded++;
      added++;
    });
    if (newInvRows.length) {
      const startInv = nextRow;
      sh.getRange(startInv, 2, newInvRows.length, 3)
        .setValues(newInvRows.map(r => [fecha, r.mat, r.nombre]));  // B-C-D
      sh.getRange(startInv, 6, newInvRows.length, 2)
        .setValues(newInvRows.map(() => [canchaName, canchaId]));   // F-G (nombre + ID estático)
      sh.getRange(startInv, 33, newInvRows.length, 1)
        .setValues(newInvRows.map(() => [colorFinal]));             // AG
      nextRow += newInvRows.length;
    }
  }

  // Mark DB=TRUE in SCORE for players who will use doble on this fecha
  const dobleResults = [];
  if (Array.isArray(dobles) && dobles.length) {
    dobles.forEach(mat => {
      const r = setDobleForFecha_(mat, fecha);
      dobleResults.push({ matricula: mat, ok: r.ok, error: r.error || null });
    });
  }

  audit_('CREAR_FECHA', 'admin', { fecha, canchaId, canchaName, jugadores, dobles, invitados, added, dobleResults });
  const props = PropertiesService.getDocumentProperties();
  const meta = JSON.parse(props.getProperty('FECHA_META') || '{}');
  meta[String(fecha)] = { canchaId, canchaName, dobles: dobles || [] };
  props.setProperty('FECHA_META', JSON.stringify(meta));

  return {
    ok: true,
    added: added,
    invitados: invAdded,
    skipped: (jugadores ? jugadores.length : 0) - (added - invAdded),
    canchaUsed: canchaName,
    dobleResults: dobleResults,
  };
}

/**
 * Calculate stableford point breakdown for 18 holes.
 * Returns { e:count0pts, f:count1pt, g:count2pts, h:count3pts, i:count4pts, j:count5pts, k:total }
 * matching STB sheet columns E-K.  Returns null if no scores present.
 */
function calcStbBreakdown_(scores18, pares, indices, hcp) {
  // E = HCP al 85% (igual que TARJETAS!E pero redondeado)
  // F = bogeys (1pt), G = pares (2pt), H = birdies (3pt), I = águilas (4pt), J = albatros (5pt)
  // K = F*1 + G*2 + H*3 + I*4 + J*5
  const hcp85val = Math.round(parseFloat(hcp) * 0.85);
  const counts = [0, 0, 0, 0, 0, 0]; // index = stableford points (0..5)
  let any = false;
  for (let h = 0; h < 18; h++) {
    const sc = (scores18[h] !== undefined && scores18[h] !== null && scores18[h] !== '')
      ? parseInt(scores18[h]) : null;
    if (sc === null || isNaN(sc)) continue;
    any = true;
    const pts = calcStablefordHole_(sc, pares[h] || null, indices[h] || null, hcp);
    counts[pts !== null ? pts : 0]++;
  }
  if (!any) return null;
  const total = counts[1] + counts[2]*2 + counts[3]*3 + counts[4]*4 + counts[5]*5;
  return { e: hcp85val, f: counts[1], g: counts[2], h: counts[3], i: counts[4], j: counts[5], k: total };
}

function cargarTarjeta_(params) {
  const { matricula, adminKey, fecha, hcp, scores, ld, ba, usarDoble } = params;
  let isAdmin = adminKey && checkAdmin_(adminKey);
  if (!isAdmin) {
    const player = checkPlayerByMat_(matricula);
    if (!player) return { ok: false, error: 'Matrícula no encontrada' };
  }

  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };

  const wantsLD = (ld === 1 || ld === true || ld === '1');
  const wantsBA = (ba === 1 || ba === true || ba === '1');
  const clearsLD = (ld === 0 || ld === false || ld === '0');
  const clearsBA = (ba === 0 || ba === false || ba === '0');

  // Single read of B..AA covers everything we need: validation, row lookup, and old values
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return { ok: false, error: 'No hay tarjetas' };
  const allRows = sh.getRange(2, 2, nextEmpty - 2, 26).getValues();
  // cols (0-indexed in slice starting at B): 0=fecha, 1=matricula, 2=nombre, 3=hcp,
  //   4=cancha, 5=id, 6..23=H1..H18, 24=LD, 25=BA

  // LD/BA uniqueness validation in same pass (avoid second sheet read)
  if (wantsLD || wantsBA) {
    let jugMap = null;
    for (let i = 0; i < allRows.length; i++) {
      const f = String(allRows[i][0] || '').trim();
      const m = String(allRows[i][1] || '').trim();
      if (f !== String(fecha) || m === String(matricula)) continue;
      const otherLD = allRows[i][24];
      const otherBA = allRows[i][25];
      const otherHasLD = (otherLD === 1 || otherLD === true || otherLD === '1');
      const otherHasBA = (otherBA === 1 || otherBA === true || otherBA === '1');
      if (wantsLD && otherHasLD) {
        if (!jugMap) { jugMap = {}; getJugadores_().forEach(j => { jugMap[j.matricula] = j; }); }
        const winner = (jugMap[m] && jugMap[m].apodo) || m;
        return { ok: false, error: 'El Long Drive ya fue ganado por ' + winner + ' en esta fecha' };
      }
      if (wantsBA && otherHasBA) {
        if (!jugMap) { jugMap = {}; getJugadores_().forEach(j => { jugMap[j.matricula] = j; }); }
        const winner = (jugMap[m] && jugMap[m].apodo) || m;
        return { ok: false, error: 'El Best Approach ya fue ganado por ' + winner + ' en esta fecha' };
      }
    }
  }

  // Find target row
  let rowIdx = -1;
  let existingRow = null;
  for (let i = 0; i < allRows.length; i++) {
    const f = String(allRows[i][0] || '').trim();
    const m = String(allRows[i][1] || '').trim();
    if (f === String(fecha) && m === String(matricula)) {
      rowIdx = i + 2;
      existingRow = allRows[i];
      break;
    }
  }
  if (rowIdx < 0) return { ok: false, error: 'No se encontró tarjeta' };

  // Build a 1×27 row covering E..AE (cols 5..31): hcp, cancha, id, H1..H18, LD, BA, IDA, VTA, GROSS, NETO.
  // Preserve existing values for cols we shouldn't touch.
  // existingRow indices: 3=hcp, 4=cancha, 5=id, 6..23=H1..H18, 24=LD, 25=BA
  // AB-AE (indices 23-26) computed below as static values — no sheet formula recalc.
  const newRow = new Array(23);
  newRow[0] = (hcp !== undefined && hcp !== null && hcp !== '') ? hcp : (existingRow[3] !== undefined ? existingRow[3] : '');
  newRow[1] = existingRow[4] !== undefined ? existingRow[4] : '';      // cancha (preserve)
  newRow[2] = existingRow[5] !== undefined ? existingRow[5] : '';      // ID (preserve)
  for (let h = 0; h < 18; h++) {
    if (Array.isArray(scores) && scores.length === 18 && scores[h] !== undefined && scores[h] !== null && scores[h] !== '') {
      newRow[3 + h] = scores[h];
    } else {
      newRow[3 + h] = existingRow[6 + h] !== undefined ? existingRow[6 + h] : '';
    }
  }
  // LD (col 21 in newRow = col Z in sheet)
  if (wantsLD) newRow[21] = 1;
  else if (clearsLD) newRow[21] = '';
  else newRow[21] = existingRow[24] !== undefined ? existingRow[24] : '';
  // BA (col 22 in newRow = col AA in sheet)
  if (wantsBA) newRow[22] = 1;
  else if (clearsBA) newRow[22] = '';
  else newRow[22] = existingRow[25] !== undefined ? existingRow[25] : '';

  // ── Compute AB-AE as static values (replaces sheet formulas, avoids recalc cost) ──
  // AB = IDA (sum H1-H9 = newRow[3..11])
  // AC = VUELTA (sum H10-H18 = newRow[12..20])
  // AD = GROSS = AB + AC
  // AE = NETO  = AD - HCP (newRow[0])
  let idaSum = 0, idaCount = 0;
  for (let i = 3; i <= 11; i++) {
    const v = parseFloat(newRow[i]);
    if (!isNaN(v) && newRow[i] !== '') { idaSum += v; idaCount++; }
  }
  let vtaSum = 0, vtaCount = 0;
  for (let i = 12; i <= 20; i++) {
    const v = parseFloat(newRow[i]);
    if (!isNaN(v) && newRow[i] !== '') { vtaSum += v; vtaCount++; }
  }
  const calcIda    = idaCount  > 0 ? idaSum           : '';
  const calcVuelta = vtaCount  > 0 ? vtaSum           : '';
  const calcGross  = (idaCount > 0 || vtaCount > 0)   ? (idaSum + vtaSum) : '';
  const hcpNum     = parseFloat(newRow[0]);
  const calcNeto   = (calcGross !== '' && !isNaN(hcpNum)) ? calcGross - hcpNum : '';
  newRow.push(calcIda, calcVuelta, calcGross, calcNeto); // indices 23-26 → cols AB-AE

  // Acquire a script-level lock to serialize concurrent writes.
  // On Sundays all 17 players submit simultaneously; without this, writes can
  // interleave and corrupt rows or cause "Service error" quota failures.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // wait up to 15 s before giving up
  } catch (e) {
    return { ok: false, error: 'Servidor ocupado, esperá unos segundos e intentá de nuevo' };
  }

  let dobleMsg = null;
  try {
    // Single batch write — cols E..AE (5..31 = 27 cols).
    // AB-AE computed above as static values; no more sheet formula recalculation.
    sh.getRange(rowIdx, 5, 1, 27).setValues([newRow]);

    // ── Write STB E-K + SCORE ST col + MATCH as static values ─────────────
    // Breaks the recalc chains:
    //   TARJETAS → STB COUNTIFS → SCORE SUMIF
    //   TARJETAS → MATCH!E/AF → MATCH!AY/BC → MATCH!AG:AX → MATCH!F:W → MATCH!BA/BB/X/Y
    try {
      // Shared cancha data (used by STB, SCORE, and MATCH)
      const canchaId   = existingRow[5]; // TARJETAS col G (canchaId)
      const cd         = canchaId
        ? cachedRead_('cp2_' + String(canchaId), 300, function(){ return getCanchaPares_(canchaId); })
        : null;
      const cpPares    = (cd && cd.pares)   || [];
      const cpIndices  = (cd && cd.indices) || [];
      const myScores18 = newRow.slice(3, 21); // H1..H18 from TARJETAS
      const fStr       = String(fecha);
      const mStr       = String(matricula);

      // ── 1. STB E:K ──────────────────────────────────────────────────────
      const stbBreak = calcStbBreakdown_(myScores18, cpPares, cpIndices, hcpNum);
      if (stbBreak) {
        const stbSh = getSheet_('STB');
        if (stbSh) {
          const stbLast = stbSh.getLastRow();
          if (stbLast >= 2) {
            const stbBC = stbSh.getRange(2, 2, stbLast - 1, 2).getValues(); // B-C
            let stbRow = -1;
            for (let i = 0; i < stbBC.length; i++) {
              if (String(stbBC[i][0]).trim() === fStr && String(stbBC[i][1]).trim() === mStr) {
                stbRow = i + 2; break;
              }
            }
            if (stbRow > 0) {
              stbSh.getRange(stbRow, 5, 1, 7).setValues([[
                stbBreak.e, stbBreak.f, stbBreak.g, stbBreak.h,
                stbBreak.i, stbBreak.j, stbBreak.k
              ]]);
            }
          }
        }

        // ── 2. SCORE ST column ────────────────────────────────────────────
        // ST col formula: fecha n → col = 4*n + 1 (fecha1=E=5, fecha2=I=9, …)
        const scoreSh = getSheet_('SCORE');
        if (scoreSh) {
          const scoreRow = getScoreRowForMat_(matricula);
          const stCol    = 4 * parseInt(fecha) + 1;
          if (scoreRow > 0 && stCol >= 5 && stCol <= 48) {
            scoreSh.getRange(scoreRow, stCol).setValue(stbBreak.k);
          }
        }
      }

      // ── 3. MATCH static computation ──────────────────────────────────────
      // Eliminates: MATCH!E(VLOOKUP) → AF → AY/BC → AG:AX(18×2) → F:W(18×2)
      //             → BA/BB/X/Y(2×2). ~90 formula cells cleared per write.
      // Only fires when the opponent has also submitted their tarjeta.
      const matchSh = getSheet_(SHEETS.MATCH);
      if (matchSh && cpIndices.length > 0 && stbBreak) {
        const hcp85val  = stbBreak.e; // Math.round(hcpNum * 0.85), already computed
        const matchLast = findNextEmptyRow_(matchSh, 2); // first empty row in col B
        if (matchLast > 2) {
          const matchBC = matchSh.getRange(2, 2, matchLast - 2, 2).getValues(); // B,C per row

          // Find all rows in MATCH where this player is listed for this fecha
          for (let mi = 0; mi < matchBC.length; mi++) {
            if (String(matchBC[mi][0]).trim() !== fStr || String(matchBC[mi][1]).trim() !== mStr) continue;
            const mySheetRow = mi + 2; // 1-based sheet row

            // Pair: even row (2,4,6…) goes with next row; odd goes with previous
            const partnerSheetRow = (mySheetRow % 2 === 0) ? mySheetRow + 1 : mySheetRow - 1;
            const partnerIdx      = partnerSheetRow - 2;
            if (partnerIdx < 0 || partnerIdx >= matchBC.length) continue;

            // Look up opponent's matricula from the MATCH sheet
            const oppMat = String(matchBC[partnerIdx][1]).trim();
            if (!oppMat) continue;

            // Check if opponent has submitted their tarjeta (search allRows already in memory)
            let oppTarjeta = null;
            for (let ai = 0; ai < allRows.length; ai++) {
              if (String(allRows[ai][0]).trim() === fStr && String(allRows[ai][1]).trim() === oppMat) {
                oppTarjeta = allRows[ai]; break;
              }
            }
            if (!oppTarjeta) continue; // opponent hasn't been assigned a tarjeta row

            // Check opponent has at least one score
            const oppScores18 = oppTarjeta.slice(6, 24); // H1..H18 (indices in allRows)
            const oppHasScores = oppScores18.some(function(s){ return s !== '' && s !== null && s !== undefined; });
            if (!oppHasScores) continue;

            // Opponent HCP
            const oppHcpRaw = oppTarjeta[3]; // col E (hcp) in allRows (0-indexed offset from B)
            const oppHcpNum = parseFloat(oppHcpRaw);
            if (isNaN(oppHcpNum)) continue;
            const oppHcp85 = Math.round(oppHcpNum * 0.85);

            // Stroke advantage per player
            // Higher-HCP player receives strokes on hardest holes.
            // AY = max(0, myHcp85 - oppHcp85)  → my stroke advantage
            // BC = max(0, AY - 18)              → extra strokes when diff > 18
            const ayMy  = Math.max(0, hcp85val - oppHcp85);
            const ayOpp = Math.max(0, oppHcp85 - hcp85val);
            const bcMy  = Math.max(0, ayMy  - 18);
            const bcOpp = Math.max(0, ayOpp - 18);

            // Per-hole adjustments and net scores
            // AG formula: (AY>=idx ? -1 : 0) + (BC>0 && idx<=BC ? -1 : 0)
            const myAdj   = new Array(18);
            const oppAdj  = new Array(18);
            const myNet   = new Array(18);
            const oppNet  = new Array(18);
            for (let h = 0; h < 18; h++) {
              const idx = cpIndices[h] || 0;
              myAdj[h]  = (ayMy  > 0 && ayMy  >= idx ? -1 : 0) + (bcMy  > 0 && idx <= bcMy  ? -1 : 0);
              oppAdj[h] = (ayOpp > 0 && ayOpp >= idx ? -1 : 0) + (bcOpp > 0 && idx <= bcOpp ? -1 : 0);
              const myG  = (myScores18[h]  !== '' && myScores18[h]  !== null) ? parseInt(myScores18[h])  : null;
              const oppG = (oppScores18[h] !== '' && oppScores18[h] !== null) ? parseInt(oppScores18[h]) : null;
              myNet[h]  = (myG  !== null && !isNaN(myG))  ? myG  + myAdj[h]  : '';
              oppNet[h] = (oppG !== null && !isNaN(oppG)) ? oppG + oppAdj[h] : '';
            }

            // Hole wins (BA): count holes where my net < opponent net
            let myBA = 0, oppBA = 0;
            for (let h = 0; h < 18; h++) {
              if (myNet[h] !== '' && oppNet[h] !== '') {
                if (myNet[h]  < oppNet[h])  myBA++;
                if (oppNet[h] < myNet[h])   oppBA++;
              }
            }

            // BB = myBA - oppBA; X = result string; Y = points
            const myBB  = myBA  - oppBA;
            const oppBB = oppBA - myBA;
            const myX   = myBB  > 0 ? (myBB  + ' UP') : (myBB  === 0 ? 'AS' : '');
            const oppX  = oppBB > 0 ? (oppBB + ' UP') : (oppBB === 0 ? 'AS' : '');
            const myY   = myX  === '' ? 0 : (myX  === 'AS' ? 3 : 6);
            const oppY  = oppX === '' ? 0 : (oppX === 'AS' ? 3 : 6);

            // ── Batch writes — 2 setValues calls per row ──────────────────
            // Row layout:
            //   E(5)=hcp85, F:W(6-23)=netScores, X(24)=result, Y(25)=points
            //   → write cols 5-25 in one call (21 cols)
            //   AG:AX(33-50)=adj, AY(51)=ay, AZ(52)='', BA(53)=holes, BB(54)=diff, BC(55)=extra
            //   → write cols 33-55 in one call (23 cols)

            // My row
            matchSh.getRange(mySheetRow, 5, 1, 21).setValues(
              [[hcp85val].concat(myNet).concat([myX, myY])]
            );
            matchSh.getRange(mySheetRow, 33, 1, 23).setValues(
              [myAdj.concat([ayMy, '', myBA, myBB, bcMy])]
            );

            // Partner row
            matchSh.getRange(partnerSheetRow, 5, 1, 21).setValues(
              [[oppHcp85].concat(oppNet).concat([oppX, oppY])]
            );
            matchSh.getRange(partnerSheetRow, 33, 1, 23).setValues(
              [oppAdj.concat([ayOpp, '', oppBA, oppBB, bcOpp])]
            );
          }
        }
      }
    } catch (stbErr) {
      // Non-fatal — STB/SCORE/MATCH static write failure doesn't block tarjeta write
    }

    // Handle puntos dobles — if admin marked this player with doble for this fecha,
    // automatically copy the ST score from SCORE to col AU after firma.
    const currentDobles = getDoblesForFecha_(fecha);
    if (currentDobles.indexOf(String(matricula)) >= 0) {
      const auResult = writeDobleStScore_(matricula, fecha);
      if (auResult.ok) {
        dobleMsg = 'doble aplicado: ST=' + auResult.st + ' escrito en AU';
      } else {
        dobleMsg = 'doble marcado pero AU no se pudo escribir: ' + auResult.error;
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  audit_('CARGAR_TARJETA', isAdmin ? 'admin' : matricula, { fecha, matricula, hcp, scores, ld, ba, usarDoble, dobleMsg });
  return { ok: true, dobleMsg: dobleMsg };
}

function cargarMatches_(params) {
  const { adminKey, fecha, matches } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };
  if (!Array.isArray(matches) || !matches.length) return { ok: false, error: 'Lista de matches vacía' };

  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return { ok: false, error: 'Hoja MATCH no encontrada' };

  // Validate & prepare data up front
  const log = [];
  const prepared = [];
  matches.forEach((m, i) => {
    if (!m || !m.j1 || !m.j2) {
      log.push('match #' + i + ' inválido: ' + JSON.stringify(m));
      return;
    }
    const name1 = lookupJugadorName_(m.j1);
    const name2 = lookupJugadorName_(m.j2);
    if (!name1 || !name2) {
      log.push('match #' + i + ' nombre no encontrado: j1=' + m.j1 + ' (' + name1 + ') j2=' + m.j2 + ' (' + name2 + ')');
      return;
    }
    // Store mat1/mat2 so we can write the matricula directly to col C, bypassing the
    // VLOOKUP formula in that column. The formula can silently fail when the nombre in
    // JUGADORES!C has trailing spaces or subtle formatting differences (e.g. "PAZ LUIS ").
    // Writing the value we already hold is more reliable and removes the dependency.
    prepared.push({ index: i, mat1: String(m.j1), mat2: String(m.j2), name1: name1, name2: name2 });
  });

  if (!prepared.length) {
    audit_('CARGAR_MATCHES', 'admin', { fecha, matches, log, error: 'ningún match válido' });
    return { ok: false, error: 'Ningún match válido', log: log };
  }

  // Find starting row and ensure sheet has enough rows
  let nextRow = findNextEmptyRow_(sh, 4);
  if (nextRow % 2 === 1) nextRow++;
  const rowsNeeded = prepared.length * 2;
  const lastRequired = nextRow + rowsNeeded - 1;
  if (sh.getMaxRows() < lastRequired) {
    sh.insertRowsAfter(sh.getMaxRows(), lastRequired - sh.getMaxRows() + 10);
    log.push('inserted rows to reach row ' + (lastRequired + 10));
  }

  // Batch write cols B-C-D together (fecha, matricula, nombre)
  // Col C previously held a VLOOKUP formula to derive the matricula from the nombre.
  // Writing it directly avoids any mismatch caused by spaces/formatting in JUGADORES.
  const colBCD = [];
  prepared.forEach(p => {
    colBCD.push([fecha, p.mat1, p.name1]);
    colBCD.push([fecha, p.mat2, p.name2]);
  });

  let written = 0;
  try {
    // Clear validation on col D (the nombre column has a dropdown in some setups)
    sh.getRange(nextRow, 4, rowsNeeded, 1).clearDataValidations();
    sh.getRange(nextRow, 2, rowsNeeded, 3).setValues(colBCD);
    written = prepared.length;
    log.push('batch wrote cols B-C-D ' + rowsNeeded + ' rows starting ' + nextRow);
  } catch (err) {
    log.push('batch write ERROR: ' + err.message);
  }

  SpreadsheetApp.flush();
  audit_('CARGAR_MATCHES', 'admin', { fecha, matches, log, written, startRow: nextRow });
  return { ok: true, count: written, log: log, startRow: nextRow };
}

/**
 * Return matches for a given fecha, pairing consecutive rows into { j1, j2, rowA, rowB }
 */
function getMatchesForFecha_(fecha) {
  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return [];
  const nextEmpty = findNextEmptyRow_(sh, 4);
  if (nextEmpty <= 2) return [];
  // Read B (fecha) and D (jugador nombre) from row 2 to last
  const range = sh.getRange(2, 2, nextEmpty - 2, 3).getValues(); // B,C,D
  // Build map: jugador name -> matricula for reverse lookup
  const nameToMat = {};
  getJugadores_().forEach(j => { nameToMat[j.nombre] = j.matricula; });

  const matches = [];
  // Pair rows: (rowA, rowB) where row numbers are 2+i in sheet
  for (let i = 0; i < range.length; i += 2) {
    const rowA = 2 + i;
    const rowB = 2 + i + 1;
    const fA = String(range[i][0] || '').trim();
    const jA = String(range[i][2] || '').trim();
    const fB = i + 1 < range.length ? String(range[i + 1][0] || '').trim() : '';
    const jB = i + 1 < range.length ? String(range[i + 1][2] || '').trim() : '';
    if (fA === String(fecha) && jA && fB === String(fecha) && jB) {
      matches.push({
        rowA: rowA,
        rowB: rowB,
        j1Name: jA,
        j2Name: jB,
        j1: nameToMat[jA] || '',
        j2: nameToMat[jB] || '',
      });
    }
  }
  return matches;
}

/**
 * Replace ALL matches for a given fecha with the new list.
 * Strategy: clear the fecha+jugador in existing rows for that fecha, then write the new matches.
 */
function editarMatches_(params) {
  const { adminKey, fecha, matches } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };
  if (!Array.isArray(matches)) return { ok: false, error: 'Matches debe ser array' };

  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return { ok: false, error: 'Hoja MATCH no encontrada' };

  const changes = { cleared: 0, added: 0, errors: [], log: [] };

  // Step 1: Clear all existing rows for this fecha (cols B, C and D)
  // Col C now holds the matricula written directly (not a formula), so clear it too.
  const nextEmpty = findNextEmptyRow_(sh, 4);
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 2, nextEmpty - 2, 3).getValues();
    const rowsToClear = [];
    data.forEach((row, i) => {
      const f = String(row[0] || '').trim();
      if (f === String(fecha)) rowsToClear.push(i + 2);
    });
    rowsToClear.forEach(r => {
      try {
        sh.getRange(r, 2, 1, 3).clearContent(); // clear B, C and D in one call
        changes.cleared++;
      } catch (e) { changes.errors.push('clear row ' + r + ': ' + e.message); }
    });
    changes.log.push('cleared ' + changes.cleared + ' rows of fecha ' + fecha);
    SpreadsheetApp.flush();
  }

  // Step 2: Prepare new matches (validate + lookup names)
  if (!matches.length) {
    audit_('EDITAR_MATCHES', 'admin', { fecha, matches, changes });
    return { ok: true, changes: changes };
  }

  const prepared = [];
  matches.forEach((m, i) => {
    if (!m || !m.j1 || !m.j2) {
      changes.errors.push('match #' + i + ' inválido');
      return;
    }
    const name1 = lookupJugadorName_(m.j1);
    const name2 = lookupJugadorName_(m.j2);
    if (!name1 || !name2) {
      changes.errors.push('match #' + i + ' nombre no encontrado');
      return;
    }
    // Include matriculas so col C can be written directly (see cargarMatches_ for rationale)
    prepared.push({ index: i, mat1: String(m.j1), mat2: String(m.j2), name1: name1, name2: name2 });
  });

  if (!prepared.length) {
    audit_('EDITAR_MATCHES', 'admin', { fecha, matches, changes });
    return { ok: false, error: 'Ningún match válido', changes: changes };
  }

  // Step 3: Find starting row and ensure sheet has enough capacity
  let nextRow = findNextEmptyRow_(sh, 4);
  if (nextRow % 2 === 1) nextRow++;
  const rowsNeeded = prepared.length * 2;
  const lastRequired = nextRow + rowsNeeded - 1;
  if (sh.getMaxRows() < lastRequired) {
    sh.insertRowsAfter(sh.getMaxRows(), lastRequired - sh.getMaxRows() + 10);
    changes.log.push('inserted rows to row ' + (lastRequired + 10));
  }

  // Step 4: Batch write cols B-C-D (fecha, matricula, nombre) — same approach as cargarMatches_
  const colBCD = [];
  prepared.forEach(p => {
    colBCD.push([fecha, p.mat1, p.name1]);
    colBCD.push([fecha, p.mat2, p.name2]);
  });
  try {
    sh.getRange(nextRow, 4, rowsNeeded, 1).clearDataValidations(); // col D dropdown
    sh.getRange(nextRow, 2, rowsNeeded, 3).setValues(colBCD);
    changes.added = prepared.length;
    changes.log.push('batch wrote cols B-C-D ' + rowsNeeded + ' rows starting ' + nextRow);
  } catch (e) {
    changes.errors.push('batch write ERROR: ' + e.message);
  }

  SpreadsheetApp.flush();
  changes.log.push('wrote ' + changes.added + ' matches starting row ' + nextRow);

  audit_('EDITAR_MATCHES', 'admin', { fecha, matches, changes });
  if (changes.errors.length > 0) {
    return { ok: false, error: changes.errors.join(' | '), changes: changes };
  }
  return { ok: true, changes: changes };
}

// ════════════ RESULTADOS POR FECHA ════════════

/**
 * Read stableford results for a given fecha from STB sheet
 * STB columns: B=fecha, C=matricula, D=nombre, K=total stableford
 * Returns array sorted descending by STB, with hcp from TARJETAS
 */
function getStablefordForFecha_(fecha) {
  const sh = getSheet_('STB');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // Read B through K (10 cols: B,C,D,E,F,G,H,I,J,K)
  const data = sh.getRange(2, 2, lastRow - 1, 10).getValues();
  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  // Get HCP per player from TARJETAS for this fecha
  const hcpMap = {};
  const shT = getSheet_(SHEETS.TARJETAS);
  if (shT) {
    const nextEmpty = findNextEmptyRow_(shT, 2);
    if (nextEmpty > 2) {
      const tData = shT.getRange(2, 2, nextEmpty - 2, 4).getValues(); // B,C,D,E
      tData.forEach(r => {
        const f = String(r[0] || '').trim();
        const m = String(r[1] || '').trim();
        const hcp = r[3];
        if (f === String(fecha) && m) hcpMap[m] = hcp;
      });
    }
  }

  const out = [];
  data.forEach(row => {
    const f = String(row[0] || '').trim();  // B = fecha
    const m = String(row[1] || '').trim();  // C = matricula
    const n = String(row[2] || '').trim();  // D = nombre
    const stb = row[9];                      // K = stableford total (col index 9 from B offset)
    if (f !== String(fecha) || !m) return;
    if (stb === '' || stb === null || stb === undefined) return;
    const jug = jugMap[m];
    out.push({
      matricula: m,
      nombre: jug ? jug.nombre : n,
      apodo: jug ? jug.apodo : '',
      stb: parseFloat(stb) || 0,
      hcp: hcpMap[m] !== undefined ? hcpMap[m] : '',
    });
  });
  // Sort descending by STB
  out.sort((a, b) => b.stb - a.stb);
  return out;
}

/**
 * Get full resultados for a fecha: cancha, LD/BA winners, stableford ranking, matches
 */
function getFechaResultados_(fecha) {
  if (!fecha) return null;

  // 1) Cancha name + ID — read from TARJETAS cols B,F,G for first matching row
  let cancha = '';
  let canchaId = '';
  const shT = getSheet_(SHEETS.TARJETAS);
  if (shT) {
    const nextEmpty = findNextEmptyRow_(shT, 2);
    if (nextEmpty > 2) {
      const data = shT.getRange(2, 2, nextEmpty - 2, 6).getValues(); // B–G
      for (let i = 0; i < data.length; i++) {
        const f = String(data[i][0] || '').trim();
        const c = String(data[i][4] || '').trim();
        const id = String(data[i][5] || '').trim();
        if (f === String(fecha) && c) { cancha = c; canchaId = id; break; }
      }
    }
  }

  // 2) LD / BA winners — from existing function
  const bw = getBonusWinners_(fecha);

  // 3) Stableford ranking
  const stableford = getStablefordForFecha_(fecha);

  // 4) Matches (raw pairs — frontend calcs result from scores like the live Match section does)
  const matches = getMatchesForFecha_(fecha);

  return {
    fecha: String(fecha),
    cancha: cancha,
    canchaId: canchaId,
    modalidad: 'Stableford + Match',
    ldWinner: bw.ldWinner,
    baWinner: bw.baWinner,
    stableford: stableford,
    matches: matches,
  };
}

/**
 * Read CALCULOS!AA2:AC12 and return the next upcoming fecha (first row where AA date is in the future).
 * Columns: AA=fecha (date), AB=cancha (name or blank), AC=nro de fecha
 * Returns { fecha: 'YYYY-MM-DD' (ISO), cancha: string, fechaNum: number, millisUntil: number } or null if no future fecha
 */
function getProximaFecha_() {
  const sh = getSheet_('CALCULOS');
  if (!sh) return null;
  // AA = col 27, AB = col 28, AC = col 29
  const data = sh.getRange(2, 27, 11, 3).getValues();
  const now = new Date();
  const nowTime = now.getTime();

  const upcoming = [];
  const all = [];
  data.forEach(row => {
    const fechaRaw = row[0];
    const cancha = String(row[1] || '').trim();
    const fechaNum = row[2];
    if (!fechaRaw || !fechaNum) return;
    let dateObj = null;
    if (fechaRaw instanceof Date) {
      dateObj = fechaRaw;
    } else {
      const parsed = new Date(fechaRaw);
      if (!isNaN(parsed.getTime())) dateObj = parsed;
    }
    if (!dateObj) return;
    const item = {
      fecha: dateObj.toISOString(),
      fechaDisplay: Utilities.formatDate(dateObj, 'GMT-03:00', 'EEEE d \'de\' MMMM, yyyy'),
      cancha: cancha || 'Cancha a definir',
      fechaNum: parseInt(fechaNum) || fechaNum,
      millisUntil: dateObj.getTime() - nowTime,
    };
    all.push(item);
    // Keep showing the fecha until end of the day AFTER it's played.
    // Dates from Sheets arrive at 00:00:00, so without this offset the card
    // disappears at midnight — before the round even starts on Sunday morning.
    // +48 h covers the full event day + the following day.
    const MS_48H = 48 * 60 * 60 * 1000;
    if (dateObj.getTime() + MS_48H >= nowTime) upcoming.push(item);
  });

  // Sort upcoming by millisUntil ascending (soonest first)
  upcoming.sort((a, b) => a.millisUntil - b.millisUntil);
  if (upcoming.length) return upcoming[0];

  // If no upcoming fecha, return the most recent past one so UI can show a "torneo finalizado" message
  all.sort((a, b) => b.millisUntil - a.millisUntil);
  return all.length ? { ...all[0], isPast: true } : null;
}

// ════════════ HISTÓRICO (NGT DB) ════════════

const HIST_SHEET_ID = '1qCtyWVqcfQxL9TOSJI3v7O7mPjQ-qHCyLK5hNckVC5U';

function getHistSheet_(name) {
  try {
    return SpreadsheetApp.openById(HIST_SHEET_ID).getSheetByName(name);
  } catch (e) {
    return null;
  }
}

/**
 * All players from the historic JUGADORES sheet.
 * Cols: A=matricula, B=nombre, C=año debut.
 * Returns [{ matricula, nombre, anioDebut }]
 */
function getJugadoresHist_() {
  const sh = getHistSheet_('JUGADORES');
  if (!sh) return [];
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  // Cols: A=matricula, B=nombre, C=anio debut, D=ediciones_prev (pre-2017)
  const data = sh.getRange(2, 1, lr - 1, 4).getValues();
  const out = [];
  data.forEach(r => {
    const m = String(r[0] || '').trim();
    const n = String(r[1] || '').trim();
    const a = r[2];
    const ep = r[3];
    if (!m) return;
    out.push({
      matricula: m,
      nombre: n,
      anioDebut: a ? parseInt(a) : null,
      edicionesPrev: (ep === '' || ep === null || ep === undefined) ? 0 : (parseInt(ep) || 0),
    });
  });
  return out;
}

/**
 * Build map of cancha id → { id, nombre, pares[18], indices[18] }
 * NGT DB CANCHAS structure: A=ID, B=NOMBRE, C=HOYO (1..18), D=PAR, E=INDICE
 * One row per hole, so 18 rows per cancha
 */
function getCanchasHistMap_() {
  const sh = getHistSheet_('CANCHAS');
  if (!sh) return {};
  const lr = sh.getLastRow();
  if (lr < 2) return {};
  const data = sh.getRange(2, 1, lr - 1, 5).getValues();
  const map = {};
  data.forEach(r => {
    const id = String(r[0] || '').trim();
    const nombre = String(r[1] || '').trim();
    const hoyo = parseInt(r[2]);
    const par = parseInt(r[3]);
    const idx = parseInt(r[4]);
    if (!id || !hoyo || hoyo < 1 || hoyo > 18) return;
    if (!map[id]) {
      map[id] = {
        id: id,
        nombre: nombre,
        pares: new Array(18).fill(null),
        indices: new Array(18).fill(null),
      };
    }
    if (nombre && !map[id].nombre) map[id].nombre = nombre;
    if (!isNaN(par)) map[id].pares[hoyo - 1] = par;
    if (!isNaN(idx)) map[id].indices[hoyo - 1] = idx;
  });
  return map;
}

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
  const lr = sh.getLastRow();
  if (lr < 2) return {};
  // Read B=fecha (nro) and AG=color (col 33)
  const fechas = sh.getRange(2, 2, lr - 1, 1).getValues();
  const colors = sh.getRange(2, 33, lr - 1, 1).getValues();
  const map = {};
  for (let i = 0; i < fechas.length; i++) {
    const n = parseInt(fechas[i][0]);
    const c = String(colors[i][0] || '').trim().toUpperCase();
    if (!isNaN(n) && c && !map[n]) map[n] = c;
  }
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

/* ════════════════════ WIN PROBABILITIES (Monte Carlo v2) ════════════════════ */

/** Box-Muller normal random sample. */
function sampleNormal_(mean, std) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/**
 * Sample match points for a fecha (2 matches per fecha, each 0/3/6).
 * Possible values: 0, 3, 6, 9, 12.
 * Snaps a Normal(meanPoints, std) sample to nearest valid value.
 */
function sampleMatchPoints_(meanPoints) {
  const r = sampleNormal_(meanPoints, 3.8);
  if (r < 1.5) return 0;
  if (r < 4.5) return 3;
  if (r < 7.5) return 6;
  if (r < 10.5) return 9;
  return 12;
}

/**
 * Sample PB (Long Drive + Best Approach) for a fecha. Each award = 3 points.
 * Two independent bernoullis with rate inferred from observed mean.
 */
function samplePB_(pbMeanPerFecha) {
  const pPerAward = Math.min(1, Math.max(0, (pbMeanPerFecha || 0) / 6));
  let total = 0;
  if (Math.random() < pPerAward) total += 3;
  if (Math.random() < pPerAward) total += 3;
  return total;
}

/** Get current course HCP for each player from latest 2026 tarjeta. */
function getHcpMapActual_() {
  const sh = getSheet_(SHEETS.TARJETAS);
  const map = {};
  if (!sh) return map;
  const lr = sh.getLastRow();
  if (lr < 2) return map;
  const data = sh.getRange(2, 2, lr - 1, 4).getValues();
  const lastByPlayer = {};
  data.forEach(r => {
    const m = String(r[1] || '').trim();
    if (!m) return;
    const f = parseInt(r[0]);
    const h = parseFloat(r[3]);
    if (isNaN(h)) return;
    if (!lastByPlayer[m] || (!isNaN(f) && f > lastByPlayer[m].f)) {
      lastByPlayer[m] = { f: isNaN(f) ? 0 : f, hcp: h };
    }
  });
  Object.keys(lastByPlayer).forEach(m => { map[m] = lastByPlayer[m].hcp; });
  return map;
}

/**
 * Compute Win % and Top 8 % per player using Monte Carlo simulation v2.
 *
 * Decomposes points into ST/MA/PB/DB per fecha. Models each stochastically.
 * Detects who already used their "doble" — players who haven't get +max ST
 * across remaining fechas (assumes optimal play: use doble in best fecha).
 *
 * @param simulations how many MC iterations (default 5000)
 */
function getWinProbabilities_(simulations) {
  const SIMS = simulations || 5000;
  const NUM_FECHAS = 8;

  // Read SCORE with detailed per-fecha breakdown
  const sh = getSheet_(SHEETS.SCORE);
  if (!sh) return null;
  const lr = sh.getLastRow();
  if (lr < 2) return null;
  const totalCols = 4 + 4 * NUM_FECHAS;
  const data = sh.getRange(2, 1, lr - 1, totalCols).getValues();

  // Get valid player matriculas (filters out phantom/template rows)
  const jugadoresList = getJugadores_();
  const validMats = {};
  jugadoresList.forEach(j => { validMats[String(j.matricula).trim()] = true; });

  // Helper to detect "DB used"
  function isDbUsed(v) {
    if (v === true) return true;
    const s = String(v || '').toUpperCase().trim();
    if (s === 'TRUE' || s === 'VERDADERO' || s === 'SI' || s === 'YES') return true;
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  }

  // PASS 1: detect global fechasJugadas at tournament level.
  // A fecha is "played" if at least one player has ST > 0 in it.
  let globalFechasJugadas = 0;
  data.forEach(r => {
    const m = String(r[0] || '').trim();
    if (!validMats[m]) return;
    for (let f = 0; f < NUM_FECHAS; f++) {
      const idx = 4 + f * 4;
      const st = parseFloat(r[idx]);
      if (!isNaN(st) && st > 0 && (f + 1) > globalFechasJugadas) {
        globalFechasJugadas = f + 1;
      }
    }
  });
  const fechasRestantes = Math.max(0, NUM_FECHAS - globalFechasJugadas);

  // PASS 2: build players, only counting fechas they actually played
  // within the first globalFechasJugadas tournament fechas.
  const players = [];
  data.forEach(r => {
    const m = String(r[0] || '').trim();
    const nombre = String(r[1] || '').trim();
    if (!validMats[m]) return;     // skip phantom/template rows
    const total = parseFloat(r[2]) || 0;

    let stHistory = [], maHistory = [], pbHistory = [];
    let dobleUsed = false;
    let playedCount = 0;

    for (let f = 0; f < globalFechasJugadas; f++) {
      const idx = 4 + f * 4;
      const stRaw = r[idx], maRaw = r[idx+1], pbRaw = r[idx+2], dbRaw = r[idx+3];
      const st = parseFloat(stRaw);
      const ma = parseFloat(maRaw);
      const pb = parseFloat(pbRaw);
      // Player played this fecha if their ST is positive (everyone scores at least
      // a few stableford points if they actually played). MA can be 0 legitimately.
      const played = (!isNaN(st) && st > 0) || (!isNaN(ma) && ma > 0);
      if (played) {
        playedCount++;
        stHistory.push(isNaN(st) ? 0 : st);
        maHistory.push(isNaN(ma) ? 0 : ma);
        pbHistory.push(isNaN(pb) ? 0 : pb);
        if (isDbUsed(dbRaw)) dobleUsed = true;
      }
    }

    players.push({
      matricula: m,
      nombre: nombre,
      currentPoints: total,
      stHistory: stHistory,
      maHistory: maHistory,
      pbHistory: pbHistory,
      dobleUsed: dobleUsed,
      playedCount: playedCount,
    });
  });

  if (!players.length) return null;

  // Tournament averages from observed history
  const allST = [], allMA = [], allPB = [];
  players.forEach(p => {
    p.stHistory.forEach(v => { if (v > 0) allST.push(v); });
    p.maHistory.forEach(v => allMA.push(v));
    p.pbHistory.forEach(v => allPB.push(v));
  });
  const tourAvgST = allST.length ? (allST.reduce(function(a,b){return a+b;}, 0) / allST.length) : 28;
  const tourAvgMA = allMA.length ? (allMA.reduce(function(a,b){return a+b;}, 0) / allMA.length) : 6;
  const tourAvgPB = allPB.length ? (allPB.reduce(function(a,b){return a+b;}, 0) / allPB.length) : 0.5;

  // HCP map for new players
  const hcpMap = getHcpMapActual_();
  const hcpVals = Object.keys(hcpMap).map(k => hcpMap[k]).filter(v => !isNaN(v));
  const tourAvgHcp = hcpVals.length ? (hcpVals.reduce(function(a,b){return a+b;}, 0) / hcpVals.length) : 18;

  // Per-fecha stableford std dev (calibrated to typical NGT variance)
  const ST_STD = 7;
  // Regression weight: equivalent to "REG_W extra fechas at tour avg"
  const REG_W = 2.5;

  // Per-player skill estimates
  players.forEach(p => {
    if (p.playedCount >= 1) {
      const sumST = p.stHistory.reduce(function(a,b){return a+b;}, 0);
      p.stMean = (sumST + REG_W * tourAvgST) / (p.playedCount + REG_W);
      const sumMA = p.maHistory.reduce(function(a,b){return a+b;}, 0);
      p.maMean = (sumMA + REG_W * tourAvgMA) / (p.playedCount + REG_W);
      const sumPB = p.pbHistory.reduce(function(a,b){return a+b;}, 0);
      p.pbMean = (sumPB + REG_W * tourAvgPB) / (p.playedCount + REG_W);
    } else {
      // No history — infer ST from HCP, default for MA/PB
      const playerHcp = hcpMap[p.matricula];
      let stAdj = 0;
      if (!isNaN(playerHcp)) stAdj = (tourAvgHcp - playerHcp) * 0.3;
      p.stMean = tourAvgST + stAdj;
      p.maMean = tourAvgMA;
      p.pbMean = tourAvgPB;
    }
    p.stStd = ST_STD;
  });

  // Tallies
  const wins = {};
  const top8s = {};
  players.forEach(p => { wins[p.matricula] = 0; top8s[p.matricula] = 0; });

  if (fechasRestantes === 0) {
    const sorted = players.slice().sort((a,b) => b.currentPoints - a.currentPoints);
    if (sorted.length) wins[sorted[0].matricula] = SIMS;
    for (let i = 0; i < Math.min(8, sorted.length); i++) top8s[sorted[i].matricula] = SIMS;
  } else {
    for (let sim = 0; sim < SIMS; sim++) {
      const sims = new Array(players.length);
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        let total = p.currentPoints;
        // Only simulate the fechas REMAINING in the tournament. Players who missed
        // earlier fechas don't get to recover those points; their currentPoints
        // already reflects the absence (zeros for missed fechas).
        const stSims = new Array(fechasRestantes);
        for (let f = 0; f < fechasRestantes; f++) {
          // Stableford
          let st = sampleNormal_(p.stMean, p.stStd);
          if (st < 5) st = 5;       // floor (no one scores below ~5 stb)
          if (st > 50) st = 50;     // ceiling
          stSims[f] = st;
          total += st;
          // Match (0/3/6/9/12)
          total += sampleMatchPoints_(p.maMean);
          // PB (LD + BA bonuses, each 3 pts)
          total += samplePB_(p.pbMean);
        }
        // Doble bonus: if not used yet, player uses it on their best fecha (optimal)
        if (!p.dobleUsed && stSims.length > 0) {
          let maxSt = stSims[0];
          for (let k = 1; k < stSims.length; k++) {
            if (stSims[k] > maxSt) maxSt = stSims[k];
          }
          total += maxSt;
        }
        sims[i] = { matricula: p.matricula, total: total };
      }
      sims.sort(function(a,b){ return b.total - a.total; });
      wins[sims[0].matricula]++;
      const topN = Math.min(8, sims.length);
      for (let i = 0; i < topN; i++) top8s[sims[i].matricula]++;
    }
  }

  const out = players.map(p => ({
    matricula: p.matricula,
    nombre: p.nombre,
    currentPoints: Math.round(p.currentPoints * 10) / 10,
    fechasPlayed: p.playedCount,
    dobleUsed: p.dobleUsed,
    avgST: Math.round(p.stMean * 10) / 10,
    avgMA: Math.round(p.maMean * 10) / 10,
    avgPB: Math.round(p.pbMean * 100) / 100,
    winPct: Math.round((wins[p.matricula] / SIMS) * 1000) / 10,
    top8Pct: Math.round((top8s[p.matricula] / SIMS) * 1000) / 10,
  }));
  out.sort(function(a,b){ return b.winPct - a.winPct; });

  return {
    fechasJugadas: globalFechasJugadas,
    fechasRestantes: fechasRestantes,
    simulations: SIMS,
    tourAvg: {
      st: Math.round(tourAvgST * 10) / 10,
      ma: Math.round(tourAvgMA * 10) / 10,
      pb: Math.round(tourAvgPB * 100) / 100,
    },
    players: out,
    generated: new Date().toISOString(),
  };
}

/**
 * Cached wrapper: caches result for 30 minutes via Apps Script CacheService.
 */
function getWinProbabilitiesCached_() {
  try {
    const cache = CacheService.getScriptCache();
    const key = 'winProbs_v4';   // bumped: missed-fechas fix
    const cached = cache.get(key);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    const result = getWinProbabilities_();
    if (result) {
      try { cache.put(key, JSON.stringify(result), 30 * 60); } catch (e) {}
    }
    return result;
  } catch (e) {
    return getWinProbabilities_();
  }
}

/* ════════════════════ end Win Probabilities ════════════════════ */

/**
 * Calculate stableford for a single hole (85% rule).
 * Returns 0..5, or null if any input missing.
 */
function calcStablefordHole_(score, par, indice, hcpJuego) {
  if (score === null || score === undefined || score === '' || !par || !indice) return null;
  const s = parseInt(score);
  if (isNaN(s) || s <= 0) return null;
  if (hcpJuego === null || hcpJuego === undefined || hcpJuego === '') return null;
  const hcp85 = Math.round(parseFloat(hcpJuego) * 0.85);
  const extras = Math.floor((hcp85 + 18 - indice) / 18);
  const netoDiff = s - par - extras;
  if (netoDiff <= -3) return 5;
  if (netoDiff === -2) return 4;
  if (netoDiff === -1) return 3;
  if (netoDiff === 0) return 2;
  if (netoDiff === 1) return 1;
  return 0;
}

/**
 * Get all historical tarjetas for a matricula.
 * NGT DB TARJETAS structure (CONFIRMED by user):
 *   A=fecha real (date), B=nro fecha torneo, C=matricula, D=hcp de juego,
 *   E=cancha ID, F..W=H1..H18 (18 holes), X=LD, Y=BA, Z=ida, AA=vuelta,
 *   AB=gross, AC=neto
 */
function getTarjetasHistJugador_(matricula) {
  const sh = getHistSheet_('TARJETAS');
  if (!sh) return [];
  const lr = sh.getLastRow();
  if (lr < 2) return [];
  // Read A..Y (cols 1..25): fecha, nroFecha, matricula, hcp, cancha, 18 holes, LD, BA
  const data = sh.getRange(2, 1, lr - 1, 25).getValues();
  const matStr = String(matricula).trim();
  const out = [];
  data.forEach(r => {
    const m = String(r[2] || '').trim();
    if (m !== matStr) return;
    const fechaReal = r[0];
    const nroFecha = r[1];
    const hcp = r[3];           // D = HCP
    const cancha = String(r[4] || '').trim();  // E = cancha ID
    const scores = r.slice(5, 23); // F..W = 18 holes (col index 5..22 inclusive)
    const ld = r[23];           // X = LD
    const ba = r[24];           // Y = BA
    out.push({
      fechaReal: fechaReal,
      nroFecha: nroFecha,
      matricula: m,
      cancha: cancha,
      hcp: (hcp === '' || hcp === null) ? null : parseFloat(hcp),
      scores: scores.map(s => (s === '' || s === null) ? null : parseInt(s)),
      ld: ld === 1 || ld === true || ld === '1',
      ba: ba === 1 || ba === true || ba === '1',
    });
  });
  return out;
}

/**
 * Sum totals from GOLPES sheet for a matricula across all fechas.
 * GOLPES cols: A=fecha real, B=nroFecha, C=matricula, D=cancha,
 *   E=albatros, F=aguilas, G=birdies, H=pares, I=bogeys, J=dobles, K=triples+
 */
function getGolpesHistJugador_(matricula) {
  const sh = getHistSheet_('GOLPES');
  if (!sh) return null;
  const lr = sh.getLastRow();
  if (lr < 2) return { albatros:0, aguilas:0, birdies:0, pares:0, bogeys:0, dobles:0, triples:0, fechas:0 };
  const data = sh.getRange(2, 1, lr - 1, 11).getValues();
  const matStr = String(matricula).trim();
  const tot = { albatros:0, aguilas:0, birdies:0, pares:0, bogeys:0, dobles:0, triples:0, fechas:0 };
  data.forEach(r => {
    const m = String(r[2] || '').trim();
    if (m !== matStr) return;
    tot.albatros += parseInt(r[4]) || 0;
    tot.aguilas  += parseInt(r[5]) || 0;
    tot.birdies  += parseInt(r[6]) || 0;
    tot.pares    += parseInt(r[7]) || 0;
    tot.bogeys   += parseInt(r[8]) || 0;
    tot.dobles   += parseInt(r[9]) || 0;
    tot.triples  += parseInt(r[10]) || 0;
    tot.fechas++;
  });
  return tot;
}

/**
 * Debug helper: lists which (fecha, cancha) combinations exist in GOLPES
 * but NOT in TARJETAS for a given matricula. Useful for finding orphan rows.
 */
function debugGolpesVsTarjetas_(matricula) {
  if (!matricula) return null;
  const matStr = String(matricula).trim();

  // Read GOLPES rows for this matricula
  // Cols: A=fecha real, B=nroFecha, C=matricula, D=cancha id, E..K=albatros..triples
  const shG = getHistSheet_('GOLPES');
  const golpesRows = [];
  if (shG && shG.getLastRow() >= 2){
    const dataG = shG.getRange(2, 1, shG.getLastRow() - 1, 11).getValues();
    dataG.forEach((r, idx) => {
      const m = String(r[2] || '').trim();
      if (m !== matStr) return;
      const fecha = r[0];
      const nroFecha = r[1];
      const cancha = String(r[3] || '').trim();
      const fechaStr = fecha instanceof Date ? Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(fecha || '');
      golpesRows.push({
        rowIndex: idx + 2,           // 1-indexed row number in the sheet
        fecha: fechaStr,
        nroFecha: nroFecha,
        cancha: cancha,
        key: fechaStr + '|' + cancha,
        totales: {
          albatros: parseInt(r[4]) || 0,
          aguilas:  parseInt(r[5]) || 0,
          birdies:  parseInt(r[6]) || 0,
          pares:    parseInt(r[7]) || 0,
          bogeys:   parseInt(r[8]) || 0,
          dobles:   parseInt(r[9]) || 0,
          triples:  parseInt(r[10]) || 0,
        },
      });
    });
  }

  // Read TARJETAS for this matricula and build a Set of (fecha+cancha) keys
  const tarjetas = getTarjetasHistJugador_(matStr);
  const tarjKeys = new Set();
  const tarjList = [];
  tarjetas.forEach(t => {
    const fechaStr = t.fechaReal instanceof Date
      ? Utilities.formatDate(t.fechaReal, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(t.fechaReal || '');
    const key = fechaStr + '|' + t.cancha;
    tarjKeys.add(key);
    tarjList.push({ fecha: fechaStr, cancha: t.cancha, key: key });
  });

  // Build set of GOLPES keys for reverse check
  const golpKeys = new Set();
  golpesRows.forEach(g => golpKeys.add(g.key));

  // Orphans: GOLPES rows that have no matching TARJETA
  const orphansInGolpes = golpesRows.filter(g => !tarjKeys.has(g.key));

  // Orphans: TARJETAS that have no matching GOLPES row
  const orphansInTarjetas = tarjList.filter(t => !golpKeys.has(t.key));

  return {
    matricula: matStr,
    totalEnGolpes: golpesRows.length,
    totalEnTarjetas: tarjetas.length,
    diferencia: golpesRows.length - tarjetas.length,
    orphansEnGolpes: orphansInGolpes,                  // hay en GOLPES pero no en TARJETAS
    orphansEnTarjetas: orphansInTarjetas,              // hay en TARJETAS pero no en GOLPES
  };
}

/**
 * Get podium counts (1°, 2°, 3°) from POSICIONES for a matricula.
 * POSICIONES cols: A=año, B=matricula, C=nombre, D=posición
 */
function getCampeones_(matricula) {
  const sh = getHistSheet_('POSICIONES');
  if (!sh) return { p1:0, p2:0, p3:0, podios:[] };
  const lr = sh.getLastRow();
  if (lr < 2) return { p1:0, p2:0, p3:0, podios:[] };
  const data = sh.getRange(2, 1, lr - 1, 4).getValues();
  const matStr = String(matricula).trim();
  let p1=0, p2=0, p3=0;
  const podios = [];
  data.forEach(r => {
    const m = String(r[1] || '').trim();
    if (m !== matStr) return;
    const pos = parseInt(r[3]);
    const anio = r[0];
    if (pos === 1){ p1++; podios.push({anio: anio, pos: 1}); }
    else if (pos === 2){ p2++; podios.push({anio: anio, pos: 2}); }
    else if (pos === 3){ p3++; podios.push({anio: anio, pos: 3}); }
  });
  return { p1: p1, p2: p2, p3: p3, podios: podios };
}

/**
 * Build full player profile for the public profile page.
 */
function getJugadorPerfil_(matricula) {
  if (!matricula) return null;
  const matStr = String(matricula).trim();

  // Identidad
  const jugadores = getJugadoresHist_();
  const jug = jugadores.find(j => j.matricula === matStr);
  if (!jug) return { ok: false, error: 'Jugador no encontrado en histórico' };

  // Tarjetas históricas
  const tarjetas = getTarjetasHistJugador_(matStr);

  // Canchas (para calcular stableford retroactivo)
  const canchasMap = getCanchasHistMap_();

  // Calcular stableford y gross para cada tarjeta
  let mejorStb = -1, mejorStbInfo = null;
  let mejorGross = 9999, mejorGrossInfo = null;
  let mejorNeto = 9999, mejorNetoInfo = null;     // #5
  let mejorHcp = 999, mejorHcpInfo = null;        // #5
  const rondasBajoPar = [];                        // #6: { neto, par, diff, gross, hcp, cancha, anio, fecha }
  let sumStb = 0, countStb = 0;
  const canchaCounts = {};       // cancha id → count
  const canchaStb = {};          // cancha id → { sum, count, nombre }
  const aniosSet = new Set();
  let ldGanados = 0;
  let baGanados = 0;
  let hcpUltimo = null;
  let fechaUltima = null;

  tarjetas.forEach(t => {
    if (t.ld) ldGanados++;
    if (t.ba) baGanados++;

    // Año (de fecha real)
    let anio = null;
    if (t.fechaReal instanceof Date) anio = t.fechaReal.getFullYear();
    else if (t.fechaReal) {
      const d = new Date(t.fechaReal);
      if (!isNaN(d.getTime())) anio = d.getFullYear();
    }
    if (anio) aniosSet.add(anio);

    // HCP último (la tarjeta más reciente)
    if (t.fechaReal && t.hcp !== null){
      const dT = (t.fechaReal instanceof Date) ? t.fechaReal : new Date(t.fechaReal);
      if (!isNaN(dT.getTime()) && (!fechaUltima || dT.getTime() > fechaUltima.getTime())){
        fechaUltima = dT;
        hcpUltimo = t.hcp;
      }
    }

    // Cancha
    if (t.cancha) {
      canchaCounts[t.cancha] = (canchaCounts[t.cancha] || 0) + 1;
    }

    // Calcular gross y stableford
    let gross = 0;
    let hayScores = true;
    let stbTotal = 0;
    let hayStb = (t.hcp !== null);
    const cancha = canchasMap[t.cancha] || null;

    for (let h = 0; h < 18; h++) {
      const s = t.scores[h];
      if (s === null || s === undefined || isNaN(s) || s <= 0) {
        hayScores = false;
        continue;
      }
      gross += s;
      if (cancha && hayStb) {
        const par = cancha.pares[h];
        const idx = cancha.indices[h];
        const pts = calcStablefordHole_(s, par, idx, t.hcp);
        if (pts !== null) stbTotal += pts;
        else hayStb = false;
      }
    }

    // Mejor gross
    if (hayScores && gross > 0 && gross < mejorGross) {
      mejorGross = gross;
      mejorGrossInfo = {
        gross: gross,
        cancha: cancha ? cancha.nombre : t.cancha,
        canchaId: t.cancha,
        fecha: t.fechaReal,
        anio: anio,
      };
    }

    // Mejor HCP histórico (el HCP de juego más bajo que tuvo)
    if (t.hcp !== null && t.hcp < mejorHcp){
      mejorHcp = t.hcp;
      mejorHcpInfo = {
        hcp: t.hcp,
        cancha: cancha ? cancha.nombre : t.cancha,
        anio: anio,
        fecha: t.fechaReal,
      };
    }

    // Mejor neto + rondas bajo par (necesitamos gross válido + hcp + par cancha)
    if (hayScores && gross > 0 && t.hcp !== null && cancha && cancha.pares){
      const parCancha = cancha.pares.reduce((acc, v) => acc + (v || 0), 0);
      if (parCancha > 0){
        const neto = gross - t.hcp;
        // Mejor neto (el más bajo)
        if (neto < mejorNeto){
          mejorNeto = neto;
          mejorNetoInfo = {
            neto: neto,
            gross: gross,
            hcp: t.hcp,
            par: parCancha,
            cancha: cancha.nombre || t.cancha,
            canchaId: t.cancha,
            fecha: t.fechaReal,
            anio: anio,
          };
        }
        // Rondas bajo par (neto < par cancha)
        if (neto < parCancha){
          rondasBajoPar.push({
            neto: neto,
            gross: gross,
            hcp: t.hcp,
            par: parCancha,
            diff: neto - parCancha,           // negativo
            cancha: cancha.nombre || t.cancha,
            canchaId: t.cancha,
            anio: anio,
            fecha: t.fechaReal,
            // Tarjeta detallada para el modal de "click en ronda"
            scores: t.scores.slice(),
            pares: cancha.pares.slice(),
            indices: cancha.indices ? cancha.indices.slice() : new Array(18).fill(null),
          });
        }
      }
    }

    // Mejor stableford + promedio + por cancha
    if (hayScores && hayStb) {
      sumStb += stbTotal;
      countStb++;
      if (stbTotal > mejorStb) {
        mejorStb = stbTotal;
        mejorStbInfo = {
          stb: stbTotal,
          cancha: cancha ? cancha.nombre : t.cancha,
          canchaId: t.cancha,
          fecha: t.fechaReal,
          anio: anio,
        };
      }
      if (t.cancha) {
        if (!canchaStb[t.cancha]) {
          canchaStb[t.cancha] = { sum: 0, count: 0, nombre: cancha ? cancha.nombre : t.cancha };
        }
        canchaStb[t.cancha].sum += stbTotal;
        canchaStb[t.cancha].count++;
      }
    }
  });

  // Cancha más jugada
  let canchaTopId = null, canchaTopCount = 0;
  Object.keys(canchaCounts).forEach(id => {
    if (canchaCounts[id] > canchaTopCount) {
      canchaTopCount = canchaCounts[id];
      canchaTopId = id;
    }
  });
  const canchaTop = canchaTopId
    ? { id: canchaTopId, nombre: (canchasMap[canchaTopId] && canchasMap[canchaTopId].nombre) || canchaTopId, veces: canchaTopCount }
    : null;

  // Top canchas por stableford promedio (top 3, mínimo 3 rondas para evitar canchas con 1 sola visita)
  const canchasStbList = Object.keys(canchaStb).map(id => ({
    id: id,
    nombre: canchaStb[id].nombre,
    promedio: Math.round((canchaStb[id].sum / canchaStb[id].count) * 10) / 10,
    veces: canchaStb[id].count,
  })).filter(c => c.veces >= 3);
  canchasStbList.sort((a, b) => b.promedio - a.promedio);
  const canchasTopStb = canchasStbList.slice(0, 3);

  // Lista de canchas jugadas (para el dropdown del eclectic)
  const canchasJugadas = Object.keys(canchaCounts).map(id => ({
    id: id,
    nombre: (canchasMap[id] && canchasMap[id].nombre) || id,
    veces: canchaCounts[id],
  }));
  canchasJugadas.sort((a, b) => b.veces - a.veces);

  // Golpes
  const golpes = getGolpesHistJugador_(matStr);

  // Campeones
  const campeones = getCampeones_(matStr);

  // HCP actual: primero busca el último HCP cargado en TARJETAS del sheet 2026 NGT.
  // Si el jugador no tiene tarjeta cargada en 2026, cae al último HCP del histórico.
  let hcpActualFinal = hcpUltimo; // histórico por default
  try {
    const sh2026 = getSheet_(SHEETS.TARJETAS);
    if (sh2026) {
      const lr = sh2026.getLastRow();
      if (lr >= 2) {
        // TARJETAS 2026: B=fecha(nro), C=matricula, E=hcp
        const data2026 = sh2026.getRange(2, 2, lr - 1, 4).getValues();
        let lastFechaNum = -1;
        let lastHcp2026 = null;
        let minHcp2026 = null;          // lowest HCP across all 2026 cards
        data2026.forEach(r => {
          const m = String(r[1] || '').trim();
          if (m !== matStr) return;
          const f = parseInt(r[0]);
          const h = r[3];
          if (h === '' || h === null || h === undefined) return;
          const hNum = parseFloat(h);
          if (isNaN(hNum)) return;
          // Track minimum HCP across all 2026 cards
          if (minHcp2026 === null || hNum < minHcp2026) minHcp2026 = hNum;
          // Track most-recent HCP (last fecha)
          if (!isNaN(f) && f > lastFechaNum) {
            lastFechaNum = f;
            lastHcp2026 = hNum;
          }
        });
        if (lastHcp2026 !== null) hcpActualFinal = lastHcp2026;
        // Si hay HCPs del 2026 menores al mínimo histórico → actualizar mejorHcp
        if (minHcp2026 !== null && (mejorHcpInfo === null || minHcp2026 < mejorHcp)){
          mejorHcp = minHcp2026;
          mejorHcpInfo = { hcp: minHcp2026, cancha: '2026 NGT', anio: 2026, fecha: null };
        }
      }
    }
  } catch (e) {}

  // Final safety net: si el HCP actual es menor al mejor detectado, usar el actual
  if (hcpActualFinal !== null && hcpActualFinal !== undefined && (mejorHcpInfo === null || hcpActualFinal < mejorHcp)) {
    mejorHcp = hcpActualFinal;
    mejorHcpInfo = {
      hcp: hcpActualFinal,
      cancha: '2026 NGT',
      anio: 2026,
      fecha: null,
    };
  }

  // Sort rondasBajoPar by diff ascending (más negativo primero = mejor ronda bajo par)
  rondasBajoPar.sort((a, b) => a.diff - b.diff);

  // Ediciones jugadas: años distintos con tarjetas + ediciones previas a 2017 (del sheet)
  const edicionesTotales = aniosSet.size + (jug.edicionesPrev || 0);

  return {
    ok: true,
    identidad: {
      matricula: matStr,
      nombre: jug.nombre,
      anioDebut: jug.anioDebut,
      edicionesJugadas: edicionesTotales,
      edicionesConTarjeta: aniosSet.size,
      edicionesPrev: jug.edicionesPrev || 0,
      fechasJugadas: tarjetas.length,
    },
    cifras: {
      mejorStableford: mejorStbInfo,
      mejorGross: mejorGrossInfo === null ? null : mejorGrossInfo,
      mejorNeto: mejorNetoInfo,
      mejorHcp: mejorHcpInfo,
      hcpActual: hcpActualFinal,
      hcpNGT: getHcpNGT_(matStr),
    },
    golpes: golpes,
    bonus: {
      ldGanados: ldGanados,
      baGanados: baGanados,
    },
    campeones: campeones,
    canchaMasJugada: canchaTop,
    canchasTopStableford: canchasTopStb,
    canchasJugadas: canchasJugadas,
    rondasBajoPar: rondasBajoPar,
  };
}

/**
 * Eclectic card: best score per hole across all rounds the player has played
 * on the given cancha. Returns array of 18 best scores + total + N rondas usadas.
 */
function getJugadorEclectic_(matricula, canchaId) {
  if (!matricula || !canchaId) return null;
  const matStr = String(matricula).trim();
  const canchaStr = String(canchaId).trim();

  const tarjetas = getTarjetasHistJugador_(matStr).filter(t => t.cancha === canchaStr);
  const canchasMap = getCanchasHistMap_();
  const cancha = canchasMap[canchaStr] || null;

  if (!tarjetas.length) {
    return {
      ok: true,
      cancha: cancha ? cancha.nombre : canchaStr,
      canchaId: canchaStr,
      pares: cancha ? cancha.pares : new Array(18).fill(null),
      eclectic: new Array(18).fill(null),
      total: null,
      rondas: 0,
    };
  }

  const eclectic = new Array(18).fill(null);
  for (let h = 0; h < 18; h++) {
    let best = null;
    const par = cancha ? cancha.pares[h] : null;
    tarjetas.forEach(t => {
      const s = t.scores[h];
      if (s !== null && s !== undefined && !isNaN(s) && s > 0) {
        // Filter physically impossible scores: anything below par-2 is invalid
        // (only a hole-in-1 on a par-3 = score 1 is legitimate; par-4 minimum is 2; par-5 minimum is 3)
        if (par && s < (par - 2)) return;
        if (best === null || s < best) best = s;
      }
    });
    eclectic[h] = best;
  }

  const total = eclectic.every(v => v !== null) ? eclectic.reduce((a, b) => a + b, 0) : null;

  return {
    ok: true,
    cancha: cancha ? cancha.nombre : canchaStr,
    canchaId: canchaStr,
    pares: cancha ? cancha.pares : new Array(18).fill(null),
    eclectic: eclectic,
    total: total,
    rondas: tarjetas.length,
  };
}

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
        result = { ok: true, data: { proximaFecha: iProx, fechasConEstado: iFechas, jugadoresHist: iJugs } };
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
      case 'fechaResultados':  result = { ok: true, data: cachedRead_('fechaRes_' + params.fecha, 300, function(){ return getFechaResultados_(params.fecha); }) }; break;
      case 'fechaMeta':        result = { ok: true, data: getFechaMeta_(params.fecha) }; break;
      case 'jugadoresEnFecha': result = { ok: true, data: getJugadoresEnFecha_(params.fecha) }; break;
      case 'bonusWinners':     result = { ok: true, data: cachedRead_('bw_' + params.fecha, 30, function(){ return getBonusWinners_(params.fecha); }) }; break;
      case 'bonusesAcum':      result = { ok: true, data: cachedRead_('bonusesAcum', 120, getBonusesAcum_) }; break;
      case 'coloresCancha':    result = { ok: true, data: cachedRead_('colores_' + params.canchaId, 300, function(){ return getColoresCancha_(params.canchaId); }) }; break;
      case 'allColoresCancha': result = { ok: true, data: cachedRead_('allColoresCancha', 300, getAllColoresCancha_) }; break;
      case 'winProbabilities': result = { ok: true, data: getWinProbabilitiesCached_() }; break;
      case 'matchesForFecha':  result = { ok: true, data: getMatchesForFecha_(params.fecha) }; break;
      case 'misFechas':        result = { ok: true, data: cachedRead_('mf_' + params.matricula, 60, function(){ return getMisFechas_(params.matricula); }) }; break;
      case 'dobleDisponible':  result = { ok: true, data: { tieneDoble: getJugadoresConDobleDisponible_().indexOf(String(params.matricula)) >= 0 } }; break;
      case 'jugadoresConDoble': result = { ok: true, data: cachedRead_('jugadoresConDoble', 60, getJugadoresConDobleDisponible_) }; break;
      case 'fechaDetalle':     result = { ok: true, data: getFechaDetalle_(params.fecha) }; break;
      case 'tarjeta':          result = { ok: true, data: cachedRead_('tj_' + params.fecha + '_' + params.matricula, 60, function(){ return getTarjetaJugador_(params.fecha, params.matricula); }) }; break;
      case 'debugMatch':       result = { ok: true, data: debugMatch_() }; break;
      case 'debugDobles':      result = { ok: true, data: debugDobles_() }; break;
      case 'debugHcpCanchas':  result = { ok: true, data: debugHcpCanchas_() }; break;
      case 'login': {
        const p = checkPlayerByMat_(params.matricula);
        result = { ok: !!p, player: p };
        break;
      }
      case 'loginAdmin':       result = { ok: checkAdmin_(params.key) }; break;
      default:                 result = { ok: false, error: 'Acción desconocida: ' + action };
    }
  } catch (err) { result = { ok: false, error: String(err.message || err) }; }
  return callback ? jsonpResponse_(callback, result) : jsonResponse_(result);
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
      case 'cargarTarjeta':  result = cargarTarjeta_(params); break;
      case 'cargarMatches':  result = cargarMatches_(params); break;
      case 'editarMatches':  result = editarMatches_(params); break;
      default:               result = { ok: false, error: 'Acción desconocida: ' + action };
    }
  } catch (err) { result = { ok: false, error: String(err.message || err) }; }
  return jsonResponse_(result);
}

function test() {
  Logger.log('=== DEBUG MATCH ===');
  Logger.log(JSON.stringify(debugMatch_(), null, 2));
  Logger.log('=== CANCHAS ===');
  Logger.log(JSON.stringify(getCanchas_(), null, 2));
  Logger.log('=== FECHAS ACTIVAS ===');
  Logger.log(JSON.stringify(getFechasActivas_()));
}
