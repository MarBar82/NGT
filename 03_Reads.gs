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
  // Source of truth: NGT DB Rating (A=id, B=nombre) — deduplicated by id
  const sh = getHistSheet_('Rating');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  const seen = {};
  const out  = [];
  data.forEach(function(row) {
    const id     = String(row[0] || '').trim();
    const nombre = String(row[1] || '').trim();
    if (!id || !nombre || seen[id]) return;
    seen[id] = true;
    out.push({ id, nombre });
  });
  return out.sort(function(a, b) { return a.nombre.localeCompare(b.nombre); });
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

// ════════ NGT DB SCORE HELPERS ════════
// NGT DB SCORE: A=Fecha, B=Matricula, C=Stableford, D=Match, E=Bonus, F=Doble(puntos), G=PosFecha, H=PosLeaderboard

function getNGTScoreSheet_() {
  return getSheet_('SCORE');
}

function getAllNGTScoreData_() {
  const sh = getNGTScoreSheet_();
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const raw = sh.getRange(2, 1, last - 1, 8).getValues();
  return raw.map(function(r, i) {
    return {
      fecha:    String(r[0] || '').trim(),
      mat:      String(r[1] || '').trim(),
      st:       Number(r[2]) || 0,
      ma:       Number(r[3]) || 0,
      pb:       Number(r[4]) || 0,
      db:       Number(r[5]) || 0,
      posFecha: Number(r[6]) || 0,
      posLb:    Number(r[7]) || 0,
      sheetRow: i + 2,
    };
  }).filter(function(r) { return r.fecha && r.mat; });
}

/**
 * Returns the scoring history for a single player, one row per fecha, enriched
 * with cancha (from FECHA_META) and fechaReal (from CALCULOS!AA:AC).
 * Response: [{ fecha, cancha, fechaReal, st, ma, pb, total }, ...] sorted ascending.
 */
function getJugadorFechas_(matricula) {
  const matStr = String(matricula || '').trim();
  if (!matStr) return [];

  const myRows = getAllNGTScoreData_().filter(function(r) { return r.mat === matStr; });
  if (!myRows.length) return [];

  // fechaNum → real date (ISO 'dd/MM/yyyy') from CALCULOS!AA:AC
  const fechaDateMap = {};
  try {
    const shC = getSheet_('CALCULOS');
    if (shC) {
      const lastRowC = shC.getLastRow();
      if (lastRowC >= 2) {
        const rows = shC.getRange(2, 27, lastRowC - 1, 3).getValues();
        rows.forEach(function(row) {
          const fechaRaw = row[0];
          const fechaNum = row[2];
          if (!fechaRaw || !fechaNum) return;
          const d = fechaRaw instanceof Date ? fechaRaw : new Date(fechaRaw);
          if (!isNaN(d.getTime())) {
            fechaDateMap[String(parseInt(fechaNum))] = Utilities.formatDate(d, 'GMT-03:00', 'dd/MM/yyyy');
          }
        });
      }
    }
  } catch(e) {}

  // fechaNum → canchaName: TARJETAS first (covers all fechas with cards), FECHA_META as fallback
  const fechaCanchaMap = {};
  try {
    const shT = getSheet_(SHEETS.TARJETAS);
    if (shT) {
      const lastT = shT.getLastRow();
      if (lastT >= 2) {
        const tRows = shT.getRange(2, 1, lastT - 1, 4).getValues(); // A=fecha, B=mat, C=hcp, D=canchaId
        tRows.forEach(function(row) {
          const fKey = String(parseInt(row[0]) || row[0]);
          if (!fKey || fKey === '0' || fechaCanchaMap[fKey]) return;
          const cId = String(row[3] || '').trim();
          if (cId) fechaCanchaMap[fKey] = lookupCanchaName_(cId) || cId;
        });
      }
    }
  } catch(e) {}
  try {
    const meta = JSON.parse(PropertiesService.getDocumentProperties().getProperty('FECHA_META') || '{}');
    Object.keys(meta).forEach(function(k) {
      if (!fechaCanchaMap[k] && meta[k].canchaName) fechaCanchaMap[k] = meta[k].canchaName;
    });
  } catch(e) {}

  return myRows.map(function(r) {
    const fKey = String(parseInt(r.fecha) || r.fecha);
    return {
      fecha:     parseInt(r.fecha) || 0,
      cancha:    fechaCanchaMap[fKey] || '',
      fechaReal: fechaDateMap[fKey]   || '',
      st:        r.st,
      ma:        r.ma,
      pb:        r.pb,
      total:     r.st + r.ma + r.pb,
    };
  }).sort(function(a, b) { return a.fecha - b.fecha; });
}

function findNGTScoreRow_(fechaStr, matStr) {
  const sh = getNGTScoreSheet_();
  if (!sh) return -1;
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const data = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === String(fechaStr) &&
        String(data[i][1] || '').trim() === String(matStr)) {
      return i + 2;
    }
  }
  return -1;
}

// colIdx: 3=Stableford, 4=Match, 5=Bonus, 6=Doble, 7=PosFecha, 8=PosLeaderboard (1-based sheet column in NGT DB)
function setNGTScoreField_(fechaStr, matStr, colIdx, value) {
  const sh = getNGTScoreSheet_();
  if (!sh) return;
  let row = findNGTScoreRow_(fechaStr, matStr);
  if (row < 0) {
    row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 8).setValues([[fechaStr, matStr, 0, 0, 0, 0, 0, 0]]);
  } else {
    // Guard: verify the found row actually belongs to this fecha+mat (defensive check).
    const ab2 = sh.getRange(row, 1, 1, 2).getValues()[0];
    const actualFecha = String(ab2[0] || '').trim();
    const actualMat   = String(ab2[1] || '').trim();
    if (actualFecha !== String(fechaStr).trim() || actualMat !== String(matStr).trim()) {
      audit_('SCORE_ROW_MISMATCH', 'system',
        { expected: { fecha: fechaStr, mat: matStr }, actual: { fecha: actualFecha, mat: actualMat }, col: colIdx, row: row });
      return;
    }
  }
  sh.getRange(row, colIdx).setValue(value);
}

function getNGTScoreRow_(fechaStr, matStr) {
  const sh = getNGTScoreSheet_();
  if (!sh) return null;
  const row = findNGTScoreRow_(fechaStr, matStr);
  if (row < 0) return null;
  const vals = sh.getRange(row, 1, 1, 8).getValues()[0];
  return {
    st:       Number(vals[2]) || 0,
    ma:       Number(vals[3]) || 0,
    pb:       Number(vals[4]) || 0,
    db:       Number(vals[5]) || 0,
    posFecha: Number(vals[6]) || 0,
    posLb:    Number(vals[7]) || 0,
  };
}

function getJugadoresConDobleDisponible_() {
  // Returns list of matriculas that have NOT used their doble in ANY fecha.
  // Checks: col AT (46, manual global override) AND NGT DB SCORE Doble field.
  const sh = getSheet_('SCORE');
  if (!sh) return [];
  const data = sh.getRange(2, 1, 19, 46).getValues(); // A2:AT20

  function isTrue_(v) {
    return (v === true) || (v === 1) ||
      (typeof v === 'string' && (v.toUpperCase() === 'TRUE' || v.toUpperCase() === 'VERDADERO'));
  }

  // Build set of mats who used doble in any fecha (from NGT DB)
  const ngtRows = getAllNGTScoreData_();
  const dobledMats = new Set();
  ngtRows.forEach(function(r) { if (r.db !== 0) dobledMats.add(r.mat); });

  const available = [];
  data.forEach(function(row) {
    const mat = String(row[0] || '').trim();
    if (!mat) return;
    if (isTrue_(row[45])) return;  // AT global flag
    if (dobledMats.has(mat)) return;
    available.push(mat);
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
  // Use 1 as placeholder until the player loads their tarjeta (which updates to actual ST value)
  setNGTScoreField_(String(fecha), String(matricula), 6, 1);
  return { ok: true };
}

function getStForPlayerInFecha_(matricula, fecha) {
  const r = getNGTScoreRow_(String(fecha), String(matricula));
  if (!r || r.st === 0) return null;
  return r.st;
}

// Write the ST score (undoubled) into SCORE!AU so LEADERBOARD formulas can display it.
// AU = column 47. stVal is passed directly from the caller (already computed).
function writeDobleStScore_(matricula, fecha, stVal) {
  const sh = getSheet_('SCORE');
  if (!sh) return { ok: false, error: 'SCORE no encontrada' };
  const row = getScoreRowForMat_(matricula);
  if (row < 0) return { ok: false, error: 'Matrícula no está en SCORE' };
  sh.getRange(row, 47).setValue(stVal); // AU = col 47
  return { ok: true, st: stVal };
}

/**
 * Read Stableford rankings for a specific fecha from STB sheet.
 * STB!A:I — A=fecha, B=matricula, C..I=stb breakdown e-k, I=total
 * Returns array ordered by stableford descending.
 */
function getStableforFromSTB_(fecha) {
  const sh = getSheet_('STB');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // A=fecha, B=mat, C..I=stb e-k (9 cols)
  const data = sh.getRange(2, 1, lastRow - 1, 9).getValues();

  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  const out = [];
  data.forEach(row => {
    const f = String(row[0] || '').trim();  // col A
    const m = String(row[1] || '').trim();  // col B
    const stb = row[8];                     // col I (total)
    if (f !== String(fecha) || !m) return;
    const stbNum = parseFloat(String(stb || '').replace(',', '.'));
    if (isNaN(stbNum)) return;
    const j = jugMap[m];
    out.push({
      matricula: m,
      nombre: j ? j.nombre : m,
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return {};
  const data = sh.getRange(2, 1, nextEmpty - 2, 3).getValues(); // A,B,C
  const out = {};
  data.forEach(row => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    const hcp = row[2];
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return '';
  const data = sh.getRange(2, 1, nextEmpty - 2, 4).getValues(); // A..D
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][0] || '').trim();
    const cId = String(data[i][3] || '').trim();
    if (f === String(fecha) && cId) return lookupCanchaName_(cId) || cId;
  }
  return '';
}

/**
 * Get all matches for a fecha with full scores (for Match Play calculation in the frontend).
 * Reads MATCH!D..X : D=jugador, E=hcp85, F-W=H1-H18, X=resultado
 */
function getMatchesFullForFecha_(fecha) {
  // Returns match data for display including per-hole net scores.
  // Net scores computed on the fly from TARJETAS (gross) + CANCHAS (indices).
  const fStr = String(fecha);
  const shM  = getSheet_(SHEETS.MATCH);
  if (!shM) return [];
  const nextEmpty = findNextEmptyRow_(shM, 4);
  if (nextEmpty <= 2) return [];

  // B=fecha, C=mat1, D=mat2, E=res1, F=pts1, G=res2, H=pts2
  const mData = shM.getRange(2, 2, nextEmpty - 2, 7).getValues();
  const pairs = [];
  for (let i = 0; i < mData.length; i++) {
    if (String(mData[i][0] || '').trim() !== fStr) continue;
    const matA = String(mData[i][1] || '').trim();
    const matB = String(mData[i][2] || '').trim();
    if (!matA || !matB) continue;
    pairs.push({ matA, matB, resA: String(mData[i][3] || ''), resB: String(mData[i][5] || '') });
  }
  if (!pairs.length) return [];

  const jugMapFull = {};
  getJugadores_().forEach(function(j) { jugMapFull[j.matricula] = j; });

  const shT = getSheet_(SHEETS.TARJETAS);
  if (!shT) return [];
  const nextT = findNextEmptyRow_(shT, 1);
  if (nextT <= 2) return [];
  // A..X: 0=fecha,1=mat,2=hcp,3=canchaId,4..21=H1..H18
  const tData = shT.getRange(2, 1, nextT - 2, 24).getValues();
  const tarjMap = {};
  let canchaId = null;
  tData.forEach(function(r) {
    if (String(r[0] || '').trim() !== fStr) return;
    const m = String(r[1] || '').trim();
    if (m) { tarjMap[m] = r; if (!canchaId) canchaId = String(r[3] || '').trim(); }
  });

  const cd = canchaId ? getCanchaPares_(canchaId) : null;
  const cpIndices = (cd && cd.indices) ? cd.indices : new Array(18).fill(0);

  const matches = [];
  pairs.forEach(function(p) {
    const tarjA = tarjMap[p.matA];
    const tarjB = tarjMap[p.matB];
    if (!tarjA || !tarjB) return;

    const hcpA   = parseFloat(tarjA[2]);
    const hcpB   = parseFloat(tarjB[2]);
    const hcp85A = isNaN(hcpA) ? 0 : hcpA;
    const hcp85B = isNaN(hcpB) ? 0 : hcpB;
    const ayA = Math.max(0, hcp85A - hcp85B);
    const ayB = Math.max(0, hcp85B - hcp85A);
    const bcA = Math.max(0, ayA - 18);
    const bcB = Math.max(0, ayB - 18);

    const scA = tarjA.slice(4, 22);
    const scB = tarjB.slice(4, 22);
    const netA = [], netB = [];
    for (let h = 0; h < 18; h++) {
      const idx  = cpIndices[h] || 0;
      const adjA = (ayA > 0 && ayA >= idx ? -1 : 0) + (bcA > 0 && idx <= bcA ? -1 : 0);
      const adjB = (ayB > 0 && ayB >= idx ? -1 : 0) + (bcB > 0 && idx <= bcB ? -1 : 0);
      const gA   = (scA[h] !== '' && scA[h] != null) ? parseInt(scA[h]) : null;
      const gB   = (scB[h] !== '' && scB[h] != null) ? parseInt(scB[h]) : null;
      netA.push(gA !== null && !isNaN(gA) ? gA + adjA : '');
      netB.push(gB !== null && !isNaN(gB) ? gB + adjB : '');
    }

    const jug1 = jugMapFull[p.matA] || {};
    const jug2 = jugMapFull[p.matB] || {};
    matches.push({
      j1Name:   jug1.nombre || p.matA,
      j2Name:   jug2.nombre || p.matB,
      j1Hcp:    hcp85A,
      j2Hcp:    hcp85B,
      j1Scores: netA,
      j2Scores: netB,
      j1Result: p.resA,
      j2Result: p.resB,
    });
  });
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return [];
  // Cols: A=FECHA(0), B=MATRICULA(1), C=HCP(2), D=CANCHAІД(3), E..V=HOLES(4..21), W=LD(22), X=BA(23), Y=COLOR_TEE(24)
  const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();
  const out = [];
  const canchasNeeded = {}; // canchaId → true
  data.forEach(function(row, i) {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    if (m !== String(matricula) || !f) return;
    const canchaId   = String(row[3] || '').trim(); // D = ID
    const canchaName = lookupCanchaName_(canchaId) || canchaId;
    const ct         = String(row[24] || '').trim().toUpperCase();
    const hoyo1      = row[4]; // col E
    out.push({
      fecha:     f,
      hcp:       row[2] || '',
      hasScores: hoyo1 !== '' && hoyo1 !== null && hoyo1 !== undefined,
      cancha:    canchaName,
      canchaId:  canchaId,
      colorTee:  ct || 'BLANCAS',
      rowIndex:  i + 2,
    });
    if (canchaId) canchasNeeded[canchaId] = true;
  });

  // Build canchaId→{pares, indices} from NGT DB CANCHAS (A=id, B=hoyo, C=par, D=hcp_idx)
  const paresMap   = {};
  const indicesMap = {};
  if (Object.keys(canchasNeeded).length) {
    const shDb = getHistSheet_('CANCHAS');
    if (shDb) {
      const lr = shDb.getLastRow();
      if (lr >= 2) {
        const idata = shDb.getRange(2, 1, lr - 1, 4).getValues();
        const holes = {}; // id → [{hoyo, par, idx}]
        idata.forEach(function(r) {
          const cId = String(r[0] || '').trim();
          if (!canchasNeeded[cId]) return;
          const hoyo = parseInt(r[1]);
          const par  = parseInt(r[2]) || null;
          const idx  = parseInt(r[3]) || null;
          if (hoyo < 1 || hoyo > 18) return;
          if (!holes[cId]) holes[cId] = [];
          holes[cId].push({ hoyo, par, idx });
        });
        Object.keys(holes).forEach(function(cId) {
          const hs = holes[cId];
          if (hs.length !== 18) return;
          hs.sort(function(a, b) { return a.hoyo - b.hoyo; });
          paresMap[cId]   = hs.map(function(h) { return h.par; });
          indicesMap[cId] = hs.map(function(h) { return h.idx; });
        });
      }
    }
  }

  out.forEach(function(f) {
    const k = f.canchaId;
    if (paresMap[k])   f.pares   = paresMap[k];
    if (indicesMap[k]) f.indices = indicesMap[k];
  });
  return out.sort(function(a, b) { return parseInt(b.fecha) - parseInt(a.fecha); });
}

function getCanchaPares_(canchaId) {
  // Returns { id, nombre, pares:[18], indices:[18], ratings:[{tee,rating,slope}] }
  // Lookup is by ID only — all TARJETAS records have canchaId in col G.
  const id = String(canchaId || '').trim();
  if (!id) return null;

  // NGT DB CANCHAS: A=id, B=hoyo, C=par, D=hcp_idx
  const shHoyos  = getHistSheet_('CANCHAS');
  // NGT DB Rating:  A=id, B=nombre, C=tee, D=rating, E=slope
  const shRating = getHistSheet_('Rating');
  if (!shHoyos || !shRating) return null;

  const pares   = new Array(18).fill(null);
  const indices = new Array(18).fill(null);
  const lrH = shHoyos.getLastRow();
  if (lrH >= 2) {
    const hData = shHoyos.getRange(2, 1, lrH - 1, 4).getValues();
    hData.forEach(function(r) {
      if (String(r[0] || '').trim() !== id) return;
      const h = parseInt(r[1]);
      if (h < 1 || h > 18) return;
      pares[h - 1]   = parseInt(r[2]) || null;
      indices[h - 1] = parseInt(r[3]) || null;
    });
  }

  let nombre = '';
  const ratings = [];
  const lrR = shRating.getLastRow();
  if (lrR >= 2) {
    const rData = shRating.getRange(2, 1, lrR - 1, 5).getValues();
    rData.forEach(function(r) {
      if (String(r[0] || '').trim() !== id) return;
      if (!nombre) nombre = String(r[1] || '').trim();
      const tee    = String(r[2] || '').trim();
      const rating = parseFloat(r[3]) || null;
      const slope  = parseInt(r[4])   || null;
      if (tee && slope) ratings.push({ tee, rating, slope });
    });
  }

  if (!nombre && pares.every(function(p) { return p === null; })) return null;
  return { id, nombre, pares, indices, ratings };
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

  // ── 2. Read par total from NGT DB CANCHAS (A=id, B=hoyo, C=par, D=hcp_idx) ──
  let par = null;
  const shHoyos = getHistSheet_('CANCHAS');
  if (shHoyos) {
    const clr = shHoyos.getLastRow();
    if (clr >= 2) {
      const cData = shHoyos.getRange(2, 1, clr - 1, 3).getValues();
      let total = 0, count = 0;
      cData.forEach(function(cr) {
        if (String(cr[0] || '').trim() !== idKey) return;
        const p = parseInt(cr[2]) || 0;
        if (p > 0) { total += p; count++; }
      });
      if (count === 18) par = total;
    }
  }

  // ── 3. Read hcpIndex for every player from JUGADORES ─────────────────────
  // Fórmula WHS completa: round(HCPindex × slope/113 + (courseRating − par))
  // El ajuste (rating − par) corrige diferencias entre el rating y el par del
  // campo, que pueden ser positivas o negativas.
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
        let ch = hcpIndex * slope / 113;
        if (rating !== null && par !== null) ch += (rating - par);
        hcpMap[mat] = Math.round(ch);
      });
    }
  }

  return { slope, rating, par, tee: matchedTee, hcpMap };
}

function debugHcpCalculo_(params) {
  const canchaId   = String(params.canchaId   || '').trim();
  const canchaName = String(params.canchaName || '').trim();
  const teeColor   = String(params.teeColor   || 'BLANCAS').trim().toUpperCase();

  // ── Slope y Rating desde NGT DB Rating ───────────────────────────────────
  const shRating = getHistSheet_('Rating');
  const ratingRows = [];
  let slope = null, rating = null, matchedTee = null;
  if (shRating) {
    const rlr = shRating.getLastRow();
    if (rlr >= 2) {
      const rData = shRating.getRange(2, 1, rlr - 1, 5).getValues();
      rData.forEach(r => ratingRows.push({ id: r[0], nombre: r[1], tee: r[2], rating: r[3], slope: r[4] }));
      const idKey  = canchaId.toUpperCase();
      const nomKey = canchaName.toUpperCase();
      for (const r of rData) {
        const id  = String(r[0] || '').trim().toUpperCase();
        const nom = String(r[1] || '').trim().toUpperCase();
        if (id !== idKey && nom !== nomKey) continue;
        if (String(r[2] || '').trim().toUpperCase() !== teeColor) continue;
        slope = parseInt(r[4]) || null;
        rating = parseFloat(r[3]) || null;
        matchedTee = r[2];
        break;
      }
    }
  }

  // ── Par desde NGT DB CANCHAS (A=id, B=hoyo, C=par, D=hcp_idx) ──────────
  const shHoyosDbg = getHistSheet_('CANCHAS');
  const canchasRows = [];
  let par = null, paresRaw = [];
  const idKeyDbg = canchaId.trim();
  if (shHoyosDbg) {
    const clr = shHoyosDbg.getLastRow();
    if (clr >= 2) {
      const cData = shHoyosDbg.getRange(2, 1, clr - 1, 3).getValues();
      cData.forEach(function(cr) { canchasRows.push({ id: cr[0], hoyo: cr[1], par: cr[2] }); });
      let total = 0, count = 0;
      cData.forEach(function(cr) {
        if (String(cr[0] || '').trim() !== idKeyDbg) return;
        const p = parseInt(cr[2]) || 0;
        paresRaw.push(p);
        if (p > 0) { total += p; count++; }
      });
      if (count === 18) par = total;
    }
  }

  // ── Muestra de jugadores ──────────────────────────────────────────────────
  const jugSh = getSheet_(SHEETS.JUGADORES);
  const sampleCalcs = [];
  if (jugSh && slope) {
    const jlr = jugSh.getLastRow();
    if (jlr >= 2) {
      const cols = COL_J.HCP_INDEX + 1;
      const jData = jugSh.getRange(2, 1, Math.min(jlr - 1, 5), cols).getValues();
      jData.forEach(row => {
        const mat = String(row[COL_J.MATRICULA] || '').trim();
        const rawHcp = row[COL_J.HCP_INDEX];
        if (!mat || rawHcp === '' || rawHcp === null) return;
        const hcpIndex = parseFloat(rawHcp);
        if (isNaN(hcpIndex)) return;
        let ch = hcpIndex * slope / 113;
        const ajuste = (rating !== null && par !== null) ? (rating - par) : null;
        if (ajuste !== null) ch += ajuste;
        sampleCalcs.push({ mat, hcpIndex, formula: hcpIndex + ' × ' + slope + '/113' + (ajuste !== null ? ' + (' + rating + '-' + par + ')' : ''), result: Math.round(ch) });
      });
    }
  }

  return {
    input:       { canchaId, canchaName, teeColor },
    ratingSheet: { found: !!slope, slope, rating, matchedTee, allRows: ratingRows.slice(0, 10) },
    canchasSheet:{ found: par !== null, par, paresRaw, allRows: canchasRows.slice(0, 5) },
    sampleCalcs,
    formula:     slope ? ('round(HCPindex × ' + slope + '/113' + (par !== null ? ' + (' + rating + '-' + par + '))' : ')') + ' — ajuste=' + (par !== null ? (rating - par) : 'N/A (par no encontrado)')) : 'slope no encontrado',
  };
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return [];
  const data = sh.getRange(2, 1, nextEmpty - 2, 1).getValues();
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
  const nextEmpty = findNextEmptyRow_(shT, 1);
  if (nextEmpty <= 2) return [];

  const data = shT.getRange(2, 1, nextEmpty - 2, 2).getValues();

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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return null;
  const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][0] || '').trim();
    const m = String(data[i][1] || '').trim();
    if (f === String(fecha) && m === String(matricula)) {
      return {
        rowIndex: i + 2,
        fecha: f, matricula: m,
        hcp: data[i][2],
        canchaId: data[i][3],
        scores: data[i].slice(4, 22),
        ld: data[i][22], ba: data[i][23],
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return { ldWinner: null, baWinner: null };

  const data = sh.getRange(2, 1, nextEmpty - 2, 24).getValues();
  // cols: A=fecha(0), B=mat(1), C=hcp(2), D=canchaId(3), E..V=holes(4..21), W=LD(22), X=BA(23)

  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  let ldWinner = null;
  let baWinner = null;
  for (let i = 0; i < data.length; i++) {
    const f = String(data[i][0] || '').trim();
    const m = String(data[i][1] || '').trim();
    if (f !== String(fecha) || !m) continue;
    const ldVal = data[i][22];
    const baVal = data[i][23];
    if (!ldWinner && (ldVal === 1 || ldVal === true || String(ldVal) === '1')) {
      ldWinner = {
        matricula: m,
        apodo: (jugMap[m] && jugMap[m].apodo) || '',
        nombre: (jugMap[m] && jugMap[m].nombre) || m,
      };
    }
    if (!baWinner && (baVal === 1 || baVal === true || String(baVal) === '1')) {
      baWinner = {
        matricula: m,
        apodo: (jugMap[m] && jugMap[m].apodo) || '',
        nombre: (jugMap[m] && jugMap[m].nombre) || m,
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

  // Read cols A..X (A=fecha, B=mat, C=hcp, D=canchaId, E..V=holes, W=LD, X=BA)
  const data = sh.getRange(2, 1, lr - 1, 24).getValues();
  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[String(j.matricula).trim()] = j; });

  const totals = {};   // matricula → {ld, ba, ...}
  data.forEach(r => {
    const m = String(r[1] || '').trim();
    if (!m) return;
    const ldVal = r[22];
    const baVal = r[23];
    const isLd = (ldVal === 1 || ldVal === true || String(ldVal) === '1');
    const isBa = (baVal === 1 || baVal === true || String(baVal) === '1');
    if (!isLd && !isBa) return;
    if (!totals[m]){
      const j = jugMap[m] || {};
      totals[m] = {
        matricula: m,
        apodo: j.apodo || '',
        nombre: j.nombre || m,
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
 * Devuelve la fecha "activa" para mostrar en el home:
 * — la más reciente que tiene líneas confirmadas en FECHA_META
 * — y aún no está completada (no todos los jugadores cargaron tarjeta).
 * Es independiente del calendario (CALCULOS), así funciona con fechas de prueba también.
 */
function getFechaActiva_() {
  const props = PropertiesService.getDocumentProperties();
  const meta  = JSON.parse(props.getProperty('FECHA_META') || '{}');

  // Fechas con líneas confirmadas, ordenadas de mayor a menor
  const fechasConLineas = Object.keys(meta)
    .filter(function(f) { return Array.isArray(meta[f].lineas) && meta[f].lineas.length > 0; })
    .map(Number)
    .sort(function(a, b) { return b - a; });

  if (!fechasConLineas.length) return null;

  // Tomar la más reciente que no esté completada
  for (var i = 0; i < fechasConLineas.length; i++) {
    const fNum = fechasConLineas[i];
    const m    = meta[String(fNum)];

    // Una fecha está "completada" cuando TODOS los jugadores cargaron sus scores.
    // Col H (Hoyo 1) es el indicador — si tiene valor, el jugador cargó tarjeta.
    // El HCP (col E) NO sirve porque se auto-rellena al crear la fecha.
    const shT = getSheet_(SHEETS.TARJETAS);
    var completada = false;
    if (shT) {
      try {
        const ne = findNextEmptyRow_(shT, 1);
        if (ne > 2) {
          // A(0)=fecha, B(1)=mat, C(2)=nombre, D(3)=hcp, E(4)=cancha, F(5)=canchaId, G(6)=hoyo1
          const rows = shT.getRange(2, 1, ne - 2, 7).getValues();
          const jugadoresFecha = rows.filter(function(r) {
            const f   = String(r[0] || '').trim();
            const mat = String(r[1] || '').trim();
            return f === String(fNum) && mat && mat.indexOf('INV') !== 0;
          });
          if (jugadoresFecha.length > 0) {
            const conScores = jugadoresFecha.filter(function(r) {
              const hoyo1 = r[6]; // col H — solo tiene valor cuando el jugador cargó su tarjeta
              return hoyo1 !== '' && hoyo1 !== null && hoyo1 !== undefined && hoyo1 !== false;
            });
            completada = conScores.length === jugadoresFecha.length;
          } else {
            // Sin jugadores no-INV encontrados para esta fecha → la tratamos como completada
            // para no mostrar el botón innecesariamente (edge case: líneas solo con INV).
            completada = true;
          }
        }
      } catch(e) {}
    }

    // Devolver esta fecha si no está completada (o si no pudimos verificar)
    if (!completada) {
      // Resolver fecha calendario real desde CALCULOS!AA:AC (columnas 27-29, base 1)
      var fechaStr = '';
      try {
        var shC = getSheet_('CALCULOS');
        if (shC) {
          var lastRowC = shC.getLastRow();
          if (lastRowC >= 2) {
            var calRows = shC.getRange(2, 27, lastRowC - 1, 3).getValues();
            for (var ci = 0; ci < calRows.length; ci++) {
              var calFechaNum = parseInt(calRows[ci][2]);
              if (calFechaNum === fNum) {
                var d = calRows[ci][0] instanceof Date ? calRows[ci][0] : new Date(calRows[ci][0]);
                if (!isNaN(d.getTime())) {
                  fechaStr = Utilities.formatDate(d, 'GMT-03:00', 'dd/MM/yyyy');
                }
                break;
              }
            }
          }
        }
      } catch(e) {}
      // Combinar con horario: "dd/mm/aaaa · hh:mm" o solo la parte disponible
      var horario = m.horario || '';
      if (fechaStr && horario) {
        fechaStr = fechaStr + ' · ' + horario;
      } else if (!fechaStr && horario) {
        fechaStr = horario;
      }
      return {
        fechaNum:  fNum,
        fechaStr:  fechaStr,
        cancha:    m.canchaName || '',
        horario:   horario,
        greenFee:  m.greenFee   || '',
        colorTee:  m.colorTee   || 'BLANCAS',
        hasLineas: true,
      };
    }
  }
  return null; // todas las fechas con líneas ya están completadas
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
    const ne = findNextEmptyRow_(shT, 1);
    if (ne > 2) {
      shT.getRange(2, 1, ne - 2, 4).getValues().forEach(function(row) {
        const f = String(row[0] || '').trim();
        const m = String(row[1] || '').trim();
        if (f === String(fecha) && m) hcpMap[m] = parseInt(row[2]) || 0;
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
  const cd = cachedRead_('cp2_' + (canchaId || canchaName), 600, function(){ return getCanchaPares_(canchaId || canchaName); });
  const ratings = (cd && cd.ratings) || [];
  const parTotal = (cd && cd.pares)
    ? cd.pares.filter(function(v){ return v !== null && v > 0; }).reduce(function(s,v){ return s+v; }, 0)
    : null;

  function computeHcp(hcpIndex, slope, rating) {
    if (!hcpIndex || !slope) return null;
    var ch = hcpIndex * slope / 113;
    if (rating !== null && rating !== undefined && parTotal) ch += (rating - parTotal);
    return Math.round(ch);
  }

  // ── Matches de esta fecha desde MATCH sheet ───────────────────────────────
  // Cada match ocupa 2 filas consecutivas con la misma fecha:
  //   fila N:   [fecha, mat1, nombre1]
  //   fila N+1: [fecha, mat2, nombre2]
  const shM = getSheet_(SHEETS.MATCH);
  const matchPairsSet = {}; // "matA|matB" sorted → true
  if (shM) {
    try {
      const ne2 = shM.getLastRow();
      if (ne2 >= 3) {
        const mData = shM.getRange(2, 2, ne2 - 1, 3).getValues(); // B=fecha, C=mat1, D=mat2
        for (var ri = 0; ri < mData.length; ri++) {
          if (String(mData[ri][0] || '').trim() !== String(fecha)) continue;
          const j1 = String(mData[ri][1] || '').trim();
          const j2 = String(mData[ri][2] || '').trim();
          if (j1 && j2) matchPairsSet[[j1, j2].sort().join('|')] = true;
        }
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
        const teeHcp = computeHcp(hcpIndex, r.slope, r.rating);
        teeData[key] = {
          hcp:   teeHcp,
          pct85: teeHcp !== null ? Math.round(teeHcp * 0.85) : null,
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
    fecha:      String(fecha),
    dia:        fechasMap[String(fecha)] || '',
    cancha:     canchaName,
    canchaId:   canchaId,
    colorTee:   meta.colorTee   || 'BLANCAS',
    horario:    meta.horario    || '',
    greenFee:   meta.greenFee   || '',
    hoyoSalida: meta.hoyoSalida || 1,
    lineas:     lineas,
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
  const data = shT.getRange(2, 1, nextEmpty - 2, 25).getValues();
  const jugadores = [];
  const invitados = [];
  let cancha = '';
  let colorTee = '';
  const jugMapDet2 = {}; getJugadores_().forEach(function(j){ jugMapDet2[String(j.matricula).trim()] = j; });
  data.forEach((row, i) => {
    const f = String(row[0] || '').trim();
    const m = String(row[1] || '').trim();
    const cId = String(row[3] || '').trim();
    const ct = String(row[24] || '').trim();
    if (f !== String(fecha) || !m) return;
    if (!cancha && cId) cancha = lookupCanchaName_(cId) || cId;
    if (!colorTee && ct) colorTee = ct.toUpperCase();
    const n = m.indexOf('INV') === 0 ? m : ((jugMapDet2[m] && jugMapDet2[m].nombre) || m);
    if (m.indexOf('INV') === 0) {
      invitados.push({ matricula: m, nombre: n, row: i + 2 });
    } else {
      jugadores.push({ matricula: m, nombre: n, row: i + 2 });
    }
  });

  const dobles = getDoblesForFecha_(fecha);
  const metaDet = getFechaMeta_(fecha);
  const hoyoSalidaDet = (metaDet && metaDet.hoyoSalida) ? metaDet.hoyoSalida : 1;

  return { fecha: fecha, cancha: cancha, colorTee: colorTee, jugadores: jugadores, invitados: invitados, dobles: dobles, hoyoSalida: hoyoSalidaDet };
}

function getDoblesForFecha_(fecha) {
  const fStr = String(fecha);
  const ngtRows = getAllNGTScoreData_();
  return ngtRows.filter(function(r) { return r.fecha === fStr && r.db !== 0; }).map(function(r) { return r.mat; });
}

/**
 * Edit existing fecha: update cancha, add new players, remove removed ones, update dobles
 */
function editarFecha_(params) {
  const { adminKey, fecha, canchaId, jugadores, dobles, invitados, colorTee, hoyoSalida } = params;
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

  // Find existing rows for this fecha (read A-D = 4 cols: fecha, mat, hcp, canchaId)
  const nextEmpty = findNextEmptyRow_(sh, 1);
  const existingRows = [];
  let existingCanchaId   = '';
  let existingCanchaName = '';
  const jugMapEdit = {}; getJugadores_().forEach(function(j){ jugMapEdit[String(j.matricula).trim()] = j; });
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 1, nextEmpty - 2, 4).getValues(); // A(0)-D(3)
    data.forEach((row, i) => {
      const f = String(row[0] || '').trim();
      const m = String(row[1] || '').trim();
      if (f === String(fecha) && m) {
        if (!existingCanchaId && row[3]) existingCanchaId = String(row[3] || '').trim(); // D
        const n = m.indexOf('INV') === 0 ? m : ((jugMapEdit[m] && jugMapEdit[m].nombre) || m);
        existingRows.push({
          row: i + 2,
          matricula: m,
          nombre: n,
          isInvitado: m.indexOf('INV') === 0,
        });
      }
    });
    if (existingCanchaId) existingCanchaName = lookupCanchaName_(existingCanchaId) || existingCanchaId;
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
        sh.getRange(er.row, 4).setValue(canchaId); // D = canchaId
      });
      changes.canchaUpdated = true;
    } catch (e) { changes.errors.push('cancha: ' + e.message); }
  }

  // Step 1b: Update color tee (col AG = 33) for all existing rows
  if (colorFinal) {
    try {
      existingRows.forEach(er => {
        sh.getRange(er.row, 25).setValue(colorFinal);   // Y = col 25
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
          if (hcp !== undefined) sh.getRange(er.row, 3).setValue(hcp); // C = HCP de juego
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

  const stbShEdit = getSheet_('STB');
  const addedToStb = [];
  targetJugadores.forEach(mat => {
    if (currentMatriculas.indexOf(mat) >= 0) return;
    try {
      sh.getRange(nextRow, 1).setValue(fecha);
      sh.getRange(nextRow, 2).setValue(mat);
      // Write HCP de juego for new player (editHcpMap populated in step 1c, or build now if needed)
      const newHcp = editHcpMap[mat] !== undefined
        ? editHcpMap[mat]
        : (() => {
            try {
              const info = buildHcpJuegoMap_(effCanchaId, effCanchaName, effColor);
              editHcpMap = (info && info.hcpMap) ? info.hcpMap : {};
              return editHcpMap[mat] !== undefined ? editHcpMap[mat] : '';
            } catch(e2) { return ''; }
          })();
      if (newHcp !== '') sh.getRange(nextRow, 3).setValue(newHcp); // C = HCP de juego
      if (canchaId) sh.getRange(nextRow, 4).setValue(canchaId || existingCanchaId); // D = canchaId
      if (colorFinal) sh.getRange(nextRow, 25).setValue(colorFinal); // Y = col 25
      nextRow++;
      changes.added.push(mat);
      addedToStb.push(mat);
    } catch (e) { changes.errors.push('add ' + mat + ': ' + e.message); }
  });
  // Write STB rows for newly added players
  if (stbShEdit && addedToStb.length) {
    try {
      const stbNext = stbShEdit.getLastRow() + 1;
      stbShEdit.getRange(stbNext, 1, addedToStb.length, 2)
        .setValues(addedToStb.map(m => [fecha, m]));
    } catch(e) { changes.errors.push('stb add: ' + e.message); }
  }

  const baseTs = Date.now();
  targetInvitadoNames.forEach((nombre, idx) => {
    if (currentInvitadoNames.indexOf(nombre) >= 0) return;
    try {
      const invMat = 'INV' + baseTs + idx;
      sh.getRange(nextRow, 1).setValue(fecha);
      sh.getRange(nextRow, 2).setValue(invMat);
      sh.getRange(nextRow, 3).setValue(nombre);
      if (canchaId) sh.getRange(nextRow, 4).setValue(canchaId || existingCanchaId); // D = canchaId
      if (colorFinal) sh.getRange(nextRow, 25).setValue(colorFinal);   // Y = col 25
      nextRow++;
      changes.added.push('INV:' + nombre);
    } catch (e) { changes.errors.push('addInv ' + nombre + ': ' + e.message); }
  });

  // Step 4: Update dobles
  const currentDobles = getDoblesForFecha_(fecha);
  const targetDobles = (dobles || []).map(String);
  targetDobles.forEach(function(mat) {
    if (currentDobles.indexOf(mat) >= 0) return;
    try {
      setNGTScoreField_(String(fecha), mat, 6, 1);
      changes.doblesSet.push(mat);
    } catch (e) { changes.errors.push('doble set ' + mat + ': ' + e.message); }
  });
  currentDobles.forEach(function(mat) {
    if (targetDobles.indexOf(mat) >= 0) return;
    try {
      setNGTScoreField_(String(fecha), mat, 6, 0);
      changes.doblesCleared.push(mat);
    } catch (e) { changes.errors.push('doble clear ' + mat + ': ' + e.message); }
  });

  // Update hoyoSalida in FECHA_META if provided
  if (hoyoSalida !== undefined && hoyoSalida !== null) {
    try {
      const propsE = PropertiesService.getDocumentProperties();
      const metaE = JSON.parse(propsE.getProperty('FECHA_META') || '{}');
      if (!metaE[String(fecha)]) metaE[String(fecha)] = {};
      metaE[String(fecha)].hoyoSalida = parseInt(hoyoSalida) || 1;
      propsE.setProperty('FECHA_META', JSON.stringify(metaE));
    } catch(e) {}
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


/* ══════════ ADMIN: GESTIONAR CANCHAS ══════════ */

function getCanchasAdmin_() {
  const canchasMap = getCanchasHistMap_();
  const ratingsMap = getRatingsMap_();
  const result = [];
  Object.keys(canchasMap).sort().forEach(function(id) {
    const c = canchasMap[id];
    const r = ratingsMap[id] || { nombre: '', byColor: {} };
    result.push({ id: c.id, nombre: r.nombre || c.nombre || id, pares: c.pares, indices: c.indices, ratings: r.byColor });
  });
  return result;
}