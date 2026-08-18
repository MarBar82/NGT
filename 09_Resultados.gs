// ════════════ RESULTADOS POR FECHA ════════════

/**
 * Read stableford results for a given fecha from STB sheet
 * STB columns: A=fecha, B=matricula, C..I=breakdown, I=total stableford
 * Returns array sorted descending by STB, with hcp from TARJETAS
 */
function getStablefordForFecha_(fecha) {
  const sh = getSheet_('STB');
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // A=fecha, B=mat, C..I=stb e-k (9 cols)
  const data = sh.getRange(2, 1, lastRow - 1, 9).getValues();
  const jugMap = {};
  getJugadores_().forEach(j => { jugMap[j.matricula] = j; });

  // Get HCP per player from TARJETAS for this fecha
  const hcpMap = {};
  const shT = getSheet_(SHEETS.TARJETAS);
  if (shT) {
    const nextEmpty = findNextEmptyRow_(shT, 1);
    if (nextEmpty > 2) {
      const tData = shT.getRange(2, 1, nextEmpty - 2, 3).getValues(); // A=fecha,B=mat,C=hcp
      tData.forEach(r => {
        const f = String(r[0] || '').trim();
        const m = String(r[1] || '').trim();
        const hcp = r[2];
        if (f === String(fecha) && m) hcpMap[m] = hcp;
      });
    }
  }

  const out = [];
  data.forEach(row => {
    const f = String(row[0] || '').trim();  // A = fecha
    const m = String(row[1] || '').trim();  // B = matricula
    const stb = row[8];                      // I = stableford total
    if (f !== String(fecha) || !m) return;
    if (stb === '' || stb === null || stb === undefined) return;
    const jug = jugMap[m];
    out.push({
      matricula: m,
      nombre: jug ? jug.nombre : m,
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

  // ── TARJETAS A:X (24 cols) — una lectura para cancha + HCP + LD/BA ──────
  // índices: 0=fecha,1=mat,2=hcp,3=canchaId,4..21=holes,22=LD,23=BA
  let cancha = '', canchaId = '';
  const hcpMap = {};
  let ldWinner = null, baWinner = null;
  const shT = getSheet_(SHEETS.TARJETAS);
  if (shT) {
    const nextEmpty = findNextEmptyRow_(shT, 1);
    if (nextEmpty > 2) {
      const tData = shT.getRange(2, 1, nextEmpty - 2, 24).getValues();
      for (let i = 0; i < tData.length; i++) {
        const r = tData[i];
        if (String(r[0] || '').trim() !== fStr) continue;
        const m = String(r[1] || '').trim();
        if (!m) continue;
        if (!canchaId) {
          canchaId = String(r[3] || '').trim();
          cancha = canchaId ? lookupCanchaName_(canchaId) : '';
        }
        hcpMap[m] = r[2];
        if (!ldWinner && (r[22] === 1 || r[22] === true || String(r[22]) === '1')) {
          const jug = jugMap[m];
          ldWinner = { matricula: m, apodo: (jug && jug.apodo) || '', nombre: (jug && jug.nombre) || '' };
        }
        if (!baWinner && (r[23] === 1 || r[23] === true || String(r[23]) === '1')) {
          const jug = jugMap[m];
          baWinner = { matricula: m, apodo: (jug && jug.apodo) || '', nombre: (jug && jug.nombre) || '' };
        }
      }
    }
  }

  // ── NGT DB SCORE — MA, PB, DB, puntos acumulados antes de esta fecha ──────
  const scoreMap = {}; // mat → { ma, pb, db, puntosAntes }
  const fecN = parseInt(fStr);
  getAllNGTScoreData_().forEach(function(r) {
    if (!r.mat) return;
    const rFecN = parseInt(r.fecha);
    if (r.fecha === fStr) {
      if (!scoreMap[r.mat]) scoreMap[r.mat] = { ma: 0, pb: 0, db: 0, puntosAntes: 0 };
      scoreMap[r.mat].ma = r.ma;
      scoreMap[r.mat].pb = r.pb;
      scoreMap[r.mat].db = r.db; // numeric: 0=none, 1=pending, N=actual doble pts
    } else if (rFecN < fecN) {
      if (!scoreMap[r.mat]) scoreMap[r.mat] = { ma: 0, pb: 0, db: 0, puntosAntes: 0 };
      scoreMap[r.mat].puntosAntes += r.st + r.ma + r.pb + (r.db > 1 ? r.db : 0);
    }
  });

  // ── STB A:I (9 cols) — stableford ranking ────────────────────────────────
  const stableford = [];
  const shS = getSheet_('STB');
  if (shS) {
    const lastRow = shS.getLastRow();
    if (lastRow >= 2) {
      const sData = shS.getRange(2, 1, lastRow - 1, 9).getValues();
      sData.forEach(function(row) {
        if (String(row[0] || '').trim() !== fStr) return;
        const m = String(row[1] || '').trim();
        if (!m) return;
        const stb = row[8]; // col I = total
        if (stb === '' || stb === null || stb === undefined) return;
        const jug = jugMap[m];
        const sc  = scoreMap[m] || {};
        stableford.push({
          matricula:   m,
          nombre:      (jug && jug.nombre) || m,
          apodo:       (jug && jug.apodo)  || '',
          stb:         parseFloat(stb) || 0,
          hcp:         hcpMap[m] !== undefined ? hcpMap[m] : '',
          ma:          sc.ma          || 0,
          pb:          sc.pb          || 0,
          db:          sc.db          || false,
          puntosAntes: sc.puntosAntes || 0,
        });
      });
      // Ordenar por STB desc; en caso de empate, por total de fecha desc
      stableford.sort(function(a, b) {
        if (b.stb !== a.stb) return b.stb - a.stb;
        var totA = a.stb + a.ma + a.pb + (a.db > 1 ? a.db : 0);
        var totB = b.stb + b.ma + b.pb + (b.db > 1 ? b.db : 0);
        return totB - totA;
      });
    }
  }

  // ── MATCH B:D (3 cols) — pares de match ──────────────────────────────────
  const matches = [];
  const shM = getSheet_(SHEETS.MATCH);
  if (shM) {
    const nextEmpty = findNextEmptyRow_(shM, 4);
    if (nextEmpty > 2) {
      // B=fecha, C=mat1, D=mat2 — 1 row per match
      const mData = shM.getRange(2, 2, nextEmpty - 2, 3).getValues();
      for (let i = 0; i < mData.length; i++) {
        if (String(mData[i][0] || '').trim() !== fStr) continue;
        const mat1 = String(mData[i][1] || '').trim();
        const mat2 = String(mData[i][2] || '').trim();
        if (!mat1 || !mat2) continue;
        const jug1 = jugMap[mat1] || {};
        const jug2 = jugMap[mat2] || {};
        matches.push({
          rowI:   i + 2,
          j1Name: jug1.nombre || mat1,
          j2Name: jug2.nombre || mat2,
          j1:     mat1,
          j2:     mat2,
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

var _histSS = null;
function getHistSheet_(name) {
  try {
    if (!_histSS) _histSS = SpreadsheetApp.openById(HIST_SHEET_ID);
    return _histSS.getSheetByName(name);
  } catch(e) {
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
  // CANCHAS: A=id, B=hoyo, C=par, D=hcp_idx (no nombre column)
  const data = sh.getRange(2, 1, lr - 1, 4).getValues();
  const map = {};
  data.forEach(r => {
    const id = String(r[0] || '').trim();
    const hoyo = parseInt(r[1]);
    const par = parseInt(r[2]);
    const idx = parseInt(r[3]);
    if (!id || !hoyo || hoyo < 1 || hoyo > 18) return;
    if (!map[id]) {
      map[id] = {
        id: id,
        nombre: '',
        pares: new Array(18).fill(null),
        indices: new Array(18).fill(null),
      };
    }
    if (!isNaN(par)) map[id].pares[hoyo - 1] = par;
    if (!isNaN(idx)) map[id].indices[hoyo - 1] = idx;
  });
  return map;
}


/**
 * Calculate stableford for a single hole (85% rule).
 * Returns 0..5, or null if any input missing.
 */
function calcStablefordHole_(score, par, indice, hcpJuego) {
  if (score === null || score === undefined || score === '' || !par || !indice) return null;
  const s = parseInt(score);
  if (isNaN(s) || s <= 0) return null;
  if (hcpJuego === null || hcpJuego === undefined || hcpJuego === '') return null;
  const hcpEff = Math.round(parseFloat(hcpJuego));
  const extras = Math.floor((hcpEff + 18 - indice) / 18);
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
  let p1=0, p2=0, p3=0, participaciones=0;
  const podios = [];
  data.forEach(r => {
    const m = String(r[1] || '').trim();
    if (m !== matStr) return;
    participaciones++;
    const pos = parseInt(r[3]);
    const anio = r[0];
    if (pos === 1){ p1++; podios.push({anio: anio, pos: 1}); }
    else if (pos === 2){ p2++; podios.push({anio: anio, pos: 2}); }
    else if (pos === 3){ p3++; podios.push({anio: anio, pos: 3}); }
  });
  return { p1: p1, p2: p2, p3: p3, podios: podios, participaciones: participaciones };
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


/**
 * Recalcula ST+MA+PB+DB total (col C, AL:AS) y rankings (col D) para los 18 jugadores en SCORE.
 * Útil para corregir totales que quedaron desincronizados cuando el match del oponente
 * se calculó después de que el jugador ya había cargado su tarjeta.
 * Se puede llamar desde el admin (acción 'recalcularScore') o directamente desde el editor de AS.
 */
// fechaParaPosLb: if provided, writes PosLeaderboard (col H) in NGT DB for that fecha's rows
function recalcularTotalesScore_(params, fechaParaPosLb) {
  if (params && !checkAdmin_(params.adminKey)) return { ok: false, error: 'No autorizado' };

  // Player list from JUGADORES (source of truth — no dependency on app SCORE sheet)
  const jugs = getJugadores_();
  const playerMats  = jugs.map(function(j) { return j.matricula; });
  const playerNames = jugs.map(function(j) { return j.nombre; });
  const numP = playerMats.length;
  if (!numP) return { ok: false, error: 'Sin jugadores en JUGADORES' };

  // Build map: mat → { fechaStr → row } from NGT DB SCORE
  const ngtRows = getAllNGTScoreData_();
  const ngtMap = {};
  ngtRows.forEach(function(r) {
    if (!ngtMap[r.mat]) ngtMap[r.mat] = {};
    ngtMap[r.mat][r.fecha] = r;
  });

  const alMatrix  = [];
  const cVals     = [];
  const stbTotals = new Array(numP).fill(0);
  const maTotals  = new Array(numP).fill(0);
  const pbTotals  = new Array(numP).fill(0);

  for (var i = 0; i < numP; i++) {
    const mat = playerMats[i];
    const playerFdMap = mat ? (ngtMap[mat] || {}) : {};
    var alRow = [], total = 0, stSum = 0, maSum = 0, pbSum = 0;
    for (var n = 1; n <= 8; n++) {
      const fd = playerFdMap[String(n)] || { st: 0, ma: 0, pb: 0, db: 0 };
      const st = fd.st || 0, ma = fd.ma || 0, pb = fd.pb || 0, db = fd.db || 0;
      const al = st + ma + pb + db;
      alRow.push(al);
      total += al; stSum += st; maSum += ma; pbSum += pb;
    }
    alMatrix.push(alRow);
    cVals.push(total);
    stbTotals[i] = stSum; maTotals[i] = maSum; pbTotals[i] = pbSum;
  }

  // Rankings
  var allRanks = cVals.map(function(ci, i) {
    var rank = 1;
    for (var j = 0; j < cVals.length; j++) { if (cVals[j] > ci) rank++; }
    var cntBefore = 0;
    for (var j = 0; j <= i; j++) { if (cVals[j] === ci) cntBefore++; }
    return rank + cntBefore - 1;
  });
  // Write PosLeaderboard (col 8) for the given fecha's rows in NGT DB
  if (fechaParaPosLb) {
    try {
      const ngtSh = getNGTScoreSheet_();
      if (ngtSh) {
        for (var pi = 0; pi < numP; pi++) {
          const mat = playerMats[pi];
          if (!mat) continue;
          const row = findNGTScoreRow_(fechaParaPosLb, mat);
          if (row > 0) ngtSh.getRange(row, 8).setValue(allRanks[pi]);
        }
      }
    } catch(ePosLb) {}
  }

  // Fechas ganadas per player (PosFecha=1 count)
  const ganadoresMap = {};
  playerMats.forEach(function(m) { if (m) ganadoresMap[m] = 0; });
  ngtRows.forEach(function(r) {
    if (r.posFecha === 1 && ganadoresMap[r.mat] !== undefined) ganadoresMap[r.mat]++;
  });

  // Previous fecha for movement arrows (second-to-last by number)
  const allFechasSet = {};
  ngtRows.forEach(function(r) { allFechasSet[r.fecha] = true; });
  const allFechasArr = Object.keys(allFechasSet).sort(function(a, b) { return parseInt(a) - parseInt(b); });
  const prevFecha = allFechasArr.length >= 2 ? allFechasArr[allFechasArr.length - 2] : null;

  // Write LEADERBOARD G–S
  try {
    const lbSh = getSheet_('LEADERBOARD');
    if (lbSh) {
      var gVals=[], hVals=[], iVals=[], jVals=[], kVals=[], lVals=[], mVals=[];
      var nVals=[], oVals=[], pVals=[], qVals=[], rVals=[], sVals=[];
      for (var r2 = 1; r2 <= 18; r2++) {
        var idx2 = allRanks.indexOf(r2);
        if (idx2 >= 0 && playerMats[idx2]) {
          const mat = playerMats[idx2];
          const playerFdMap = ngtMap[mat] || {};

          gVals.push([playerNames[idx2] || '']);
          jVals.push([cVals[idx2]]);
          kVals.push([stbTotals[idx2]]);
          lVals.push([maTotals[idx2]]);
          mVals.push([pbTotals[idx2]]);
          oVals.push([ganadoresMap[mat] || 0]);

          // N: fechas jugadas = count rows with st > 0
          const fJug = Object.keys(playerFdMap).filter(function(f) {
            return (playerFdMap[f].st || 0) > 0;
          }).length;
          nVals.push([fJug || '']);

          // H, I: movement vs previous fecha's PosLeaderboard
          var movDir = '—', movAbs = '';
          const prevRow = prevFecha ? (playerFdMap[prevFecha] || null) : null;
          if (prevRow && prevRow.posLb > 0) {
            const diff = prevRow.posLb - r2;
            if (diff !== 0) { movDir = diff > 0 ? '⬆' : '⬇'; movAbs = Math.abs(diff); }
          }
          hVals.push([movDir]);
          iVals.push([movAbs]);

          pVals.push(['']); // P: not shown — clear
          qVals.push(['']); // Q: posAnt replaced by code — clear

          // R, S: doble from NGT DB
          var dobleInd = '', doblePts = '';
          Object.keys(playerFdMap).forEach(function(f) {
            const fd = playerFdMap[f];
            if (fd.db !== 0) {
              dobleInd = 'SI';
              if (fd.db > 1) doblePts = fd.db;
            }
          });
          rVals.push([dobleInd]);
          sVals.push([doblePts]);
        } else {
          gVals.push(['']); hVals.push(['']); iVals.push(['']); jVals.push([0]);
          kVals.push([0]); lVals.push([0]); mVals.push([0]); nVals.push(['']);
          oVals.push([0]); pVals.push(['']); qVals.push(['']); rVals.push(['']); sVals.push(['']);
        }
      }
      // Batch write cols 2..12 (B..L) — K and L (clear) removed from sheet
      // B=nombre, C=movDir, D=movQty, E=pts, F=stb, G=match, H=bonus,
      // I=fjug, J=fgan, K=doble, L=doblePts
      const lbData = [];
      for (var ri = 0; ri < 18; ri++) {
        lbData.push([
          gVals[ri][0], hVals[ri][0], iVals[ri][0], jVals[ri][0], kVals[ri][0],
          lVals[ri][0], mVals[ri][0], nVals[ri][0], oVals[ri][0],
          rVals[ri][0], sVals[ri][0]
        ]);
      }
      lbSh.getRange(2, 2, 18, 11).setValues(lbData);
    }
  } catch(eLb) {}

  audit_('RECALCULAR_SCORE', (params && params.adminKey) || 'system', { cVals: cVals });
  return { ok: true, totales: cVals };
}

/**
 * Returns the sorted ranking for a fecha: [{mat, posFecha, total}, ...]
 * Uses tiebreakers: total STB → last 9 holes → last 6 → last 3 → head-to-head match wins.
 */
function getRankingFecha_(fechaRows, allMatchRows, fStr) {
  if (!fechaRows.length) return [];

  const canchaId   = String(fechaRows[0][3] || '').trim();
  const canchaName = canchaId ? lookupCanchaName_(canchaId) : '';
  const cd = getCanchaPares_(canchaId || canchaName);
  if (!cd || !cd.pares || !cd.indices || cd.pares.length < 18) return [];

  const fechaMeta  = getFechaMeta_(fStr);
  const hoyoSalida = (fechaMeta && fechaMeta.hoyoSalida) ? parseInt(fechaMeta.hoyoSalida) : 1;
  const holeOrder  = [];
  if (hoyoSalida === 10) {
    for (var ho = 9; ho < 18; ho++) holeOrder.push(ho);
    for (var ho = 0; ho < 9;  ho++) holeOrder.push(ho);
  } else {
    for (var ho = 0; ho < 18; ho++) holeOrder.push(ho);
  }
  const last9idx = holeOrder.slice(9);
  const last6idx = holeOrder.slice(12);
  const last3idx = holeOrder.slice(15);

  // Head-to-head from full match history
  const h2h = {};
  allMatchRows.forEach(function(r) {
    const m1   = String(r[1] || '').trim();
    const m2   = String(r[2] || '').trim();
    const pts1 = Number(r[4]) || 0;
    const pts2 = Number(r[6]) || 0;
    if (!m1 || !m2 || (!pts1 && !pts2)) return;
    const key = m1 < m2 ? m1 + '|' + m2 : m2 + '|' + m1;
    if (!h2h[key]) h2h[key] = {};
    if (!h2h[key][m1]) h2h[key][m1] = 0;
    if (!h2h[key][m2]) h2h[key][m2] = 0;
    if (pts1 > pts2) h2h[key][m1]++;
    else if (pts2 > pts1) h2h[key][m2]++;
  });

  const playerScores = [];
  fechaRows.forEach(function(r) {
    const mat = String(r[1] || '').trim();
    if (!mat || mat.indexOf('INV') === 0) return;
    const hcp = parseFloat(r[2]);
    if (isNaN(hcp)) return;
    const scores18 = r.slice(4, 22);
    if (!scores18.some(function(s) { return s !== '' && s !== null && s !== undefined; })) return;

    var stbByHole = new Array(18).fill(0);
    var total = 0;
    for (var h = 0; h < 18; h++) {
      const sc = (scores18[h] !== '' && scores18[h] !== null && scores18[h] !== undefined)
        ? parseInt(scores18[h]) : null;
      if (sc === null || isNaN(sc)) continue;
      const pts = calcStablefordHole_(sc, cd.pares[h] || null, cd.indices[h] || null, hcp);
      stbByHole[h] = (pts !== null ? pts : 0);
      total += stbByHole[h];
    }
    playerScores.push({ mat: mat, total: total, stbByHole: stbByHole });
  });

  if (!playerScores.length) return [];

  playerScores.sort(function(a, b) {
    if (b.total !== a.total) return b.total - a.total;
    function sumH(ps, idx) { return idx.reduce(function(s, h) { return s + ps.stbByHole[h]; }, 0); }
    var d9 = sumH(b, last9idx) - sumH(a, last9idx); if (d9) return d9;
    var d6 = sumH(b, last6idx) - sumH(a, last6idx); if (d6) return d6;
    var d3 = sumH(b, last3idx) - sumH(a, last3idx); if (d3) return d3;
    const key = a.mat < b.mat ? a.mat + '|' + b.mat : b.mat + '|' + a.mat;
    const rec = h2h[key];
    if (rec) {
      const dH2H = (rec[b.mat] || 0) - (rec[a.mat] || 0);
      if (dH2H) return dH2H;
    }
    return 0; // empate no resuelto → sorteo manual
  });

  return playerScores.map(function(ps, idx) {
    return { mat: ps.mat, posFecha: idx + 1, total: ps.total };
  });
}

/**
 * Shared helper: given TARJETAS rows for ONE fecha and h2h match data,
 * returns the winning matricula (or null if no scorecards).
 */
function getGanadorFecha_(fechaRows, allMatchRows, fStr) {
  const ranking = getRankingFecha_(fechaRows, allMatchRows, fStr);
  return ranking.length > 0 ? ranking[0].mat : null;
}

/**
 * Called after setBonusWinners_ finalizes a fecha.
 * Computes the full ranking for that fecha and writes PosFecha (col G = 7) to NGT DB SCORE
 * for every player. PosFecha=1 is the winner; this replaces the old SCORE!AK increment.
 */
function sumarGanadorFecha_(fecha) {
  const fStr = String(fecha);

  const tarjSh = getSheet_(SHEETS.TARJETAS);
  if (!tarjSh) return;
  const tarjLast = findNextEmptyRow_(tarjSh, 2);
  if (tarjLast <= 2) return;
  const allTarj = tarjSh.getRange(2, 2, tarjLast - 2, 24).getValues();
  const fechaRows = allTarj.filter(function(r) { return String(r[0] || '').trim() === fStr; });

  const matchSh = getSheet_(SHEETS.MATCH);
  const allMatchRows = [];
  if (matchSh) {
    const ml = findNextEmptyRow_(matchSh, 4);
    if (ml > 2) allMatchRows.push.apply(allMatchRows, matchSh.getRange(2, 2, ml - 2, 7).getValues());
  }

  const ranking = getRankingFecha_(fechaRows, allMatchRows, fStr);
  if (!ranking.length) return;

  // Write PosFecha (col 7) for each player in NGT DB SCORE
  const ngtSh = getNGTScoreSheet_();
  if (ngtSh) {
    ranking.forEach(function(entry) {
      const row = findNGTScoreRow_(fStr, entry.mat);
      if (row > 0) ngtSh.getRange(row, 7).setValue(entry.posFecha);
    });
  }

  audit_('SUMAR_GANADOR_FECHA', 'system', { fecha: fStr, winner: ranking[0].mat, ranking: ranking.map(function(r) { return r.mat; }) });
}

/**
 * Full recalculation: reads ALL fechas, recomputes PosFecha rankings from scratch,
 * writes them to NGT DB SCORE col G, then recalculates totals + LEADERBOARD (including col O).
 * Use this to correct PosFecha if something went wrong.
 */
function calcularGanadoresFechas_(params) {
  if (params && !checkAdmin_(params.adminKey)) return { ok: false, error: 'No autorizado' };

  const tarjSh = getSheet_(SHEETS.TARJETAS);
  if (!tarjSh) return { ok: false, error: 'Sin TARJETAS' };
  const tarjLast = findNextEmptyRow_(tarjSh, 2);
  if (tarjLast <= 2) return { ok: false, error: 'Sin tarjetas' };
  const allTarj = tarjSh.getRange(2, 2, tarjLast - 2, 24).getValues();

  const matchSh = getSheet_(SHEETS.MATCH);
  const allMatchRows = [];
  if (matchSh) {
    const ml = findNextEmptyRow_(matchSh, 4);
    if (ml > 2) allMatchRows.push.apply(allMatchRows, matchSh.getRange(2, 2, ml - 2, 7).getValues());
  }

  const fechaSet = {};
  allTarj.forEach(function(r) { const f = String(r[0]||'').trim(); if (f) fechaSet[f] = true; });

  const ngtSh = getNGTScoreSheet_();
  const details = {};

  Object.keys(fechaSet).forEach(function(fStr) {
    const fechaRows = allTarj.filter(function(r) { return String(r[0]||'').trim() === fStr; });
    const ranking = getRankingFecha_(fechaRows, allMatchRows, fStr);
    if (!ranking.length) return;
    details[fStr] = ranking[0].mat;
    if (ngtSh) {
      ranking.forEach(function(entry) {
        const row = findNGTScoreRow_(fStr, entry.mat);
        if (row > 0) ngtSh.getRange(row, 7).setValue(entry.posFecha);
      });
    }
  });

  // Recalculate totals + LEADERBOARD (O = fechas ganadas from PosFecha)
  recalcularTotalesScore_(null);
  SpreadsheetApp.flush();

  audit_('CALCULAR_GANADORES_FECHAS', (params && params.adminKey) || 'system', { details: details });
  return { ok: true, details: details };
}

function test() {
  Logger.log('=== DEBUG MATCH ===');
  Logger.log(JSON.stringify(debugMatch_(), null, 2));
  Logger.log('=== CANCHAS ===');
  Logger.log(JSON.stringify(getCanchas_(), null, 2));
  Logger.log('=== FECHAS ACTIVAS ===');
  Logger.log(JSON.stringify(getFechasActivas_()));
}

// Wrapper: recalculate fecha winners and write PosFecha + full LEADERBOARD
function runCalcularGanadoresFechas() {
  const result = calcularGanadoresFechas_(null);
  Logger.log(JSON.stringify(result));
}

// Wrapper: recalculate totals and update LEADERBOARD (standalone, no auth required)
function runRecalcularTotalesScore() {
  const result = recalcularTotalesScore_(null);
  Logger.log(JSON.stringify(result));
}

// Wrapper: run from Apps Script dropdown to diagnose MATCH sheet format
function runDebugMigrarMatch() {
  debugMigrarMatch_();
}

// Wrapper: run from Apps Script dropdown to execute the one-time MATCH migration
function runMigrarMatchA1Fila() {
  const result = migrarMatchA1Fila_();
  Logger.log(JSON.stringify(result));
}