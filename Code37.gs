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

const COL_J = { ORDEN: 0, MATRICULA: 1, NOMBRE: 2, APODO: 3, HCP_INDEX: 4, HCP_UPDATED: 5 };
const COL_C = { ID: 0, NOMBRE: 1 }; // Slope/Rating leídos desde NGT DB hoja "Rating"

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
      const rawHcp = data[i][COL_J.HCP_INDEX];
      return {
        matricula:  m,
        nombre:     String(data[i][COL_J.NOMBRE]    || '').trim(),
        apodo:      String(data[i][COL_J.APODO]     || '').trim(),
        hcpIndex:   (rawHcp !== '' && rawHcp !== null && rawHcp !== undefined) ? (parseFloat(rawHcp) || null) : null,
        hcpUpdated: String(data[i][COL_J.HCP_UPDATED] || '').trim(),
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
    const rawHcp = data[i][COL_J.HCP_INDEX];
    out.push({
      matricula: m,
      nombre:     String(data[i][COL_J.NOMBRE]   || '').trim(),
      apodo:      String(data[i][COL_J.APODO]    || '').trim(),
      hcpIndex:   (rawHcp !== '' && rawHcp !== null && rawHcp !== undefined) ? (parseFloat(rawHcp) || null) : null,
      hcpUpdated: String(data[i][COL_J.HCP_UPDATED] || '').trim(),
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

// getFechaResultados_ definida más abajo (versión optimizada — una lectura por sheet)

function getMisFechas_(matricula) {
  // Returns fechas where this matricula has a row in TARJETAS, plus the pares + indices
  // for each cancha. Embedding pares+indices saves a round-trip when entering score screen.
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return [];
  const nextEmpty = findNextEmptyRow_(sh, 2);
  if (nextEmpty <= 2) return [];
  // Cols: A=FM, B=FECHA(0), C=MATRICULA(1), D=NOMBRE(2), E=HCP(3), F=CANCHA(4) … AG=COLOR_TEE(31)
  const data = sh.getRange(2, 2, nextEmpty - 2, 32).getValues();
  const out = [];
  const canchasNeeded = {};
  data.forEach((row, i) => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    if (m === String(matricula) && f) {
      const c  = String(row[4]  || '').trim();
      const ct = String(row[31] || '').trim().toUpperCase(); // AG = colorTee
      out.push({
        fecha:    f,
        hcp:      row[3] || '',
        cancha:   c,
        colorTee: ct || 'BLANCAS',
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
  // Returns { id, nombre, pares:[18], indices:[18], ratings:[{tee,rating,slope}] }
  // Name matching is case-insensitive.
  const sh = getSheet_(SHEETS.CANCHAS);
  if (!sh) return null;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  const data = sh.getRange(2, 1, lastRow - 1, 20).getValues(); // A:T (20 cols: id, nombre, 18 pares)
  const keyRaw = String(canchaNombreOrId).trim();
  const keyUp  = keyRaw.toUpperCase();

  let cancha = null;
  for (let i = 0; i < data.length; i++) {
    const id     = String(data[i][0] || '').trim();
    const nombre = String(data[i][1] || '').trim();
    if (id === keyRaw || nombre.toUpperCase() === keyUp) {
      cancha = {
        id:      id,
        nombre:  nombre,
        pares:   data[i].slice(2, 20).map(v => parseInt(v) || null),
        indices: [],
        ratings: [], // [{tee, rating, slope}] — llenado desde NGT DB Rating
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
        const id     = String(r[0] || '').trim();
        const nombre = String(r[1] || '').trim();
        if (id === cancha.id || nombre.toUpperCase() === cancha.nombre.toUpperCase()) {
          const hoyo   = parseInt(r[2]);
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

  // Read slope/rating per tee from NGT DB Rating (A=canchaId, B=nombre, C=tee, D=rating, E=slope)
  const shRating = getHistSheet_('Rating');
  if (shRating) {
    const lr = shRating.getLastRow();
    if (lr >= 2) {
      const rData = shRating.getRange(2, 1, lr - 1, 5).getValues();
      rData.forEach(r => {
        const id     = String(r[0] || '').trim();
        const nombre = String(r[1] || '').trim();
        if (id !== cancha.id && nombre.toUpperCase() !== cancha.nombre.toUpperCase()) return;
        const tee    = String(r[2] || '').trim();
        const rating = parseFloat(r[3]) || null;
        const slope  = parseInt(r[4])   || null;
        if (tee && slope) cancha.ratings.push({ tee, rating, slope });
      });
    }
  }

  return cancha;
}

/**
 * Builds { slope, rating, tee, hcpMap: { matricula → hcpJuego } } for a given cancha + tee color.
 * Used by crearFecha_ and editarFecha_ to pre-calculate HCP de juego for each player.
 * Returns null if slope data is not available for this cancha/color.
 *
 * Formula: hcpJuego = round(hcpIndex × slope / 113)
 * (simplified WHS course handicap — no par adjustment since par isn't stored per-cancha here)
 */
function buildHcpJuegoMap_(canchaId, canchaName, teeColor) {
  // ── 1. Find slope from NGT DB Rating sheet ────────────────────────────────
  const shRating = getHistSheet_('Rating');
  if (!shRating) return null;
  const rlr = shRating.getLastRow();
  if (rlr < 2) return null;

  const rData    = shRating.getRange(2, 1, rlr - 1, 5).getValues();
  const colorKey = String(teeColor || 'BLANCAS').trim().toUpperCase();
  const idKey    = String(canchaId   || '').trim();
  const nomKey   = String(canchaName || '').trim().toUpperCase();

  let slope = null, rating = null, matchedTee = null;

  // Exact color match first
  for (const r of rData) {
    const id  = String(r[0] || '').trim();
    const nom = String(r[1] || '').trim().toUpperCase();
    if (id !== idKey && nom !== nomKey) continue;
    if (String(r[2] || '').trim().toUpperCase() !== colorKey) continue;
    slope      = parseInt(r[4])   || null;
    rating     = parseFloat(r[3]) || null;
    matchedTee = String(r[2] || '').trim();
    break;
  }
  // Fallback: first row for this cancha regardless of color
  if (!slope) {
    for (const r of rData) {
      const id  = String(r[0] || '').trim();
      const nom = String(r[1] || '').trim().toUpperCase();
      if (id !== idKey && nom !== nomKey) continue;
      slope      = parseInt(r[4])   || null;
      rating     = parseFloat(r[3]) || null;
      matchedTee = String(r[2] || '').trim();
      break;
    }
  }
  if (!slope) return null;

  // ── 2. Read hcpIndex for every player from JUGADORES ─────────────────────
  const jugSh = getSheet_(SHEETS.JUGADORES);
  const hcpMap = {};
  if (jugSh) {
    const jlr = jugSh.getLastRow();
    if (jlr >= 2) {
      const cols = COL_J.HCP_INDEX + 1; // read enough columns to include HCP_INDEX
      const jData = jugSh.getRange(2, 1, jlr - 1, cols).getValues();
      jData.forEach(row => {
        const mat    = String(row[COL_J.MATRICULA] || '').trim();
        const rawHcp = row[COL_J.HCP_INDEX];
        if (!mat || rawHcp === '' || rawHcp === null || rawHcp === undefined) return;
        const hcpIndex = parseFloat(rawHcp);
        if (isNaN(hcpIndex)) return;
        hcpMap[mat] = Math.round(hcpIndex * slope / 113);
      });
    }
  }

  return { slope, rating, tee: matchedTee, hcpMap };
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
 * Devuelve la información completa de una fecha para mostrar el card:
 * líneas, jugadores (nombre, apodo, HCPs), matches y meta (horario, cancha, greenfee).
 * Usa FECHA_META para líneas + TARJETAS para HCP + JUGADORES para nombres + Rating para slopes.
 */
function getFechaLineas_(fecha) {
  if (!fecha) return null;
  const meta = getFechaMeta_(fecha);
  if (!meta || !meta.lineas || !meta.lineas.length) return null;

  // ── Jugadores de esta fecha → hcp de juego (col E TARJETAS) ─────────────
  const shT = getSheet_(SHEETS.TARJETAS);
  const hcpMap = {}; // matricula → hcp de juego (almacenado en tarjeta)
  if (shT) {
    const ne = findNextEmptyRow_(shT, 2);
    if (ne > 2) {
      shT.getRange(2, 2, ne - 2, 4).getValues().forEach(function(row) {
        const f = String(row[0] || '').trim();
        const m = String(row[1] || '').trim();
        if (f === String(fecha) && m) hcpMap[m] = parseInt(row[3]) || 0;
      });
    }
  }

  // ── Nombres y apodos desde JUGADORES ─────────────────────────────────────
  const jugs = getJugadores_();
  const jugMap = {};
  jugs.forEach(function(j) { jugMap[j.matricula] = j; });

  // ── Slopes desde Rating (para mostrar HCP blancas y azules) ─────────────
  const canchaId = meta.canchaId || '';
  const canchaName = meta.canchaName || '';
  const cd = getCanchaPares_(canchaId || canchaName);
  const ratings = (cd && cd.ratings) || [];

  function computeHcp(hcpIndex, slope) {
    if (!hcpIndex || !slope) return null;
    return Math.round(hcpIndex * slope / 113);
  }

  // ── Matches de esta fecha desde MATCH sheet ───────────────────────────────
  const shM = getSheet_(SHEETS.MATCH);
  const matchPairsSet = {}; // "matA|matB" sorted → true
  if (shM) {
    try {
      const ne2 = shM.getLastRow();
      if (ne2 >= 2) {
        // Read cols B(2)=fecha, C(3)=j1mat, D(4)=j2mat (standard MATCH layout)
        const mData = shM.getRange(2, 2, ne2 - 1, 4).getValues();
        mData.forEach(function(row) {
          if (String(row[0] || '').trim() !== String(fecha)) return;
          const j1 = String(row[1] || '').trim();
          const j2 = String(row[2] || '').trim(); // approx — actual col depends on MATCH layout
          if (j1 && j2) matchPairsSet[[j1, j2].sort().join('|')] = true;
        });
      }
    } catch(e) {}
  }

  // ── Construir líneas ──────────────────────────────────────────────────────
  const lineas = meta.lineas.map(function(lineaMats, idx) {
    const lineNum = idx + 1;
    const players = lineaMats.map(function(mat) {
      const j = jugMap[String(mat)] || {};
      const hcpIndex = j.hcpIndex || null;
      // Find tee colors
      const teeData = {};
      ratings.forEach(function(r) {
        const key = (r.tee || '').toUpperCase();
        teeData[key] = {
          hcp:   computeHcp(hcpIndex, r.slope),
          pct85: computeHcp(hcpIndex, r.slope) !== null ? Math.round(computeHcp(hcpIndex, r.slope) * 0.85) : null,
          slope: r.slope,
          rating: r.rating,
        };
      });
      return {
        matricula: String(mat),
        nombre: j.nombre || '',
        apodo:  (j.apodo || (j.nombre ? j.nombre.split(' ')[0] : '') || String(mat)).toUpperCase(),
        hcp:    hcpMap[String(mat)] || 0,
        tees:   teeData, // { BLANCAS: {hcp, pct85, slope, rating}, AZULES: {...} }
      };
    });

    // Matches de esta línea = todos los pares de players que tienen un match en MATCH sheet
    const mats = lineaMats.map(String);
    const matches = [];
    for (var i = 0; i < mats.length; i++) {
      for (var j2 = i + 1; j2 < mats.length; j2++) {
        const key = [mats[i], mats[j2]].sort().join('|');
        if (matchPairsSet[key]) {
          const pA = players.find(function(p) { return p.matricula === mats[i]; });
          const pB = players.find(function(p) { return p.matricula === mats[j2]; });
          matches.push({
            j1: mats[i], apodo1: pA ? pA.apodo : mats[i],
            j2: mats[j2], apodo2: pB ? pB.apodo : mats[j2],
          });
        }
      }
    }

    return { lineNum: lineNum, players: players, matches: matches };
  });

  // ── Fecha del calendario ──────────────────────────────────────────────────
  const fechasMap = { '1':'08-03','2':'19-04','3':'10-05','4':'07-06','5':'05-07',
                      '6':'09-08','7':'13-09','8':'25-10' };

  return {
    fecha:     String(fecha),
    dia:       fechasMap[String(fecha)] || '',
    cancha:    canchaName,
    canchaId:  canchaId,
    colorTee:  meta.colorTee || 'BLANCAS',
    horario:   meta.horario  || '',
    greenFee:  meta.greenFee || '',
    lineas:    lineas,
  };
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

  // Find existing rows for this fecha (read B-G = 6 cols, so we get canchaId from col G)
  const nextEmpty = findNextEmptyRow_(sh, 2);
  const existingRows = [];
  let existingCanchaId   = '';
  let existingCanchaName = '';
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 2, nextEmpty - 2, 6).getValues(); // B(0)-G(5)
    data.forEach((row, i) => {
      const f = String(row[0] || '').trim();
      const m = String(row[1] || '').trim();
      const n = String(row[2] || '').trim();
      if (f === String(fecha) && m) {
        if (!existingCanchaId   && row[5]) existingCanchaId   = String(row[5] || '').trim(); // G
        if (!existingCanchaName && row[4]) existingCanchaName = String(row[4] || '').trim(); // F
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

  // Step 1b: Update color tee (col AG = 33) for all existing rows
  if (colorFinal) {
    try {
      existingRows.forEach(er => {
        sh.getRange(er.row, 33).setValue(colorFinal);   // AG = col 33
      });
      changes.colorUpdated = true;
    } catch (e) { changes.errors.push('color: ' + e.message); }
  }

  // Step 1c: Recalculate HCP de juego for all non-invitado rows when cancha or color changed.
  // Build hcpInfo once here; reused in Step 3 for newly added players too.
  const effCanchaId   = canchaId   || existingCanchaId;
  const effCanchaName = canchaName || existingCanchaName;
  const effColor      = colorFinal || 'BLANCAS';
  let   editHcpMap    = {};
  if (canchaName || colorFinal) {
    try {
      const hcpInfo = buildHcpJuegoMap_(effCanchaId, effCanchaName, effColor);
      if (hcpInfo && Object.keys(hcpInfo.hcpMap).length > 0) {
        editHcpMap = hcpInfo.hcpMap;
        existingRows.forEach(er => {
          if (er.isInvitado) return; // invitados no tienen matricula en JUGADORES
          const hcp = editHcpMap[er.matricula];
          if (hcp !== undefined) sh.getRange(er.row, 5).setValue(hcp); // E = HCP de juego
        });
        changes.hcpRecalculated = true;
      }
    } catch (e) { changes.errors.push('hcp recalc: ' + e.message); }
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
      // Write HCP de juego for new player (editHcpMap populated in step 1c, or build now if needed)
      const newHcp = editHcpMap[mat] !== undefined
        ? editHcpMap[mat]
        : (() => {
            // editHcpMap empty means step 1c was skipped (no cancha/color change sent);
            // build map on demand using current effective values
            try {
              const info = buildHcpJuegoMap_(effCanchaId, effCanchaName, effColor);
              editHcpMap = (info && info.hcpMap) ? info.hcpMap : {};
              return editHcpMap[mat] !== undefined ? editHcpMap[mat] : '';
            } catch(e2) { return ''; }
          })();
      if (newHcp !== '') sh.getRange(nextRow, 5).setValue(newHcp); // E = HCP de juego
      if (canchaName) sh.getRange(nextRow, 6, 1, 2).setValues([[canchaName, canchaId]]); // F + G
      if (colorFinal) sh.getRange(nextRow, 33).setValue(colorFinal); // AG = col 33
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
  const { adminKey, fecha, canchaId, jugadores, dobles, invitados, colorTee,
          horario, greenFee, lineas } = params;
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

  // Pre-calculate HCP de juego for all players (hcpIndex × slope / 113).
  // This avoids asking each player to enter their HCP manually when loading the tarjeta.
  const hcpInfo = buildHcpJuegoMap_(canchaId, canchaName, colorFinal);
  const hcpMap  = hcpInfo ? hcpInfo.hcpMap : {};

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
      .setValues(newJugMats.map(m => [fecha, m]));                    // B-C (fecha, matricula)
    sh.getRange(startJug, 5, newJugMats.length, 1)
      .setValues(newJugMats.map(m => [hcpMap[m] !== undefined ? hcpMap[m] : ''])); // E (HCP de juego)
    sh.getRange(startJug, 6, newJugMats.length, 2)
      .setValues(newJugMats.map(() => [canchaName, canchaId]));        // F-G (cancha nombre + ID)
    sh.getRange(startJug, 33, newJugMats.length, 1)
      .setValues(newJugMats.map(() => [colorFinal]));                  // AG (color tee)
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
  meta[String(fecha)] = {
    canchaId,
    canchaName,
    dobles:   dobles   || [],
    colorTee: colorTee || 'BLANCAS',
    horario:  horario  || '',
    greenFee: greenFee || '',
    lineas:   Array.isArray(lineas) ? lineas : [],  // [[mat,...], [mat,...], ...]
  };
  props.setProperty('FECHA_META', JSON.stringify(meta));

  // ── Escribir líneas en MATCH!BZ:CB (flat list: fecha, nroLinea, apodo) ──────
  // Esto permite que armarLineas_ sepa qué líneas se jugaron en fechas anteriores.
  if (Array.isArray(lineas) && lineas.length) {
    try {
      const shM = getSheet_(SHEETS.MATCH);
      const jugsAll = getJugadores_();
      const matToApodo = {};
      jugsAll.forEach(function(j) {
        matToApodo[j.matricula] = (j.apodo || j.nombre.split(' ')[0] || j.matricula).toUpperCase();
      });
      const rows = [];
      lineas.forEach(function(lineaMats, idx) {
        const lineNum = idx + 1;
        (Array.isArray(lineaMats) ? lineaMats : []).forEach(function(mat) {
          const apodo = matToApodo[String(mat)] || String(mat);
          rows.push([parseInt(fecha), lineNum, apodo]);
        });
      });
      if (rows.length) {
        const lastRow = shM.getLastRow();
        const startRow = Math.max(lastRow + 1, 2);
        shM.getRange(startRow, 78, rows.length, 3).setValues(rows); // BZ=78, CA=79, CB=80
      }
    } catch(e) { /* no bloquear si falla la escritura de líneas */ }
  }

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

/**
 * getTarjetasForFecha_ — Devuelve todas las tarjetas de una fecha (solo admin).
 */
function getTarjetasForFecha_(params) {
  const { adminKey, fecha } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: true, data: [] };
  const fStr = String(fecha);
  const last = findNextEmptyRow_(sh, 2);
  if (last <= 2) return { ok: true, data: [] };
  // B=fecha(0), C=mat(1), D=nombre(2), E=hcp(3), F=cancha(4), G=canchaId(5), H..Y=scores(6..23), Z=ld(24), AA=ba(25)
  const data = sh.getRange(2, 2, last - 2, 26).getValues();
  const result = [];
  data.forEach(function(r) {
    if (String(r[0]).trim() !== fStr) return;
    result.push({
      matricula: String(r[1]).trim(),
      nombre:    String(r[2]).trim(),
      hcp:       (r[3] === '' || r[3] === null || r[3] === undefined) ? null : r[3],
      cancha:    String(r[4]).trim(),
      canchaId:  String(r[5]).trim(),
      scores:    r.slice(6, 24).map(function(v){ return (v === '' || v === null || v === undefined) ? null : Number(v); }),
      ld:        (r[24] === 1 || r[24] === true || String(r[24]) === '1') ? 1 : 0,
      ba:        (r[25] === 1 || r[25] === true || String(r[25]) === '1') ? 1 : 0,
    });
  });
  return { ok: true, data: result };
}

/**
 * setBonusWinners_ — Admin cambia el ganador de LD y/o BA para una fecha.
 * Actualiza TARJETAS Z/AA, PB! col E, SCORE!PB col, y recalcula AL:AS/C/D/LEADERBOARD.
 */
function setBonusWinners_(params) {
  const { adminKey, fecha, ldMat, baMat } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };

  const fStr  = String(fecha);
  const fecN  = parseInt(fecha);
  const ldStr = String(ldMat || '').trim();
  const baStr = String(baMat || '').trim();

  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Sin hoja TARJETAS' };
  const last = sh.getLastRow();
  if (last < 2) return { ok: true };

  const allRows = sh.getRange(2, 2, last - 1, 26).getValues();
  const pbMap = {}; // mat → pbPoints

  // Actualizar col Z (LD) y AA (BA) para cada fila de esta fecha
  for (let i = 0; i < allRows.length; i++) {
    if (String(allRows[i][0]).trim() !== fStr) continue;
    const mat = String(allRows[i][1]).trim();
    if (!mat) continue;
    const newLD = (ldStr && mat === ldStr) ? 1 : '';
    const newBA = (baStr && mat === baStr) ? 1 : '';
    sh.getRange(i + 2, 26).setValue(newLD); // col Z
    sh.getRange(i + 2, 27).setValue(newBA); // col AA
    pbMap[mat] = ((newLD === 1 ? 1 : 0) + (newBA === 1 ? 1 : 0)) * 3;
  }

  // Actualizar PB! col E
  const pbSh = getSheet_('PB');
  if (pbSh) {
    const pbLast = pbSh.getLastRow();
    if (pbLast >= 2) {
      const pbBC = pbSh.getRange(2, 2, pbLast - 1, 2).getValues();
      for (let i = 0; i < pbBC.length; i++) {
        if (String(pbBC[i][0]).trim() !== fStr) continue;
        const mat = String(pbBC[i][1]).trim();
        if (pbMap[mat] !== undefined) pbSh.getRange(i + 2, 5).setValue(pbMap[mat]);
      }
    }
  }

  // Actualizar SCORE!PB col (4*fecha+3) y recomputar AL:AS/C/D/LEADERBOARD
  const scoreSh = getSheet_('SCORE');
  if (scoreSh) {
    const pbCol = 4 * fecN + 3;
    if (pbCol >= 5 && pbCol <= 48) {
      Object.keys(pbMap).forEach(function(mat) {
        const sRow = getScoreRowForMat_(mat);
        if (sRow > 0) scoreSh.getRange(sRow, pbCol).setValue(pbMap[mat]);
      });
    }

    // Recompute AL:AS / C / D / LEADERBOARD (identical logic as resetFecha_ step 5)
    const allData = scoreSh.getRange(3, 5, 18, 32).getValues();
    const alValsAll = [], totalCs = [];
    for (let i = 0; i < 18; i++) {
      const als = [];
      let total = 0;
      for (let n = 0; n < 8; n++) {
        const bn = 4 * n;
        const st = Number(allData[i][bn])     || 0;
        const ma = Number(allData[i][bn + 1]) || 0;
        const pb = Number(allData[i][bn + 2]) || 0;
        const db = (allData[i][bn + 3] === true || allData[i][bn + 3] === 1);
        const al = st + ma + pb + (db ? st : 0);
        als.push(al);
        total += al;
      }
      alValsAll.push(als);
      totalCs.push(total);
    }
    const allRanks = totalCs.map(function(ci, i) {
      let rank = 1;
      for (let j = 0; j < totalCs.length; j++) { if (totalCs[j] > ci) rank++; }
      let cnt = 0;
      for (let j = 0; j <= i; j++) { if (totalCs[j] === ci) cnt++; }
      return rank + cnt - 1;
    });
    scoreSh.getRange(3, 38, 18, 8).setValues(alValsAll);
    scoreSh.getRange(3,  3, 18, 1).setValues(totalCs.map(function(c){ return [c]; }));
    scoreSh.getRange(3,  4, 18, 1).setValues(allRanks.map(function(r){ return [r]; }));

    const lbSh = getSheet_('LEADERBOARD');
    if (lbSh) {
      const scoreNames = scoreSh.getRange(3, 2, 18, 1).getValues();
      const stbTot = [], maTot = [], pbTot = [];
      for (let i = 0; i < 18; i++) {
        let st = 0, ma = 0, pb = 0;
        for (let n = 0; n < 8; n++) {
          st += Number(allData[i][4*n])   || 0;
          ma += Number(allData[i][4*n+1]) || 0;
          pb += Number(allData[i][4*n+2]) || 0;
        }
        stbTot.push(st); maTot.push(ma); pbTot.push(pb);
      }
      const gV=[], jV=[], kV=[], lV=[], mV=[];
      for (let r = 1; r <= 18; r++) {
        const idx = allRanks.indexOf(r);
        if (idx >= 0) {
          gV.push([String(scoreNames[idx][0]||'')]); jV.push([totalCs[idx]]);
          kV.push([stbTot[idx]]); lV.push([maTot[idx]]); mV.push([pbTot[idx]]);
        } else {
          gV.push(['']); jV.push([0]); kV.push([0]); lV.push([0]); mV.push([0]);
        }
      }
      lbSh.getRange(2, 7,18,1).setValues(gV); lbSh.getRange(2,10,18,1).setValues(jV);
      lbSh.getRange(2,11,18,1).setValues(kV); lbSh.getRange(2,12,18,1).setValues(lV);
      lbSh.getRange(2,13,18,1).setValues(mV);
    }
  }

  SpreadsheetApp.flush();
  audit_('SET_BONUS_WINNERS', 'admin', { fecha, ldMat, baMat });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  return { ok: true };
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
  if (!isAdmin && (wantsLD || wantsBA)) {
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

  // ── Pre-lock: reads + pure computation ─────────────────────────────────
  // Everything that doesn't WRITE to a sheet runs here, outside the lock,
  // so the lock is held only while committing writes. This keeps lock hold
  // time short enough for ~18 simultaneous submissions.
  const fStr = String(fecha);
  const mStr = String(matricula);

  // Cancha data (cached — fast after first fetch)
  const canchaId   = existingRow[5];
  const cd         = canchaId
    ? cachedRead_('cp2_' + String(canchaId), 300, function(){ return getCanchaPares_(canchaId); })
    : null;
  const cpPares    = (cd && cd.pares)   || [];
  const cpIndices  = (cd && cd.indices) || [];
  const myScores18 = newRow.slice(3, 21); // H1..H18

  // Stableford breakdown (pure computation, no I/O)
  const stbBreak = calcStbBreakdown_(myScores18, cpPares, cpIndices, hcpNum);

  // Column addresses (arithmetic only)
  const stCol = 4 * parseInt(fecha) + 1; // SCORE!ST
  const maCol = 4 * parseInt(fecha) + 2; // SCORE!MA
  const pbCol = 4 * parseInt(fecha) + 3; // SCORE!PB

  // SCORE row for current player (1 read, reused multiple times)
  const preScoreRow = getScoreRowForMat_(matricula);

  // STB row lookup (read B:C once)
  let preStbRow = -1;
  const preStbSh = getSheet_('STB');
  if (stbBreak && preStbSh) {
    const stbLast = preStbSh.getLastRow();
    if (stbLast >= 2) {
      const stbBC = preStbSh.getRange(2, 2, stbLast - 1, 2).getValues();
      for (let i = 0; i < stbBC.length; i++) {
        if (String(stbBC[i][0]).trim() === fStr && String(stbBC[i][1]).trim() === mStr) {
          preStbRow = i + 2; break;
        }
      }
    }
  }

  // MATCH data read + all match computations (reads matchBCY once, no writes yet)
  // Results stored as arrays of write-ops executed later inside the lock.
  const preMatchSh = getSheet_(SHEETS.MATCH);
  let preMatchBCY  = null;
  const matchWriteOps  = []; // [{row, col, data}] write ops for MATCH sheet
  const rowYOverride   = {}; // sheetRow → Y value (for SCORE!MA aggregation)
  const affectedMats   = {}; // mat → true
  let   hcp85val       = stbBreak ? stbBreak.e : 0;

  if (preMatchSh && cpIndices.length > 0 && stbBreak) {
    const matchLast = findNextEmptyRow_(preMatchSh, 2);
    if (matchLast > 2) {
      preMatchBCY = preMatchSh.getRange(2, 2, matchLast - 2, 24).getValues();

      for (let mi = 0; mi < preMatchBCY.length; mi++) {
        if (String(preMatchBCY[mi][0]).trim() !== fStr || String(preMatchBCY[mi][1]).trim() !== mStr) continue;
        const mySheetRow      = mi + 2;
        const partnerSheetRow = (mySheetRow % 2 === 0) ? mySheetRow + 1 : mySheetRow - 1;
        const partnerIdx      = partnerSheetRow - 2;
        if (partnerIdx < 0 || partnerIdx >= preMatchBCY.length) continue;

        const oppMat = String(preMatchBCY[partnerIdx][1]).trim();
        if (!oppMat) continue;

        let oppTarjeta = null;
        for (let ai = 0; ai < allRows.length; ai++) {
          if (String(allRows[ai][0]).trim() === fStr && String(allRows[ai][1]).trim() === oppMat) {
            oppTarjeta = allRows[ai]; break;
          }
        }
        if (!oppTarjeta) continue;

        const oppScores18   = oppTarjeta.slice(6, 24);
        const oppHasScores  = oppScores18.some(function(s){ return s !== '' && s !== null && s !== undefined; });
        if (!oppHasScores) continue;

        const oppHcpNum = parseFloat(oppTarjeta[3]);
        if (isNaN(oppHcpNum)) continue;
        const oppHcp85  = Math.round(oppHcpNum * 0.85);

        const ayMy  = Math.max(0, hcp85val - oppHcp85);
        const ayOpp = Math.max(0, oppHcp85 - hcp85val);
        const bcMy  = Math.max(0, ayMy  - 18);
        const bcOpp = Math.max(0, ayOpp - 18);

        const myAdj = new Array(18), oppAdj = new Array(18);
        const myNet = new Array(18), oppNet = new Array(18);
        for (let h = 0; h < 18; h++) {
          const idx   = cpIndices[h] || 0;
          myAdj[h]    = (ayMy  > 0 && ayMy  >= idx ? -1 : 0) + (bcMy  > 0 && idx <= bcMy  ? -1 : 0);
          oppAdj[h]   = (ayOpp > 0 && ayOpp >= idx ? -1 : 0) + (bcOpp > 0 && idx <= bcOpp ? -1 : 0);
          const myG   = myScores18[h]  !== '' && myScores18[h]  !== null ? parseInt(myScores18[h])  : null;
          const oppG  = oppScores18[h] !== '' && oppScores18[h] !== null ? parseInt(oppScores18[h]) : null;
          myNet[h]    = (myG  !== null && !isNaN(myG))  ? myG  + myAdj[h]  : '';
          oppNet[h]   = (oppG !== null && !isNaN(oppG)) ? oppG + oppAdj[h] : '';
        }

        let myBA = 0, oppBA = 0;
        for (let h = 0; h < 18; h++) {
          if (myNet[h] !== '' && oppNet[h] !== '') {
            if (myNet[h]  < oppNet[h]) myBA++;
            if (oppNet[h] < myNet[h])  oppBA++;
          }
        }
        const myBB  = myBA  - oppBA;
        const oppBB = oppBA - myBA;
        const myX   = myBB  > 0 ? (myBB  + ' UP') : (myBB  === 0 ? 'AS' : '');
        const oppX  = oppBB > 0 ? (oppBB + ' UP') : (oppBB === 0 ? 'AS' : '');
        const myY   = myX  === '' ? 0 : (myX  === 'AS' ? 3 : 6);
        const oppY  = oppX === '' ? 0 : (oppX === 'AS' ? 3 : 6);

        rowYOverride[mySheetRow]      = myY;
        rowYOverride[partnerSheetRow] = oppY;
        affectedMats[mStr]   = true;
        affectedMats[oppMat] = true;

        matchWriteOps.push(
          { sh: preMatchSh, row: mySheetRow,      col: 5,  data: [[hcp85val].concat(myNet).concat([myX,  myY])]  },
          { sh: preMatchSh, row: mySheetRow,      col: 33, data: [myAdj.concat([ayMy,  '', myBA,  myBB,  bcMy])] },
          { sh: preMatchSh, row: partnerSheetRow, col: 5,  data: [[oppHcp85].concat(oppNet).concat([oppX, oppY])] },
          { sh: preMatchSh, row: partnerSheetRow, col: 33, data: [oppAdj.concat([ayOpp, '', oppBA, oppBB, bcOpp])] }
        );
      }
    }
  }

  // SCORE!MA per affected player (sum Y across all their match rows)
  const maWriteOps = []; // [{scoreRow, totalMA, mat}]
  const affectedMatsList = Object.keys(affectedMats);
  if (affectedMatsList.length > 0 && preMatchBCY) {
    const scoreSh2 = getSheet_('SCORE');
    if (scoreSh2 && maCol >= 6 && maCol <= 49) {
      for (let ai = 0; ai < affectedMatsList.length; ai++) {
        const mat = affectedMatsList[ai];
        let totalMA = 0;
        for (let mi2 = 0; mi2 < preMatchBCY.length; mi2++) {
          if (String(preMatchBCY[mi2][0]).trim() !== fStr) continue;
          if (String(preMatchBCY[mi2][1]).trim() !== mat)  continue;
          const shRow = mi2 + 2;
          totalMA += rowYOverride.hasOwnProperty(shRow) ? rowYOverride[shRow] : (Number(preMatchBCY[mi2][23]) || 0);
        }
        const sRow = (mat === mStr) ? preScoreRow : getScoreRowForMat_(mat);
        if (sRow > 0) maWriteOps.push({ scoreRow: sRow, totalMA: totalMA, mat: mat });
      }
    }
  }

  // PB row lookup
  const ldVal_    = (newRow[21] === 1 || newRow[21] === true) ? 1 : 0;
  const baVal_    = (newRow[22] === 1 || newRow[22] === true) ? 1 : 0;
  const pbPoints_ = (ldVal_ + baVal_) * 3;
  let prePbRow    = -1;
  const prePbSh   = getSheet_('PB');
  if (prePbSh) {
    const pbLast = prePbSh.getLastRow();
    if (pbLast >= 2) {
      const pbBC = prePbSh.getRange(2, 2, pbLast - 1, 2).getValues();
      for (let i = 0; i < pbBC.length; i++) {
        if (String(pbBC[i][0]).trim() === fStr && String(pbBC[i][1]).trim() === mStr) {
          prePbRow = i + 2; break;
        }
      }
    }
  }

  // Dobles check
  const currentDobles_ = getDoblesForFecha_(fecha);

  // ── Lock: writes only ────────────────────────────────────────────────────
  // Lock is held only for the write phase — reads done above keep hold-time
  // short so up to ~15 simultaneous submissions can queue within 30 s.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 30 s max (Apps Script ceiling)
  } catch (e) {
    return { ok: false, error: 'Servidor muy ocupado, esperá unos segundos e intentá de nuevo' };
  }

  let dobleMsg = null;
  try {
    // 1. TARJETAS — write E..AE (27 cols)
    sh.getRange(rowIdx, 5, 1, 27).setValues([newRow]);

    try {
      // 2. STB E:K
      let myStWritten = null;
      if (stbBreak && preStbRow > 0 && preStbSh) {
        preStbSh.getRange(preStbRow, 5, 1, 7).setValues([[
          stbBreak.e, stbBreak.f, stbBreak.g, stbBreak.h,
          stbBreak.i, stbBreak.j, stbBreak.k
        ]]);
      }

      // 3. SCORE ST
      const scoreSh = getSheet_('SCORE');
      if (scoreSh && stbBreak && preScoreRow > 0 && stCol >= 5 && stCol <= 48) {
        scoreSh.getRange(preScoreRow, stCol).setValue(stbBreak.k);
        myStWritten = stbBreak.k;
      }

      // 4. MATCH batch writes (pre-computed above)
      for (let wi = 0; wi < matchWriteOps.length; wi++) {
        const op = matchWriteOps[wi];
        op.sh.getRange(op.row, op.col, 1, op.data[0].length).setValues(op.data);
      }

      // 5. SCORE MA writes
      let myMaWritten = null;
      if (maWriteOps.length > 0 && maCol >= 6 && maCol <= 49) {
        const scoreSh2b = scoreSh || getSheet_('SCORE');
        if (scoreSh2b) {
          for (let mi3 = 0; mi3 < maWriteOps.length; mi3++) {
            const mop = maWriteOps[mi3];
            scoreSh2b.getRange(mop.scoreRow, maCol).setValue(mop.totalMA);
            if (mop.mat === mStr) myMaWritten = mop.totalMA;
          }
        }
      }

      // 6. PB!E + SCORE!PB
      try {
        const myPbWritten = pbPoints_;
        if (prePbRow > 0 && prePbSh) prePbSh.getRange(prePbRow, 5).setValue(myPbWritten);
        const scoreSh3 = scoreSh || getSheet_('SCORE');
        if (scoreSh3 && pbCol >= 7 && pbCol <= 50 && preScoreRow > 0) {
          scoreSh3.getRange(preScoreRow, pbCol).setValue(myPbWritten);
        }

        // 7. SCORE totales (AL:AS) + C + D — reads INSIDE lock for correctness
        const scoreSh5 = scoreSh || getSheet_('SCORE');
        if (scoreSh5 && myStWritten !== null && preScoreRow > 0) {
          const scoreFull = scoreSh5.getRange(preScoreRow, 5, 1, 41).getValues()[0];
          const fecN = parseInt(fecha);
          const b    = 4 * (fecN - 1);
          scoreFull[b]     = myStWritten;
          if (myMaWritten !== null) scoreFull[b + 1] = myMaWritten;
          scoreFull[b + 2] = myPbWritten;

          const alVals = [];
          for (let n = 1; n <= 8; n++) {
            const bn = 4 * (n - 1);
            const st = Number(scoreFull[bn])     || 0;
            const ma = Number(scoreFull[bn + 1]) || 0;
            const pb = Number(scoreFull[bn + 2]) || 0;
            const db = (scoreFull[bn + 3] === true || scoreFull[bn + 3] === 1);
            alVals.push(st + ma + pb + (db ? st : 0));
          }
          const totalC = alVals.reduce(function(a, v){ return a + v; }, 0);
          scoreSh5.getRange(preScoreRow, 38, 1, 8).setValues([alVals]);
          scoreSh5.getRange(preScoreRow, 3).setValue(totalC);

          const allCRaw = scoreSh5.getRange(3, 3, 18, 1).getValues();
          const allC    = allCRaw.map(function(r){ return Number(r[0]) || 0; });
          const myRankIdx = preScoreRow - 3;
          if (myRankIdx >= 0 && myRankIdx < 18) allC[myRankIdx] = totalC;

          const allRanks = allC.map(function(ci, i) {
            let rank = 1;
            for (let j = 0; j < allC.length; j++) { if (allC[j] > ci) rank++; }
            let cntBefore = 0;
            for (let j = 0; j <= i; j++) { if (allC[j] === ci) cntBefore++; }
            return rank + cntBefore - 1;
          });
          scoreSh5.getRange(3, 4, 18, 1).setValues(allRanks.map(function(r){ return [r]; }));

          // 8. LEADERBOARD G, J, K, L, M
          try {
            const lbSh = getSheet_('LEADERBOARD');
            if (lbSh) {
              const scoreNames   = scoreSh5.getRange(3, 2, 18, 1).getValues();
              const allScoreData = scoreSh5.getRange(3, 5, 18, 32).getValues();
              if (myRankIdx >= 0 && myRankIdx < 18) {
                const bld = 4 * (fecN - 1);
                allScoreData[myRankIdx][bld]     = myStWritten;
                if (myMaWritten !== null) allScoreData[myRankIdx][bld + 1] = myMaWritten;
                allScoreData[myRankIdx][bld + 2] = myPbWritten;
              }
              const stbTot = new Array(18), maTot = new Array(18), pbTot = new Array(18);
              for (let i = 0; i < 18; i++) {
                let st = 0, ma = 0, pb = 0;
                for (let n = 0; n < 8; n++) {
                  st += Number(allScoreData[i][4 * n])     || 0;
                  ma += Number(allScoreData[i][4 * n + 1]) || 0;
                  pb += Number(allScoreData[i][4 * n + 2]) || 0;
                }
                stbTot[i] = st; maTot[i] = ma; pbTot[i] = pb;
              }
              const gVals = [], jVals = [], kVals = [], lVals = [], mVals = [];
              for (let r = 1; r <= 18; r++) {
                const idx = allRanks.indexOf(r);
                if (idx >= 0) {
                  gVals.push([String(scoreNames[idx][0] || '')]);
                  jVals.push([allC[idx]]);
                  kVals.push([stbTot[idx]]);
                  lVals.push([maTot[idx]]);
                  mVals.push([pbTot[idx]]);
                } else {
                  gVals.push(['']); jVals.push([0]); kVals.push([0]);
                  lVals.push([0]);  mVals.push([0]);
                }
              }
              lbSh.getRange(2,  7, 18, 1).setValues(gVals);
              lbSh.getRange(2, 10, 18, 1).setValues(jVals);
              lbSh.getRange(2, 11, 18, 1).setValues(kVals);
              lbSh.getRange(2, 12, 18, 1).setValues(lVals);
              lbSh.getRange(2, 13, 18, 1).setValues(mVals);
            }
          } catch (lbErr) { /* Non-fatal */ }
        }
      } catch (pbErr) { /* Non-fatal */ }
    } catch (stbErr) { /* Non-fatal — STB/SCORE/MATCH failure doesn't block tarjeta write */ }

    // 9. Puntos dobles
    if (currentDobles_.indexOf(String(matricula)) >= 0) {
      const auResult = writeDobleStScore_(matricula, fecha);
      if (auResult.ok) {
        dobleMsg = 'doble aplicado: ST=' + auResult.st + ' escrito en AU';
      } else {
        dobleMsg = 'doble marcado pero AU no se pudo escribir: ' + auResult.error;
      }
    }
  } finally {
    lock.releaseLock();
  }

  // Flush FUERA del lock — los setValues() están encolados; el flush los
  // confirma sin bloquear a otros jugadores que esperen el lock.
  SpreadsheetApp.flush();

  audit_('CARGAR_TARJETA', isAdmin ? 'admin' : matricula, { fecha, matricula, hcp, scores, ld, ba, usarDoble, dobleMsg });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  return { ok: true, dobleMsg: dobleMsg };
}

/**
 * resetFecha_ — Borra todos los valores estáticos escritos para una fecha,
 * dejando la estructura de filas intacta (jugadores/matches no se tocan).
 * Uso: pruebas o corrección de errores. Solo admin.
 *
 * Limpia:
 *   TARJETAS  cols E..AE (hcp, cancha, 18 hoyos, LD, BA, IDA, VTA, GROSS, NETO)
 *   STB       cols E:K
 *   MATCH     cols E:Y  + AG:BC
 *   PB        col  E
 *   SCORE     cols ST/MA/PB/DB de esa fecha + recalcula AL:AS, C, D
 *   LEADERBOARD cols G, J, K, L, M
 */
function resetFecha_(params) {
  const { adminKey, fecha } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const fStr    = String(fecha);
  const fecN    = parseInt(fecha);
  const changes = { tarjetas: 0, stb: 0, match: 0, pb: 0, score: 0 };

  // ── 1. TARJETAS — limpiar cols E..AE (27 cols) por fila ───────────────
  const tarjSh = getSheet_(SHEETS.TARJETAS);
  if (tarjSh) {
    const last = findNextEmptyRow_(tarjSh, 2);
    if (last > 2) {
      const bc = tarjSh.getRange(2, 2, last - 2, 1).getValues(); // col B = fecha
      bc.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          tarjSh.getRange(i + 2, 5, 1, 27).clearContent();
          changes.tarjetas++;
        }
      });
    }
  }

  // ── 2. STB — limpiar E:K ──────────────────────────────────────────────
  const stbSh = getSheet_('STB');
  if (stbSh) {
    const last = stbSh.getLastRow();
    if (last >= 2) {
      const bc = stbSh.getRange(2, 2, last - 1, 1).getValues(); // col B = fecha
      bc.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          stbSh.getRange(i + 2, 5, 1, 7).clearContent();
          changes.stb++;
        }
      });
    }
  }

  // ── 3. MATCH — limpiar E:Y (21 cols) y AG:BC (23 cols) ───────────────
  const matchSh = getSheet_(SHEETS.MATCH);
  if (matchSh) {
    const last = findNextEmptyRow_(matchSh, 2);
    if (last > 2) {
      const bc = matchSh.getRange(2, 2, last - 2, 1).getValues();
      bc.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          matchSh.getRange(i + 2, 5,  1, 21).clearContent(); // E:Y
          matchSh.getRange(i + 2, 33, 1, 23).clearContent(); // AG:BC
          changes.match++;
        }
      });
    }
  }

  // ── 4. PB — limpiar col E ─────────────────────────────────────────────
  const pbSh = getSheet_('PB');
  if (pbSh) {
    const last = pbSh.getLastRow();
    if (last >= 2) {
      const bc = pbSh.getRange(2, 2, last - 1, 1).getValues();
      bc.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          pbSh.getRange(i + 2, 5).clearContent();
          changes.pb++;
        }
      });
    }
  }

  // ── 5. SCORE + LEADERBOARD — recalcular desde cero ────────────────────
  const scoreSh = getSheet_('SCORE');
  if (scoreSh) {
    // Leer E:AJ (32 cols = 8 fechas × 4) antes de limpiar
    const allData = scoreSh.getRange(3, 5, 18, 32).getValues();

    // Zerar en memoria las 4 cols de esta fecha
    const b = 4 * (fecN - 1);
    for (let i = 0; i < 18; i++) {
      allData[i][b]     = 0; // ST
      allData[i][b + 1] = 0; // MA
      allData[i][b + 2] = 0; // PB
      allData[i][b + 3] = false; // DB
    }

    // Limpiar esas cols en el sheet
    const stCol = 4 * fecN + 1; // col numérica de ST en SCORE
    if (stCol >= 5 && stCol <= 48) {
      scoreSh.getRange(3, stCol, 18, 4).clearContent(); // ST/MA/PB/DB
    }

    // Recompute AL:AS, C, D para los 18 jugadores
    const alValsAll = [], totalCs = [];
    for (let i = 0; i < 18; i++) {
      const als = [];
      let total = 0;
      for (let n = 0; n < 8; n++) {
        const bn  = 4 * n;
        const st  = Number(allData[i][bn])     || 0;
        const ma  = Number(allData[i][bn + 1]) || 0;
        const pb  = Number(allData[i][bn + 2]) || 0;
        const db  = (allData[i][bn + 3] === true || allData[i][bn + 3] === 1);
        const al  = st + ma + pb + (db ? st : 0);
        als.push(al);
        total += al;
      }
      alValsAll.push(als);
      totalCs.push(total);
    }

    const allRanks = totalCs.map(function(ci, i) {
      let rank = 1;
      for (let j = 0; j < totalCs.length; j++) { if (totalCs[j] > ci) rank++; }
      let cntBefore = 0;
      for (let j = 0; j <= i; j++) { if (totalCs[j] === ci) cntBefore++; }
      return rank + cntBefore - 1;
    });

    scoreSh.getRange(3, 38, 18, 8).setValues(alValsAll);
    scoreSh.getRange(3,  3, 18, 1).setValues(totalCs.map(function(c){ return [c]; }));
    scoreSh.getRange(3,  4, 18, 1).setValues(allRanks.map(function(r){ return [r]; }));
    changes.score = 18;

    // LEADERBOARD G, J, K, L, M
    const lbSh = getSheet_('LEADERBOARD');
    if (lbSh) {
      const scoreNames = scoreSh.getRange(3, 2, 18, 1).getValues();
      const stbTot = new Array(18), maTot = new Array(18), pbTot = new Array(18);
      for (let i = 0; i < 18; i++) {
        let st = 0, ma = 0, pb = 0;
        for (let n = 0; n < 8; n++) {
          st += Number(allData[i][4 * n])     || 0;
          ma += Number(allData[i][4 * n + 1]) || 0;
          pb += Number(allData[i][4 * n + 2]) || 0;
        }
        stbTot[i] = st; maTot[i] = ma; pbTot[i] = pb;
      }

      const gVals = [], jVals = [], kVals = [], lVals = [], mVals = [];
      for (let r = 1; r <= 18; r++) {
        const idx = allRanks.indexOf(r);
        if (idx >= 0) {
          gVals.push([String(scoreNames[idx][0] || '')]);
          jVals.push([totalCs[idx]]);
          kVals.push([stbTot[idx]]);
          lVals.push([maTot[idx]]);
          mVals.push([pbTot[idx]]);
        } else {
          gVals.push(['']); jVals.push([0]); kVals.push([0]);
          lVals.push([0]);  mVals.push([0]);
        }
      }
      lbSh.getRange(2,  7, 18, 1).setValues(gVals);
      lbSh.getRange(2, 10, 18, 1).setValues(jVals);
      lbSh.getRange(2, 11, 18, 1).setValues(kVals);
      lbSh.getRange(2, 12, 18, 1).setValues(lVals);
      lbSh.getRange(2, 13, 18, 1).setValues(mVals);
    }
  }

  SpreadsheetApp.flush();
  audit_('RESET_FECHA', 'admin', { fecha, changes });
  return { ok: true, changes: changes };
}

// getTarjetasForFecha_ y setBonusWinners_ definidas más arriba (antes de cargarTarjeta_)

/**
 * eliminarFecha_ — Borra COMPLETAMENTE una fecha: elimina físicamente las filas de
 * TARJETAS, MATCH, STB y PB correspondientes, y recalcula SCORE y LEADERBOARD
 * para las fechas restantes. Equivale a "como si esa fecha nunca hubiera existido".
 */
function eliminarFecha_(params) {
  const { adminKey, fecha } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const fStr = String(fecha);
  const fecN = parseInt(fecha);
  const changes = { tarjetas: 0, match: 0, stb: 0, pb: 0, score: 0 };

  // Helper: delete rows (bottom to top) where col colIdx (1-based) === fStr
  function deleteRowsForFecha(sh, colIdx) {
    if (!sh) return 0;
    const last = sh.getLastRow();
    if (last < 2) return 0;
    const vals = sh.getRange(2, colIdx, last - 1, 1).getValues();
    let count = 0;
    for (let i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim() === fStr) {
        sh.deleteRow(i + 2);
        count++;
      }
    }
    return count;
  }

  // ── 1. STB — eliminar filas PRIMERO (antes de TARJETAS) ─────────────────
  // Si col B de STB tiene fórmulas que referencian TARJETAS, borrar TARJETAS
  // primero las deja en blanco/error y deleteRowsForFecha no encontraría la fecha.
  changes.stb = deleteRowsForFecha(getSheet_('STB'), 2); // col B = fecha

  // ── 2. PB — eliminar filas ───────────────────────────────────────────────
  changes.pb = deleteRowsForFecha(getSheet_('PB'), 2); // col B = fecha

  // ── 3. TARJETAS — eliminar filas ─────────────────────────────────────────
  changes.tarjetas = deleteRowsForFecha(getSheet_(SHEETS.TARJETAS), 2); // col B = fecha

  // ── 4. MATCH — eliminar filas ─────────────────────────────────────────────
  changes.match = deleteRowsForFecha(getSheet_(SHEETS.MATCH), 2); // col B = fecha

  // ── 5. SCORE — zerar cols de la fecha + recalcular AL:AS / C / D / LEADERBOARD ──
  const scoreSh = getSheet_('SCORE');
  if (scoreSh) {
    // Leer E:AJ (32 cols = 8 fechas × 4) antes de limpiar
    const allData = scoreSh.getRange(3, 5, 18, 32).getValues();

    // Zerar en memoria las 4 cols de esta fecha
    const b = 4 * (fecN - 1);
    for (let i = 0; i < 18; i++) {
      allData[i][b]     = 0;
      allData[i][b + 1] = 0;
      allData[i][b + 2] = 0;
      allData[i][b + 3] = false;
    }

    // Limpiar esas cols en el sheet
    const stCol = 4 * fecN + 1;
    if (stCol >= 5 && stCol <= 48) {
      scoreSh.getRange(3, stCol, 18, 4).clearContent();
    }

    // Recompute AL:AS, C, D para los 18 jugadores
    const alValsAll = [], totalCs = [];
    for (let i = 0; i < 18; i++) {
      const als = [];
      let total = 0;
      for (let n = 0; n < 8; n++) {
        const bn = 4 * n;
        const st = Number(allData[i][bn])     || 0;
        const ma = Number(allData[i][bn + 1]) || 0;
        const pb = Number(allData[i][bn + 2]) || 0;
        const db = (allData[i][bn + 3] === true || allData[i][bn + 3] === 1);
        const al = st + ma + pb + (db ? st : 0);
        als.push(al);
        total += al;
      }
      alValsAll.push(als);
      totalCs.push(total);
    }

    const allRanks = totalCs.map(function(ci, i) {
      let rank = 1;
      for (let j = 0; j < totalCs.length; j++) { if (totalCs[j] > ci) rank++; }
      let cntBefore = 0;
      for (let j = 0; j <= i; j++) { if (totalCs[j] === ci) cntBefore++; }
      return rank + cntBefore - 1;
    });

    scoreSh.getRange(3, 38, 18, 8).setValues(alValsAll);
    scoreSh.getRange(3,  3, 18, 1).setValues(totalCs.map(function(c){ return [c]; }));
    scoreSh.getRange(3,  4, 18, 1).setValues(allRanks.map(function(r){ return [r]; }));
    changes.score = 18;

    // LEADERBOARD G, J, K, L, M
    const lbSh = getSheet_('LEADERBOARD');
    if (lbSh) {
      const scoreNames = scoreSh.getRange(3, 2, 18, 1).getValues();
      const stbTot = new Array(18), maTot = new Array(18), pbTot = new Array(18);
      for (let i = 0; i < 18; i++) {
        let st = 0, ma = 0, pb = 0;
        for (let n = 0; n < 8; n++) {
          st += Number(allData[i][4 * n])     || 0;
          ma += Number(allData[i][4 * n + 1]) || 0;
          pb += Number(allData[i][4 * n + 2]) || 0;
        }
        stbTot[i] = st; maTot[i] = ma; pbTot[i] = pb;
      }

      const gVals = [], jVals = [], kVals = [], lVals = [], mVals = [];
      for (let r = 1; r <= 18; r++) {
        const idx = allRanks.indexOf(r);
        if (idx >= 0) {
          gVals.push([String(scoreNames[idx][0] || '')]);
          jVals.push([totalCs[idx]]);
          kVals.push([stbTot[idx]]);
          lVals.push([maTot[idx]]);
          mVals.push([pbTot[idx]]);
        } else {
          gVals.push(['']); jVals.push([0]); kVals.push([0]);
          lVals.push([0]);  mVals.push([0]);
        }
      }
      lbSh.getRange(2,  7, 18, 1).setValues(gVals);
      lbSh.getRange(2, 10, 18, 1).setValues(jVals);
      lbSh.getRange(2, 11, 18, 1).setValues(kVals);
      lbSh.getRange(2, 12, 18, 1).setValues(lVals);
      lbSh.getRange(2, 13, 18, 1).setValues(mVals);
    }
  }

  SpreadsheetApp.flush();
  audit_('ELIMINAR_FECHA', 'admin', { fecha, changes });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  return { ok: true, changes: changes };
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
 * Get full resultados for a fecha: cancha, LD/BA winners, stableford ranking, matches.
 * Optimizado: una sola lectura de cada sheet (TARJETAS, STB, MATCH, JUGADORES).
 */
function getFechaResultados_(fecha) {
  if (!fecha) return null;
  const fStr = String(fecha);

  // ── JUGADORES: una sola lectura, reutilizada por STB y MATCH ─────────────
  const jugs = getJugadores_();
  const jugMap = {};
  jugs.forEach(function(j) { jugMap[j.matricula] = j; });

  // ── TARJETAS B:AA (26 cols) — una lectura para cancha + HCP + LD/BA ──────
  // índices (0-based desde col B): 0=fecha,1=mat,2=nombre,3=hcp,4=cancha,5=canchaId,24=LD,25=BA
  let cancha = '', canchaId = '';
  const hcpMap = {};
  let ldWinner = null, baWinner = null;
  const shT = getSheet_(SHEETS.TARJETAS);
  if (shT) {
    const nextEmpty = findNextEmptyRow_(shT, 2);
    if (nextEmpty > 2) {
      const tData = shT.getRange(2, 2, nextEmpty - 2, 26).getValues();
      for (let i = 0; i < tData.length; i++) {
        const r = tData[i];
        if (String(r[0] || '').trim() !== fStr) continue;
        const m = String(r[1] || '').trim();
        if (!m) continue;
        if (!cancha) {
          cancha = String(r[4] || '').trim();
          canchaId = String(r[5] || '').trim();
        }
        hcpMap[m] = r[3];
        if (!ldWinner && (r[24] === 1 || r[24] === true || String(r[24]) === '1')) {
          const jug = jugMap[m];
          ldWinner = { matricula: m, apodo: (jug && jug.apodo) || '', nombre: (jug && jug.nombre) || String(r[2] || '').trim() };
        }
        if (!baWinner && (r[25] === 1 || r[25] === true || String(r[25]) === '1')) {
          const jug = jugMap[m];
          baWinner = { matricula: m, apodo: (jug && jug.apodo) || '', nombre: (jug && jug.nombre) || String(r[2] || '').trim() };
        }
      }
    }
  }

  // ── STB B:K (10 cols) — stableford ranking ───────────────────────────────
  const stableford = [];
  const shS = getSheet_('STB');
  if (shS) {
    const lastRow = shS.getLastRow();
    if (lastRow >= 2) {
      const sData = shS.getRange(2, 2, lastRow - 1, 10).getValues();
      sData.forEach(function(row) {
        if (String(row[0] || '').trim() !== fStr) return;
        const m = String(row[1] || '').trim();
        if (!m) return;
        const stb = row[9]; // col K
        if (stb === '' || stb === null || stb === undefined) return;
        const jug = jugMap[m];
        stableford.push({
          matricula: m,
          nombre: (jug && jug.nombre) || String(row[2] || '').trim(),
          apodo:  (jug && jug.apodo)  || '',
          stb:    parseFloat(stb) || 0,
          hcp:    hcpMap[m] !== undefined ? hcpMap[m] : '',
        });
      });
      stableford.sort(function(a, b) { return b.stb - a.stb; });
    }
  }

  // ── MATCH B:D (3 cols) — pares de match ──────────────────────────────────
  const matches = [];
  const shM = getSheet_(SHEETS.MATCH);
  if (shM) {
    const nextEmpty = findNextEmptyRow_(shM, 4);
    if (nextEmpty > 2) {
      const mData = shM.getRange(2, 2, nextEmpty - 2, 3).getValues(); // B,C,D
      for (let i = 0; i + 1 < mData.length; i += 2) {
        const fA = String(mData[i][0]     || '').trim();
        const fB = String(mData[i + 1][0] || '').trim();
        if (fA !== fStr || fB !== fStr) continue;
        const nameA = String(mData[i][2]     || '').trim();
        const nameB = String(mData[i + 1][2] || '').trim();
        if (!nameA || !nameB) continue;
        matches.push({
          rowA: i + 2, rowB: i + 3,
          j1Name: nameA, j2Name: nameB,
          j1: String(mData[i][1]     || '').trim(),
          j2: String(mData[i + 1][1] || '').trim(),
        });
      }
    }
  }

  return {
    fecha:    fStr,
    cancha:   cancha,
    canchaId: canchaId,
    modalidad: 'Stableford + Match',
    ldWinner: ldWinner,
    baWinner: baWinner,
    stableford: stableford,
    matches:  matches,
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

  // Enriquecer con datos de FECHA_META (horario, lineas confirmadas, cancha override)
  const meta = JSON.parse(PropertiesService.getDocumentProperties().getProperty('FECHA_META') || '{}');
  function enrichWithMeta(item) {
    const m = meta[String(item.fechaNum)] || {};
    return Object.assign({}, item, {
      hasLineas: Array.isArray(m.lineas) && m.lineas.length > 0,
      horario:   m.horario   || '',
      greenFee:  m.greenFee  || '',
      cancha:    m.canchaName || item.cancha || 'Cancha a definir',
    });
  }

  if (upcoming.length) return enrichWithMeta(upcoming[0]);

  // If no upcoming fecha, return the most recent past one so UI can show a "torneo finalizado" message
  all.sort((a, b) => b.millisUntil - a.millisUntil);
  return all.length ? enrichWithMeta(Object.assign({}, all[0], { isPast: true })) : null;
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

// ════════════ ARMAR LÍNEAS ════════════
/**
 * Lee las matrices de matches (MATCH!BF1:BX19) y líneas compartidas (MATCH!CA1:CS19),
 * y arma automáticamente una propuesta de líneas + partidos para la fecha.
 *
 * Prioridades:
 *   1. No repetir partidos entre 2 jugadores (hard constraint)
 *   2. No repetir jugadores en la misma línea (soft, penalización)
 *   3. HCP lo más parejo posible dentro de cada match (menor prioridad)
 *
 * Estructura de líneas:
 *   N mod 3 == 0 → todas de 3 jugadores
 *   N mod 3 == 1 → (N-4)/3 de 3 + 1 de 4
 *   N mod 3 == 2 → (N-8)/3 de 3 + 2 de 4
 *   Las líneas de 3 van antes que las de 4.
 */
function armarLineas_(params) {
  const { adminKey, fecha } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  // ── 1. Jugadores: usa la lista provista en params, o lee de TARJETAS ──────
  const players = [];
  const seenMats = {};

  if (Array.isArray(params.jugadores) && params.jugadores.length) {
    // Modo wizard: lista enviada directamente desde el frontend con HCP ya calculado
    params.jugadores.forEach(function(item) {
      const m = String(item.matricula || '').trim();
      if (!m || m.indexOf('INV') === 0 || seenMats[m]) return;
      seenMats[m] = true;
      players.push({ matricula: m, hcp: parseInt(item.hcp) || 0, apodo: '' });
    });
  } else {
    // Modo gestionar: lee de TARJETAS para la fecha indicada
    const shT = getSheet_(SHEETS.TARJETAS);
    if (!shT) return { ok: false, error: 'Hoja TARJETAS no encontrada' };
    const nextEmpty = findNextEmptyRow_(shT, 2);
    if (nextEmpty <= 2) return { ok: false, error: 'No hay jugadores en TARJETAS' };
    // B(0)=fecha, C(1)=matricula, D(2)=nombre, E(3)=hcp
    const tData = shT.getRange(2, 2, nextEmpty - 2, 4).getValues();
    tData.forEach(function(row) {
      const f = String(row[0] || '').trim();
      const m = String(row[1] || '').trim();
      if (f !== String(fecha) || !m || m.indexOf('INV') === 0) return;
      if (seenMats[m]) return;
      seenMats[m] = true;
      const h = (row[3] !== '' && row[3] !== null && row[3] !== undefined)
                ? (parseInt(row[3]) || 0) : 0;
      players.push({ matricula: m, hcp: h, apodo: '' });
    });
  }

  if (players.length < 3) {
    return { ok: false, error: 'Se necesitan al menos 3 jugadores. Encontrados: ' + players.length };
  }

  // ── 2. Apodos desde JUGADORES ────────────────────────────────────────────
  const jugs = getJugadores_();
  const matToApodo = {};
  const apodoToMat = {};
  jugs.forEach(function(j) {
    const ap = (j.apodo || '').trim().toUpperCase();
    matToApodo[j.matricula] = ap || j.nombre.split(' ')[0].toUpperCase();
    if (ap) apodoToMat[ap] = j.matricula;
    // Also map first word of nombre as fallback
    const fw = j.nombre.split(' ')[0].toUpperCase();
    if (!apodoToMat[fw]) apodoToMat[fw] = j.matricula;
  });
  players.forEach(function(p) { p.apodo = matToApodo[p.matricula] || p.matricula; });

  // ── 3. Leer historial de matches y líneas del sheet MATCH ────────────────
  const shM = getSheet_(SHEETS.MATCH);
  if (!shM) return { ok: false, error: 'Hoja MATCH no encontrada' };

  // 3a. Match history: BF1:BX19 — matriz 18×18 con 1 si ya jugaron
  const matchedPairs = {}; // "matA|matB" → true
  try {
    const matchRaw = shM.getRange(1, 58, 19, 19).getValues(); // BF1:BX19
    const headerRow = matchRaw[0];
    const colToMat = {};
    for (var c = 0; c < headerRow.length; c++) {
      const v = String(headerRow[c] || '').trim().toUpperCase();
      if (v && apodoToMat[v]) colToMat[c] = apodoToMat[v];
    }
    var labelCol = -1;
    for (var c2 = 0; c2 <= 2; c2++) {
      if (matchRaw[1] && apodoToMat[String(matchRaw[1][c2] || '').trim().toUpperCase()]) {
        labelCol = c2; break;
      }
    }
    if (labelCol >= 0) {
      for (var r = 1; r < matchRaw.length; r++) {
        const matA = apodoToMat[String(matchRaw[r][labelCol] || '').trim().toUpperCase()];
        if (!matA) continue;
        Object.keys(colToMat).forEach(function(c3) {
          const matB = colToMat[c3];
          if (!matB || matB === matA) return;
          if (parseInt(matchRaw[r][c3]) > 0) matchedPairs[[matA, matB].sort().join('|')] = true;
        });
      }
    }
  } catch(e) { /* continuar sin historial de matches */ }

  // 3b. Líneas compartidas: BZ:CB flat list (BZ=78) — fecha, nroLinea, apodo
  // Regla: evitar repetir línea con las ÚLTIMAS 2 FECHAS jugadas.
  const recentLinePairs = {}; // "matA|matB" → true si compartieron línea en las últimas 2 fechas
  try {
    const lastRowM = shM.getLastRow();
    if (lastRowM >= 2) {
      const lineData = shM.getRange(2, 78, lastRowM - 1, 3).getValues(); // BZ:CB
      // Build: fechaNum → lineNum → [matriculas]
      const linesByFecha = {};
      lineData.forEach(function(row) {
        const f  = parseInt(row[0]) || 0;
        const l  = parseInt(row[1]) || 0;
        const ap = String(row[2] || '').trim().toUpperCase();
        if (!f || !l || !ap) return;
        const mat = apodoToMat[ap];
        if (!mat) return;
        if (!linesByFecha[f]) linesByFecha[f] = {};
        if (!linesByFecha[f][l]) linesByFecha[f][l] = [];
        linesByFecha[f][l].push(mat);
      });
      // Últimas 2 fechas anteriores a la actual
      const currentFechaNum = parseInt(fecha) || 0;
      const lastTwo = Object.keys(linesByFecha).map(Number)
        .filter(function(f2) { return f2 < currentFechaNum; })
        .sort(function(a, b) { return b - a; })
        .slice(0, 2);
      lastTwo.forEach(function(f2) {
        Object.values(linesByFecha[f2]).forEach(function(players) {
          for (var i = 0; i < players.length; i++)
            for (var j = i + 1; j < players.length; j++) {
              recentLinePairs[[players[i], players[j]].sort().join('|')] = true;
            }
        });
      });
    }
  } catch(e) { /* continuar sin historial de líneas */ }

  // ── 5. Algoritmo de armado de líneas ─────────────────────────────────────
  const N = players.length;
  const numFour  = N % 3 === 0 ? 0 : (N % 3 === 1 ? 1 : 2);
  const numThree = (N - 4 * numFour) / 3;

  // Ordenar por HCP para mejor distribución inicial
  players.sort(function(a, b) { return a.hcp - b.hcp; });

  // Todas las combinaciones de k elementos de arr
  function getCombos(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    var first = arr[0], rest = arr.slice(1);
    var withFirst = getCombos(rest, k - 1).map(function(c) { return [first].concat(c); });
    var withoutFirst = getCombos(rest, k);
    return withFirst.concat(withoutFirst);
  }

  // Todos los pares de un grupo
  function allPairs(group) {
    var pairs = [];
    for (var i = 0; i < group.length; i++)
      for (var j = i + 1; j < group.length; j++)
        pairs.push([group[i], group[j]]);
    return pairs;
  }

  // Clave de par
  function pKey(a, b) { return [a.matricula, b.matricula].sort().join('|'); }

  // Penalizaciones — son SOFT (nunca bloquean, solo ordenan preferencias).
  // El algoritmo siempre encuentra una solución; simplemente prefiere evitar repeticiones.
  var PEN_MATCH_REPEAT = 10000; // partido ya jugado: muy indeseable
  var PEN_LINE_REPEAT  = 1000;  // línea compartida en últimas 2 fechas: indeseable

  // Para una línea de 4: busca la mejor división {A,D} vs {B,C}.
  // Siempre devuelve la mejor de las 3 opciones (nunca null).
  function bestFourDiv(group) {
    var divs = [
      [[0,1],[2,3]],
      [[0,2],[1,3]],
      [[0,3],[1,2]],
    ];
    var best = null, bestScore = Infinity;
    divs.forEach(function(div) {
      var sideA = [group[div[0][0]], group[div[0][1]]];
      var sideB = [group[div[1][0]], group[div[1][1]]];
      var mps = [
        [sideA[0], sideB[0]], [sideA[0], sideB[1]],
        [sideA[1], sideB[0]], [sideA[1], sideB[1]],
      ];
      // Penalizar matches repetidos (no bloquear)
      var matchScore = mps.reduce(function(s, mp) {
        return s + Math.abs(mp[0].hcp - mp[1].hcp)
                 + (matchedPairs[pKey(mp[0], mp[1])] ? PEN_MATCH_REPEAT : 0);
      }, 0);
      // Penalizar línea compartida en últimas 2 fechas
      var lineScore = allPairs(group).reduce(function(s, mp) {
        return s + (recentLinePairs[pKey(mp[0], mp[1])] ? PEN_LINE_REPEAT : 0);
      }, 0);
      var total = matchScore + lineScore;
      if (total < bestScore) {
        bestScore = total;
        best = { matches: mps, matchScore: matchScore, lineScore: lineScore };
      }
    });
    return best; // siempre devuelve la mejor opción disponible
  }

  // Puntaje de un grupo de 3 — nunca Infinity
  function scoreThree(group) {
    var pairs = allPairs(group);
    var matchScore = pairs.reduce(function(s, mp) {
      return s + (matchedPairs[pKey(mp[0], mp[1])] ? PEN_MATCH_REPEAT : 0);
    }, 0);
    var lineScore = pairs.reduce(function(s, mp) {
      return s + (recentLinePairs[pKey(mp[0], mp[1])] ? PEN_LINE_REPEAT : 0);
    }, 0);
    var hcpSpread = Math.max.apply(null, group.map(function(p){ return p.hcp; }))
                  - Math.min.apply(null, group.map(function(p){ return p.hcp; }));
    return matchScore + lineScore + hcpSpread;
  }

  // Puntaje de un grupo de 4 — nunca Infinity
  function scoreFour(group) {
    var div = bestFourDiv(group);
    return div.matchScore + div.lineScore;
  }

  // Backtracking: construye líneas
  function buildLines(remaining, threeLeft, fourLeft) {
    if (threeLeft === 0 && fourLeft === 0) return [];
    var size = threeLeft > 0 ? 3 : 4;
    var combos = getCombos(remaining, size);

    // Ordenar por puntaje (menor primero)
    var scoreFn = size === 3 ? scoreThree : scoreFour;
    combos.sort(function(a, b) { return scoreFn(a) - scoreFn(b); });

    for (var i = 0; i < combos.length; i++) {
      var group = combos[i];

      var usedSet = {};
      group.forEach(function(p) { usedSet[p.matricula] = true; });
      var next = remaining.filter(function(p) { return !usedSet[p.matricula]; });

      var sub = buildLines(
        next,
        threeLeft > 0 ? threeLeft - 1 : 0,
        threeLeft === 0 ? fourLeft - 1 : fourLeft
      );
      if (sub === null) continue; // backtrack

      // Construir objeto de línea
      var lineObj;
      if (size === 3) {
        lineObj = {
          players: group,
          matches: allPairs(group).map(function(mp) { return { j1: mp[0].matricula, j2: mp[1].matricula }; }),
        };
      } else {
        var div = bestFourDiv(group);
        lineObj = {
          players: group,
          matches: div.matches.map(function(mp) { return { j1: mp[0].matricula, j2: mp[1].matricula }; }),
        };
      }
      return [lineObj].concat(sub);
    }
    return null; // no solution found, backtrack
  }

  const lines = buildLines(players, numThree, numFour);
  if (!lines) {
    return { ok: false, error: 'Error inesperado al armar líneas. Intentá de nuevo.' };
  }

  // ── 6. Formatear resultado ────────────────────────────────────────────────
  return {
    ok: true,
    lines: lines.map(function(l, i) {
      return {
        lineNum: i + 1,
        players: l.players.map(function(p) {
          return { matricula: p.matricula, apodo: p.apodo, hcp: p.hcp };
        }),
        matches: l.matches,
      };
    }),
  };
}
// ════════════ fin ARMAR LÍNEAS ════════════

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
      case 'resetFecha':            result = resetFecha_(params); break;
      case 'eliminarFecha':         result = eliminarFecha_(params); break;
      case 'getTarjetasForFecha':   result = getTarjetasForFecha_(params); break;
      case 'setBonusWinners':       result = setBonusWinners_(params); break;
      case 'cargarMatches':       result = cargarMatches_(params); break;
      case 'editarMatches':       result = editarMatches_(params); break;
      case 'actualizarHcpIndices': result = actualizarHcpIndices_(params); break;
      case 'armarLineas':          result = armarLineas_(params); break;
      case 'fechaLineas':          result = { ok: true, data: getFechaLineas_(params.fecha) }; break;
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
