// ════════════ WRITES ════════════
function crearFecha_(params) {
  const { adminKey, fecha, canchaId, jugadores, dobles, invitados, colorTee,
          horario, greenFee, lineas, hoyoSalida, bonusHoyos } = params;
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
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty > 2) {
    const data = sh.getRange(2, 1, nextEmpty - 2, 2).getValues();
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
    const jugNombreMap = {};
    getJugadores_().forEach(function(j) { jugNombreMap[String(j.matricula)] = j.nombre || ''; });
    const startJug = nextRow;
    sh.getRange(startJug, 1, newJugMats.length, 2)
      .setValues(newJugMats.map(m => [fecha, m]));                     // A-B (fecha, mat)
    sh.getRange(startJug, 3, newJugMats.length, 1)
      .setValues(newJugMats.map(m => [hcpMap[m] !== undefined ? hcpMap[m] : ''])); // C (HCP de juego)
    sh.getRange(startJug, 4, newJugMats.length, 1)
      .setValues(newJugMats.map(() => [canchaId]));                    // D (canchaId)
    sh.getRange(startJug, 25, newJugMats.length, 1)
      .setValues(newJugMats.map(() => [colorFinal]));                  // Y (color tee)
    nextRow += newJugMats.length;

    // STB: write A=fecha, B=mat for each new player (no formulas, app-owned)
    const stbShCr = getSheet_('STB');
    if (stbShCr) {
      const stbNext = stbShCr.getLastRow() + 1;
      stbShCr.getRange(stbNext, 1, newJugMats.length, 2)
        .setValues(newJugMats.map(m => [fecha, m]));
    }

    // SCORE (NGT DB): pre-crear filas con ceros para cada jugador nuevo.
    // Elimina la condición de carrera en setNGTScoreField_: cuando 4 jugadores
    // firman al mismo tiempo, su fila ya existe y no hay dos hilos compitiendo
    // por "próxima fila vacía" en la misma hoja.
    const ngtScoreSh = getNGTScoreSheet_();
    if (ngtScoreSh) {
      const scoreNext = ngtScoreSh.getLastRow() + 1;
      ngtScoreSh.getRange(scoreNext, 1, newJugMats.length, 8)
        .setValues(newJugMats.map(function(m) { return [String(fecha), m, 0, 0, 0, 0, 0, 0]; }));
    }
  }

  // ── Invitados: batch write (A-B-C together, then E-F and AA) ───────────────
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
      sh.getRange(startInv, 1, newInvRows.length, 2)
        .setValues(newInvRows.map(r => [fecha, r.mat]));            // A-B (fecha, mat)
      sh.getRange(startInv, 4, newInvRows.length, 1)
        .setValues(newInvRows.map(() => [canchaId]));               // D (canchaId)
      sh.getRange(startInv, 25, newInvRows.length, 1)
        .setValues(newInvRows.map(() => [colorFinal]));             // Y
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
    dobles:     dobles   || [],
    colorTee:   colorTee || 'BLANCAS',
    horario:    horario  || '',
    greenFee:   greenFee || '',
    lineas:     Array.isArray(lineas) ? lineas : [],
    hoyoSalida: parseInt(hoyoSalida) || 1,
    bonusHoyos: (bonusHoyos && typeof bonusHoyos === 'object') ? bonusHoyos : {},
  };
  props.setProperty('FECHA_META', JSON.stringify(meta));

  // Invalidar caches que dependen de fechas/jugadores
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('fechaRes_' + String(fecha));
    cache.remove('fechas');
    cache.remove('fechasConEstado');
    // Nota: getFechaActiva_ no está en cache, pero su resultado se cachea
    // en sessionStorage del frontend, que debe limpiarse allí
  } catch(e) {}

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
  const last = findNextEmptyRow_(sh, 1);
  if (last <= 2) return { ok: true, data: [] };
  // A=fecha(0), B=mat(1), C=hcp(2), D=canchaId(3), E..V=scores(4..21), W=ld(22), X=ba(23)
  const data = sh.getRange(2, 1, last - 2, 24).getValues();
  const jugMapDet = {}; getJugadores_().forEach(function(j){ jugMapDet[String(j.matricula).trim()] = j; });
  const result = [];
  data.forEach(function(r) {
    if (String(r[0]).trim() !== fStr) return;
    const mat = String(r[1]).trim();
    const jug = jugMapDet[mat] || {};
    const cId = String(r[3]).trim();
    result.push({
      matricula: mat,
      nombre:    jug.nombre || mat,
      hcp:       (r[2] === '' || r[2] === null || r[2] === undefined) ? null : r[2],
      canchaId:  cId,
      cancha:    lookupCanchaName_(cId) || cId,
      scores:    r.slice(4, 22).map(function(v){ return (v === '' || v === null || v === undefined) ? null : Number(v); }),
      ld:        (r[22] === 1 || r[22] === true || String(r[22]) === '1') ? 1 : 0,
      ba:        (r[23] === 1 || r[23] === true || String(r[23]) === '1') ? 1 : 0,
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

  const allRows = sh.getRange(2, 1, last - 1, 24).getValues();
  const pbMap = {}; // mat → pbPoints

  // Actualizar col W (LD) y X (BA) para cada fila de esta fecha
  for (let i = 0; i < allRows.length; i++) {
    if (String(allRows[i][0]).trim() !== fStr) continue;
    const mat = String(allRows[i][1]).trim();
    if (!mat) continue;
    const newLD = (ldStr && mat === ldStr) ? 1 : '';
    const newBA = (baStr && mat === baStr) ? 1 : '';
    sh.getRange(i + 2, 23).setValue(newLD); // col W
    sh.getRange(i + 2, 24).setValue(newBA); // col X
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

  // Actualizar NGT DB SCORE!Bonus
  Object.keys(pbMap).forEach(function(mat) {
    setNGTScoreField_(fStr, mat, 5, pbMap[mat]);
  });

  // Escribir PosFecha (G) en NGT DB para todos los jugadores de esta fecha
  sumarGanadorFecha_(fecha);

  // Recomputar totales + PosLeaderboard para esta fecha + LEADERBOARD (G,J,K,L,M,O)
  recalcularTotalesScore_(null, fStr);

  SpreadsheetApp.flush();
  audit_('SET_BONUS_WINNERS', 'admin', { fecha, ldMat, baMat });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  return { ok: true };
}

function cargarTarjeta_(params) {
  const { matricula, adminKey, token, fecha, hcp, scores, ld, ba, usarDoble } = params;
  let isAdmin = adminKey && checkAdmin_(adminKey);
  if (!isAdmin) {
    const player = checkPlayerByMat_(matricula);
    if (!player) return { ok: false, error: 'Matrícula no encontrada' };

    // Quien firma tiene que estar realmente logueado, y pertenecer a la misma
    // línea que el jugador de la tarjeta que está firmando (compañero de línea
    // cargando por otro, o el propio jugador firmando la suya).
    const sess = validarSesion_(String(token || '').trim());
    if (!sess) return { ok: false, error: 'Sesión inválida — volvé a iniciar sesión' };
    const metaAuth = getFechaMeta_(String(fecha));
    const mismaLinea = metaAuth && metaAuth.lineas && metaAuth.lineas.some(function(l){
      const mats = l.map(String);
      return mats.indexOf(String(matricula)) >= 0 && mats.indexOf(String(sess.mat)) >= 0;
    });
    if (!mismaLinea) return { ok: false, error: 'No autorizado para firmar esta tarjeta' };
  }

  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };

  let wantsLD = (ld === 1 || ld === true || ld === '1');
  let wantsBA = (ba === 1 || ba === true || ba === '1');
  const clearsLD = (ld === 0 || ld === false || ld === '0');
  const clearsBA = (ba === 0 || ba === false || ba === '0');

  // Fuente de verdad del servidor: si bonusEstado registra a este jugador como ganador
  // de LD o BA, lo forzamos a true independientemente de lo que mandó el cliente.
  // Cubre la race condition donde el cliente firma antes de que el poll le entregue
  // el bonusEstado actualizado (ej: ganó LD en el hoyo 15, firmó tarjeta en el 18).
  try {
    const _bonusEst = (getFechaMeta_(String(fecha)).bonusEstado) || {};
    const _mStr = String(matricula).trim();
    if (!wantsLD && _bonusEst.ld && String(_bonusEst.ld.matricula || '').trim() === _mStr) wantsLD = true;
    if (!wantsBA && _bonusEst.ba && String(_bonusEst.ba.matricula || '').trim() === _mStr) wantsBA = true;
  } catch(_be) {}

  // Single read of A..Z covers everything we need: validation, row lookup, and old values
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return { ok: false, error: 'No hay tarjetas' };
  const allRows = sh.getRange(2, 1, nextEmpty - 2, 26).getValues();
  // cols (0-indexed from A): 0=fecha, 1=matricula, 2=nombre, 3=hcp,
  //   4=cancha, 5=id, 6..23=H1..H18, 24=LD, 25=BA

  // LD/BA uniqueness validation in same pass (avoid second sheet read)
  if (!isAdmin && (wantsLD || wantsBA)) {
    let jugMap = null;
    for (let i = 0; i < allRows.length; i++) {
      const f = String(allRows[i][0] || '').trim();
      const m = String(allRows[i][1] || '').trim();
      if (f !== String(fecha) || m === String(matricula)) continue;
      const otherLD = allRows[i][22];
      const otherBA = allRows[i][23];
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

  // Build a 1×22 row covering C..X (cols 3..24): hcp, canchaId, H1..H18, LD, BA.
  // Preserve existing values for cols we shouldn't touch.
  // existingRow indices: 2=hcp, 3=canchaId, 4..21=H1..H18, 22=LD, 23=BA
  const newRow = new Array(22);
  newRow[0] = (hcp !== undefined && hcp !== null && hcp !== '') ? hcp : (existingRow[2] !== undefined ? existingRow[2] : '');
  newRow[1] = existingRow[3] !== undefined ? existingRow[3] : '';      // canchaId (preserve)
  for (let h = 0; h < 18; h++) {
    if (Array.isArray(scores) && scores.length === 18 && scores[h] !== undefined && scores[h] !== null && scores[h] !== '') {
      newRow[2 + h] = scores[h];
    } else {
      newRow[2 + h] = existingRow[4 + h] !== undefined ? existingRow[4 + h] : '';
    }
  }
  // LD (col 20 in newRow = col W in sheet)
  if (wantsLD) newRow[20] = 1;
  else if (clearsLD) newRow[20] = '';
  else newRow[20] = existingRow[22] !== undefined ? existingRow[22] : '';
  // BA (col 21 in newRow = col X in sheet)
  if (wantsBA) newRow[21] = 1;
  else if (clearsBA) newRow[21] = '';
  else newRow[21] = existingRow[23] !== undefined ? existingRow[23] : '';

  // ── Compute AB-AE as static values (replaces sheet formulas, avoids recalc cost) ──
  // newRow: [0]=hcp, [1]=canchaId, [2]=H1, [3]=H2, ..., [19]=H18, [20]=LD, [21]=BA
  // AB = IDA (sum H1-H9 = newRow[2..10])
  // AC = VUELTA (sum H10-H18 = newRow[11..19])
  // AD = GROSS = AB + AC
  // AE = NETO  = AD - HCP (newRow[0])
  let idaSum = 0, idaCount = 0;
  for (let i = 2; i <= 10; i++) {
    const v = parseFloat(newRow[i]);
    if (!isNaN(v) && newRow[i] !== '') { idaSum += v; idaCount++; }
  }
  let vtaSum = 0, vtaCount = 0;
  for (let i = 11; i <= 19; i++) {
    const v = parseFloat(newRow[i]);
    if (!isNaN(v) && newRow[i] !== '') { vtaSum += v; vtaCount++; }
  }
  const calcIda    = idaCount  > 0 ? idaSum           : '';
  const calcVuelta = vtaCount  > 0 ? vtaSum           : '';
  const calcGross  = (idaCount > 0 || vtaCount > 0)   ? (idaSum + vtaSum) : '';
  const hcpNum     = parseFloat(newRow[0]);
  const calcNeto   = (calcGross !== '' && !isNaN(hcpNum)) ? calcGross - hcpNum : '';
  // IDA/VUELTA/GROSS/NETO columns removed from TARJETAS — computed values kept in JS only

  // ── Pre-lock: reads + pure computation ─────────────────────────────────
  // Everything that doesn't WRITE to a sheet runs here, outside the lock,
  // so the lock is held only while committing writes. This keeps lock hold
  // time short enough for ~18 simultaneous submissions.
  const fStr = String(fecha);
  const mStr = String(matricula);

  // Cancha data (cached — fast after first fetch)
  const canchaId   = existingRow[3];
  const cd         = canchaId
    ? cachedRead_('cp2_' + String(canchaId), 300, function(){ return getCanchaPares_(canchaId); })
    : null;
  const cpPares    = (cd && cd.pares)   || [];
  const cpIndices  = (cd && cd.indices) || [];
  const myScores18 = newRow.slice(2, 20); // H1..H18 — newRow[2]=H1, [19]=H18

  // Stableford breakdown (pure computation, no I/O)
  const stbBreak = calcStbBreakdown_(myScores18, cpPares, cpIndices, hcpNum);


  // STB row lookup (read A:B once)
  let preStbRow = -1;
  const preStbSh = getSheet_('STB');
  if (stbBreak && preStbSh) {
    const stbLast = preStbSh.getLastRow();
    if (stbLast >= 2) {
      const stbAB = preStbSh.getRange(2, 1, stbLast - 1, 2).getValues();
      for (let i = 0; i < stbAB.length; i++) {
        if (String(stbAB[i][0]).trim() === fStr && String(stbAB[i][1]).trim() === mStr) {
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
    const matchLast = findNextEmptyRow_(preMatchSh, 4);
    if (matchLast > 2) {
      // B=fecha, C=mat1, D=mat2, E=res1, F=pts1, G=res2, H=pts2
      preMatchBCY = preMatchSh.getRange(2, 2, matchLast - 2, 7).getValues();

      for (let mi = 0; mi < preMatchBCY.length; mi++) {
        if (String(preMatchBCY[mi][0] || '').trim() !== fStr) continue;
        const mat1 = String(preMatchBCY[mi][1] || '').trim();
        const mat2 = String(preMatchBCY[mi][2] || '').trim();
        const isMat1 = (mat1 === mStr);
        const isMat2 = (mat2 === mStr);
        if (!isMat1 && !isMat2) continue;

        const mySheetRow = mi + 2;
        const oppMat = isMat1 ? mat2 : mat1;
        if (!oppMat) continue;

        let oppTarjeta = null;
        for (let ai = 0; ai < allRows.length; ai++) {
          if (String(allRows[ai][0]).trim() === fStr && String(allRows[ai][1]).trim() === oppMat) {
            oppTarjeta = allRows[ai]; break;
          }
        }
        if (!oppTarjeta) continue;

        const oppScores18  = oppTarjeta.slice(4, 22);
        const oppHasScores = oppScores18.some(function(s){ return s !== '' && s !== null && s !== undefined; });
        if (!oppHasScores) continue;

        const oppHcpNum = parseFloat(oppTarjeta[2]);
        if (isNaN(oppHcpNum)) continue;
        const oppHcp85 = Math.round(oppHcpNum * 0.85);

        const ayMy  = Math.max(0, hcp85val - oppHcp85);
        const ayOpp = Math.max(0, oppHcp85 - hcp85val);
        const bcMy  = Math.max(0, ayMy  - 18);
        const bcOpp = Math.max(0, ayOpp - 18);

        const myNet = new Array(18), oppNet = new Array(18);
        for (let h = 0; h < 18; h++) {
          const idx = cpIndices[h] || 0;
          const adjMy  = (ayMy  > 0 && ayMy  >= idx ? -1 : 0) + (bcMy  > 0 && idx <= bcMy  ? -1 : 0);
          const adjOpp = (ayOpp > 0 && ayOpp >= idx ? -1 : 0) + (bcOpp > 0 && idx <= bcOpp ? -1 : 0);
          const myG  = myScores18[h]  !== '' && myScores18[h]  !== null ? parseInt(myScores18[h])  : null;
          const oppG = oppScores18[h] !== '' && oppScores18[h] !== null ? parseInt(oppScores18[h]) : null;
          myNet[h]  = (myG  !== null && !isNaN(myG))  ? myG  + adjMy  : '';
          oppNet[h] = (oppG !== null && !isNaN(oppG)) ? oppG + adjOpp : '';
        }

        const matchCalc = calcularResultadoMatch_(myNet, oppNet);
        const myX  = matchCalc.resA;
        const oppX = matchCalc.resB;
        const myY  = matchCalc.mPtsA;
        const oppY = matchCalc.mPtsB;

        // Write [res1, pts1, res2, pts2] to cols E..H of the single match row
        const writeData = isMat1 ? [[myX, myY, oppX, oppY]] : [[oppX, oppY, myX, myY]];
        rowYOverride[mySheetRow] = { mat1: mat1, pts1: isMat1 ? myY : oppY, mat2: mat2, pts2: isMat1 ? oppY : myY };
        affectedMats[mStr]   = true;
        affectedMats[oppMat] = true;

        matchWriteOps.push({ sh: preMatchSh, row: mySheetRow, col: 5, data: writeData });
      }
    }
  }

  // SCORE!MA per affected player — sum pts from their match rows
  const maWriteOps = []; // [{totalMA, mat}]
  const affectedMatsList = Object.keys(affectedMats);
  if (affectedMatsList.length > 0 && preMatchBCY) {
    for (let ai = 0; ai < affectedMatsList.length; ai++) {
      const mat = affectedMatsList[ai];
      let totalMA = 0;
      for (let mi2 = 0; mi2 < preMatchBCY.length; mi2++) {
        if (String(preMatchBCY[mi2][0] || '').trim() !== fStr) continue;
        const m1 = String(preMatchBCY[mi2][1] || '').trim();
        const m2 = String(preMatchBCY[mi2][2] || '').trim();
        if (mat !== m1 && mat !== m2) continue;
        const shRow = mi2 + 2;
        if (rowYOverride[shRow]) {
          totalMA += mat === rowYOverride[shRow].mat1 ? rowYOverride[shRow].pts1 : rowYOverride[shRow].pts2;
        } else {
          // col F (idx 4) = pts1, col H (idx 6) = pts2
          totalMA += mat === m1 ? (Number(preMatchBCY[mi2][4]) || 0) : (Number(preMatchBCY[mi2][6]) || 0);
        }
      }
      maWriteOps.push({ totalMA: totalMA, mat: mat });
    }
  }

  // PB row lookup
  const ldVal_    = (newRow[20] === 1 || newRow[20] === true) ? 1 : 0;
  const baVal_    = (newRow[21] === 1 || newRow[21] === true) ? 1 : 0;
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
  // Per-player CacheService mutex (same key as cargarHoyoLive_: plk_{fecha}_{mat}).
  // Prevents cargarHoyoLive_ and cargarTarjeta_ from writing TARJETAS simultaneously
  // for the same player, without re-introducing the global LockService contention
  // that was removed in Tarea 14 (which would serialize all lines again).
  //
  // TTL = 30 s (vs 8 s for cargarHoyoLive_): cargarTarjeta_ does ~6-8 sheet writes
  // across TARJETAS/STB/MATCH/SCORE/PB and can realistically take 5-15 s.
  // 8 s was enough for cargarHoyoLive_'s single-cell write; 30 s gives a safe margin.
  const cache2  = CacheService.getScriptCache();
  const lockKey = 'plk_' + fStr + '_' + mStr;
  const lockId  = String(Date.now()) + '_' + Math.floor(Math.random() * 1e9);
  let lockAcquired = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!cache2.get(lockKey)) {
      cache2.put(lockKey, lockId, 30);
      Utilities.sleep(30);
      if (cache2.get(lockKey) === lockId) { lockAcquired = true; break; }
    }
    Utilities.sleep(300);
  }
  if (!lockAcquired) return { ok: false, error: 'Servidor muy ocupado, esperá unos segundos e intentá de nuevo' };

  let dobleMsg = null;
  try {
    // 1. TARJETAS — write C..X (22 cols): HCP, canchaId, H1-H18, LD, BA
    sh.getRange(rowIdx, 3, 1, 22).setValues([newRow]);

    try {
      // 2. STB C:I
      let myStWritten = null;
      if (stbBreak && preStbRow > 0 && preStbSh) {
        preStbSh.getRange(preStbRow, 3, 1, 7).setValues([[
          stbBreak.e, stbBreak.f, stbBreak.g, stbBreak.h,
          stbBreak.i, stbBreak.j, stbBreak.k
        ]]);
      }

      // 3. SCORE ST → NGT DB
      if (stbBreak) {
        setNGTScoreField_(fStr, mStr, 3, stbBreak.k);
        myStWritten = stbBreak.k;
      }

      // 4. MATCH batch writes (pre-computed above)
      for (let wi = 0; wi < matchWriteOps.length; wi++) {
        const op = matchWriteOps[wi];
        op.sh.getRange(op.row, op.col, 1, op.data[0].length).setValues(op.data);
      }

      // 5. SCORE MA → NGT DB
      let myMaWritten = null;
      for (let mi3 = 0; mi3 < maWriteOps.length; mi3++) {
        const mop = maWriteOps[mi3];
        setNGTScoreField_(fStr, mop.mat, 4, mop.totalMA);
        if (mop.mat === mStr) myMaWritten = mop.totalMA;
      }

      // 6. PB!E + SCORE Bonus → NGT DB
      try {
        const myPbWritten = pbPoints_;
        if (prePbRow > 0 && prePbSh) prePbSh.getRange(prePbRow, 5).setValue(myPbWritten);
        setNGTScoreField_(fStr, mStr, 5, myPbWritten);
      } catch (pbErr) { /* Non-fatal */ }
    } catch (stbErr) { /* Non-fatal — STB/SCORE/MATCH failure doesn't block tarjeta write */ }

    // 9. Puntos dobles
    if (currentDobles_.indexOf(String(matricula)) >= 0 && stbBreak) {
      // Write actual ST value to NGT DB Doble column (replaces placeholder 1)
      setNGTScoreField_(fStr, mStr, 6, stbBreak.k);
      dobleMsg = 'doble aplicado: ST=' + stbBreak.k;
    }
  } finally {
    try { cache2.remove(lockKey); } catch(e) {}
  }

  // Recalculate totals (AL:AS, C, D, LEADERBOARD) from NGT DB now that all writes are done.
  recalcularTotalesScore_(null);

  // Si todos los jugadores no-INV de esta fecha ya cargaron su tarjeta (Hoyo1 ≠ vacío),
  // calcular PosFecha y PosLeaderboard. Es seguro llamarlo múltiples veces: ambas
  // funciones recalculan desde cero sin acumular.
  try {
    const neCheck = findNextEmptyRow_(sh, 1);
    if (neCheck > 2) {
      const checkData = sh.getRange(2, 1, neCheck - 2, 5).getValues();
      const jugFecha  = checkData.filter(function(r) {
        const rf = String(r[0] || '').trim();
        const rm = String(r[1] || '').trim();
        return rf === fStr && rm && rm.indexOf('INV') !== 0;
      });
      if (jugFecha.length > 0 && jugFecha.every(function(r) {
        return r[4] !== '' && r[4] !== null && r[4] !== undefined && r[4] !== false;
      })) {
        sumarGanadorFecha_(fStr);
        recalcularMAFecha_(fStr);
        recalcularTotalesScore_(null, fStr);
      }
    }
  } catch(ePos) {}

  SpreadsheetApp.flush();

  audit_('CARGAR_TARJETA', isAdmin ? 'admin' : matricula, { fecha, matricula, hcp, scores, ld, ba, usarDoble, dobleMsg });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  return { ok: true, dobleMsg: dobleMsg };
}

/**
 * Final authoritative recalc of Match points (col 4 in SCORE) for all players of a fecha.
 * Called after all tarjetas for the fecha are signed — at that point MATCH sheet is complete.
 */
function recalcularMAFecha_(fecha) {
  const fStr = String(fecha);
  const matchSh = getSheet_(SHEETS.MATCH);
  if (!matchSh) return;
  const ml = findNextEmptyRow_(matchSh, 4);
  if (ml <= 2) return;
  const allMatchRows = matchSh.getRange(2, 2, ml - 2, 7).getValues();
  const totals = {};
  allMatchRows.forEach(function(r) {
    if (String(r[0] || '').trim() !== fStr) return;
    const mat1 = String(r[1] || '').trim();
    const mat2 = String(r[2] || '').trim();
    const pts1 = parseFloat(r[4]) || 0;
    const pts2 = parseFloat(r[6]) || 0;
    if (mat1) totals[mat1] = (totals[mat1] || 0) + pts1;
    if (mat2) totals[mat2] = (totals[mat2] || 0) + pts2;
  });
  Object.keys(totals).forEach(function(mat) {
    setNGTScoreField_(fStr, mat, 4, totals[mat]);
  });
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
    const last = findNextEmptyRow_(tarjSh, 1); // col A = fecha (not col B = mat)
    if (last > 2) {
      const ac = tarjSh.getRange(2, 1, last - 2, 1).getValues(); // col A = fecha
      ac.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          tarjSh.getRange(i + 2, 5, 1, 27).clearContent();
          changes.tarjetas++;
        }
      });
    }
  }

  // ── 2. STB — limpiar C:I ──────────────────────────────────────────────
  const stbSh = getSheet_('STB');
  if (stbSh) {
    const last = stbSh.getLastRow();
    if (last >= 2) {
      const aCol = stbSh.getRange(2, 1, last - 1, 1).getValues(); // col A = fecha
      aCol.forEach(function(r, i) {
        if (String(r[0]).trim() === fStr) {
          stbSh.getRange(i + 2, 3, 1, 7).clearContent();
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

  // ── 5. SCORE + LEADERBOARD — borrar filas NGT DB para esta fecha y recalcular ──
  const ngtScoreSh = getNGTScoreSheet_();
  if (ngtScoreSh) {
    const last = ngtScoreSh.getLastRow();
    if (last >= 2) {
      const ab = ngtScoreSh.getRange(2, 1, last - 1, 2).getValues();
      for (let i = ab.length - 1; i >= 0; i--) {
        if (String(ab[i][0] || '').trim() === fStr) ngtScoreSh.deleteRow(i + 2);
      }
    }
  }
  recalcularTotalesScore_(null);
  changes.score = 18;

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
  changes.stb = deleteRowsForFecha(getSheet_('STB'), 1); // col A = fecha

  // ── 2. PB — eliminar filas ───────────────────────────────────────────────
  changes.pb = deleteRowsForFecha(getSheet_('PB'), 2); // col B = fecha

  // ── 3. TARJETAS — capturar matrículas ANTES de borrar (para limpiar su caché de fila) ──
  const tarjSh_ = getSheet_(SHEETS.TARJETAS);
  let matriculasDeLaFecha_ = [];
  if (tarjSh_) {
    const lastT_ = tarjSh_.getLastRow();
    if (lastT_ >= 2) {
      const abT_ = tarjSh_.getRange(2, 1, lastT_ - 1, 2).getValues();
      matriculasDeLaFecha_ = abT_
        .filter(function(r){ return String(r[0]).trim() === fStr; })
        .map(function(r){ return String(r[1]).trim(); });
    }
  }

  // ── 3b. TARJETAS — eliminar filas ─────────────────────────────────────────
  changes.tarjetas = deleteRowsForFecha(tarjSh_, 1); // col A = fecha

  // ── 4. MATCH — eliminar filas ─────────────────────────────────────────────
  changes.match = deleteRowsForFecha(getSheet_(SHEETS.MATCH), 2); // col B = fecha

  // ── 5. SCORE — borrar filas NGT DB para esta fecha y recalcular ──────────
  const ngtScoreSh = getNGTScoreSheet_();
  if (ngtScoreSh) {
    const last = ngtScoreSh.getLastRow();
    if (last >= 2) {
      const ab = ngtScoreSh.getRange(2, 1, last - 1, 2).getValues();
      for (let i = ab.length - 1; i >= 0; i--) {
        if (String(ab[i][0] || '').trim() === fStr) ngtScoreSh.deleteRow(i + 2);
      }
    }
  }
  recalcularTotalesScore_(null);
  changes.score = 18;

  SpreadsheetApp.flush();
  audit_('ELIMINAR_FECHA', 'admin', { fecha, changes });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  try {
    const cache_ = CacheService.getScriptCache();
    const keysABorrar_ = ['fechas','fechasConEstado','fechaActiva','fl_' + String(fecha)];
    // Limpiar también la "fila recordada" y el "último que cargó" de cada jugador de esta
    // fecha — si no se borran, quedan apuntando a filas viejas (hasta 6hs) y al recrear la
    // fecha (con filas nuevas en otra posición), la app lee/escribe la fila equivocada.
    matriculasDeLaFecha_.forEach(function(m){
      keysABorrar_.push('tRow_' + fStr + '_' + m);
      keysABorrar_.push('lastCarg_' + fStr + '_' + m);
    });
    cache_.removeAll(keysABorrar_);
  } catch(e) {}

  // Limpiar FECHA_META para que el botón FECHA desaparezca del home
  try {
    const props = PropertiesService.getDocumentProperties();
    const meta  = JSON.parse(props.getProperty('FECHA_META') || '{}');
    delete meta[String(fecha)];
    props.setProperty('FECHA_META', JSON.stringify(meta));
  } catch(e) {}

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
  const rowsNeeded = prepared.length; // 1 row per match
  const lastRequired = nextRow + rowsNeeded - 1;
  if (sh.getMaxRows() < lastRequired) {
    sh.insertRowsAfter(sh.getMaxRows(), lastRequired - sh.getMaxRows() + 10);
    log.push('inserted rows to reach row ' + (lastRequired + 10));
  }

  // Write 1 row per match: B=fecha, C=mat1, D=mat2, E=res1, F=pts1, G=res2, H=pts2
  const newRows = prepared.map(function(p) { return [fecha, p.mat1, p.mat2, '', 0, '', 0]; });

  let written = 0;
  try {
    sh.getRange(nextRow, 2, rowsNeeded, 7).setValues(newRows);
    written = prepared.length;
    log.push('wrote ' + rowsNeeded + ' match rows starting at row ' + nextRow);
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
  // B=fecha, C=mat1, D=mat2
  const range = sh.getRange(2, 2, nextEmpty - 2, 3).getValues();
  const matToName = {};
  getJugadores_().forEach(function(j) { matToName[j.matricula] = j.nombre; });

  const matches = [];
  for (let i = 0; i < range.length; i++) {
    const f  = String(range[i][0] || '').trim();
    const m1 = String(range[i][1] || '').trim();
    const m2 = String(range[i][2] || '').trim();
    if (f === String(fecha) && m1 && m2) {
      matches.push({
        rowI:   i + 2,
        j1Name: matToName[m1] || m1,
        j2Name: matToName[m2] || m2,
        j1:     m1,
        j2:     m2,
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
        sh.getRange(r, 2, 1, 7).clearContent(); // clear B..H
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
  const rowsNeeded = prepared.length; // 1 row per match
  const lastRequired = nextRow + rowsNeeded - 1;
  if (sh.getMaxRows() < lastRequired) {
    sh.insertRowsAfter(sh.getMaxRows(), lastRequired - sh.getMaxRows() + 10);
    changes.log.push('inserted rows to row ' + (lastRequired + 10));
  }

  // Step 4: Write 1 row per match: B=fecha, C=mat1, D=mat2, E..H empty (filled by recalcular)
  const newRows = prepared.map(function(p) { return [fecha, p.mat1, p.mat2, '', 0, '', 0]; });
  try {
    sh.getRange(nextRow, 2, rowsNeeded, 7).setValues(newRows);
    changes.added = prepared.length;
    changes.log.push('wrote ' + rowsNeeded + ' match rows starting ' + nextRow);
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


/**
 * Actualiza los jugadores con Doble Stableford para una fecha específica.
 * Recibe la lista COMPLETA de jugadores que juegan doble en esa fecha
 * (reemplaza cualquier configuración previa).
 */
function setDoblesFecha_(params) {
  const { adminKey, fecha, dobles } = params;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const fStr = String(fecha);
  const nuevosDobles   = Array.isArray(dobles) ? dobles.map(String) : [];
  const actualesDobles = getDoblesForFecha_(fecha);

  // Obtener todos los jugadores en esta fecha para limpiar los que ya no están
  const shT = getSheet_(SHEETS.TARJETAS);
  const todosEnFecha = [];
  if (shT) {
    const ne = findNextEmptyRow_(shT, 1);
    if (ne > 2) {
      shT.getRange(2, 1, ne - 2, 2).getValues().forEach(function(r) {
        const f = String(r[0] || '').trim();
        const m = String(r[1] || '').trim();
        if (f === fStr && m && m.indexOf('INV') !== 0) todosEnFecha.push(m);
      });
    }
  }

  const changes = { set: [], cleared: [], notFound: [] };

  nuevosDobles.forEach(function(mat) {
    setNGTScoreField_(fStr, mat, 6, 1);
    changes.set.push(mat);
  });

  todosEnFecha.forEach(function(mat) {
    if (actualesDobles.indexOf(mat) >= 0 && nuevosDobles.indexOf(mat) < 0) {
      setNGTScoreField_(fStr, mat, 6, 0);
      changes.cleared.push(mat);
    }
  });

  SpreadsheetApp.flush();
  // Invalidate cache so jugadoresConDoble reflects the updated state immediately
  try { CacheService.getScriptCache().remove('jugadoresConDoble'); } catch(e) {}

  // Recalcular totales automáticamente para que el leaderboard quede actualizado
  recalcularTotalesScore_(null);

  audit_('SET_DOBLES_FECHA', 'admin', { fecha, dobles: nuevosDobles, changes });
  return { ok: true, changes: changes };
}

/**
 * Recalcula Stableford hoyo a hoyo para todos los jugadores de una fecha.
 * Útil cuando el HCP de juego fue corregido después de que las tarjetas ya estaban cargadas.
 * Actualiza STB!E:K, SCORE!ST_col, y llama a recalcularTotalesScore_ al final.
 */
function recalcularStbFecha_(params) {
  const { adminKey, fecha } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const fStr = String(fecha);
  const fecN = parseInt(fecha);
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return { ok: false, error: 'Sin TARJETAS' };
  const last = findNextEmptyRow_(sh, 1);
  if (last <= 2) return { ok: false, error: 'Sin filas en TARJETAS' };

  // A..X: 0=fecha,1=mat,2=hcp,3=canchaId,4..21=H1..H18,22=LD,23=BA
  const allRows = sh.getRange(2, 1, last - 2, 24).getValues();
  const fechaRows = allRows.filter(function(r){ return String(r[0]).trim() === fStr; });
  if (!fechaRows.length) return { ok: false, error: 'Sin tarjetas para fecha ' + fStr };

  // Cancha (pares + índices) — forzar lectura fresca para que tome índices corregidos en NGT DB
  const canchaId   = String(fechaRows[0][3] || '').trim();
  const canchaName = canchaId ? lookupCanchaName_(canchaId) : '';
  const cacheKey   = 'cp2_' + canchaId;
  try { CacheService.getScriptCache().remove(cacheKey); } catch(e) {}
  const cd = getCanchaPares_(canchaId || canchaName);
  if (!cd || !cd.pares || !cd.indices || cd.pares.length < 18 || cd.indices.length < 18) {
    return { ok: false, error: 'No se pudo leer pares/índices de la cancha' };
  }

  // Mapear STB rows (A=fecha, B=mat) → número de fila
  const stbSh = getSheet_('STB');
  if (!stbSh) return { ok: false, error: 'Sin hoja STB' };
  const stbLast = stbSh.getLastRow();
  const stbMap = {};
  if (stbLast >= 2) {
    stbSh.getRange(2, 1, stbLast - 1, 2).getValues().forEach(function(r, i){
      stbMap[String(r[0]).trim() + '_' + String(r[1]).trim()] = i + 2;
    });
  }

  let updated = 0;
  const details = [];

  fechaRows.forEach(function(r){
    const mat    = String(r[1]).trim();
    const hcp    = r[2];
    if (!mat || mat === 'INV') return;

    const scores18 = r.slice(4, 22).map(function(v){ return (v === '' || v == null) ? null : Number(v); });
    const stbBreak = calcStbBreakdown_(scores18, cd.pares, cd.indices, hcp);
    if (!stbBreak) return; // sin scores aún

    // Actualizar STB C:I
    const key = fStr + '_' + mat;
    if (stbMap[key]) {
      stbSh.getRange(stbMap[key], 3, 1, 7).setValues([[
        stbBreak.e, stbBreak.f, stbBreak.g, stbBreak.h,
        stbBreak.i, stbBreak.j, stbBreak.k
      ]]);
    }

    // Actualizar SCORE col STB para esta fecha → NGT DB
    setNGTScoreField_(fStr, mat, 3, stbBreak.k);

    updated++;
    details.push({ mat: mat, hcp: hcp, stb: stbBreak.k });
  });

  if (updated > 0) {
    recalcularTotalesScore_(null);
    try { CacheService.getScriptCache().remove('fl_' + fStr); } catch(e){}
  }

  audit_('RECALCULAR_STB', adminKey, { fecha: fStr, updated: updated });
  return { ok: true, updated: updated, details: details };
}

function updateCanchaHoyos_(params) {
  const { adminKey, canchaId, hoyos } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!canchaId) return { ok: false, error: 'Falta canchaId' };
  if (!Array.isArray(hoyos) || !hoyos.length) return { ok: false, error: 'Falta lista de hoyos' };
  const sh = getHistSheet_('CANCHAS');
  if (!sh) return { ok: false, error: 'Hoja CANCHAS no encontrada en NGT DB' };
  const lr = sh.getLastRow();
  if (lr < 2) return { ok: false, error: 'CANCHAS vacía' };
  // NGT DB CANCHAS: A=id(0), B=hoyo(1), C=par(2), D=hcp_idx(3) — sin columna nombre
  const data = sh.getRange(2, 1, lr - 1, 4).getValues();
  const hoyoMap = {};
  hoyos.forEach(function(h) { hoyoMap[parseInt(h.hoyo)] = h; });
  let updated = 0;
  for (let i = 0; i < data.length; i++) {
    const rowId = String(data[i][0] || '').trim();
    if (rowId !== String(canchaId)) continue;
    const rowHoyo = parseInt(data[i][1]); // col B = hoyo
    const hd = hoyoMap[rowHoyo];
    if (!hd) continue;
    const par = parseInt(hd.par);
    const idx = parseInt(hd.indice);
    if (!isNaN(par)) sh.getRange(i + 2, 3).setValue(par); // col C = par
    if (!isNaN(idx)) sh.getRange(i + 2, 4).setValue(idx); // col D = hcp_idx
    updated++;
  }
  try { CacheService.getScriptCache().remove('cp2_' + canchaId); } catch(e) {}
  return { ok: true, updated: updated };
}

function updateRating_(params) {
  const { adminKey, canchaId, color, rating, slope } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!canchaId || !color) return { ok: false, error: 'Falta canchaId o color' };
  const sh = getHistSheet_('Rating');
  if (!sh) return { ok: false, error: 'Hoja Rating no encontrada en NGT DB' };
  const lr = sh.getLastRow();
  if (lr < 2) return { ok: false, error: 'Rating vacía' };
  const data = sh.getRange(2, 1, lr - 1, 5).getValues();
  const colorKey = String(color).trim().toUpperCase();
  let found = false;
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() !== String(canchaId)) continue;
    if (String(data[i][2] || '').trim().toUpperCase() !== colorKey) continue;
    if (rating !== undefined && rating !== null && rating !== '') sh.getRange(i + 2, 4).setValue(parseFloat(rating));
    if (slope  !== undefined && slope  !== null && slope  !== '') sh.getRange(i + 2, 5).setValue(parseInt(slope));
    found = true;
    break;
  }
  if (!found) return { ok: false, error: 'No se encontró ' + canchaId + ' / ' + color + ' en Rating' };
  try { CacheService.getScriptCache().remove('cp2_' + canchaId); } catch(e) {}
  return { ok: true };
}

function recalcularMatchesFecha_(params) {
  const { adminKey, fecha, hoyoSalida: paramHoyoSalida } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  if (!fecha) return { ok: false, error: 'Falta fecha' };

  const fStr = String(fecha);

  const matchSh = getSheet_(SHEETS.MATCH);
  if (!matchSh) return { ok: false, error: 'Hoja MATCH no encontrada' };
  const matchLast = findNextEmptyRow_(matchSh, 2);
  if (matchLast <= 2) return { ok: false, error: 'No hay matches' };

  const matchData = matchSh.getRange(2, 2, matchLast - 2, 3).getValues(); // B, C, D

  const tarjSh = getSheet_(SHEETS.TARJETAS);
  if (!tarjSh) return { ok: false, error: 'Hoja TARJETAS no encontrada' };
  const tarjLast = findNextEmptyRow_(tarjSh, 1);
  if (tarjLast <= 2) return { ok: false, error: 'No hay tarjetas' };

  // A..X: 0=fecha,1=mat,2=hcp,3=canchaId,4..21=H1..H18,22=LD,23=BA
  const tarjAll = tarjSh.getRange(2, 1, tarjLast - 2, 24).getValues();
  const tarjMap = {};
  let canchaId = null, canchaName = null;
  tarjAll.forEach(function(r) {
    if (String(r[0]).trim() !== fStr) return;
    const mat = String(r[1]).trim();
    tarjMap[mat] = r;
    if (!canchaId) { canchaId = String(r[3]).trim(); canchaName = canchaId ? lookupCanchaName_(canchaId) : ''; }
  });

  try { CacheService.getScriptCache().remove('cp2_' + canchaId); } catch(e) {}
  const cd = getCanchaPares_(canchaId || canchaName);
  const cpIndices = (cd && cd.indices) ? cd.indices : [];
  if (!cpIndices.length) return { ok: false, error: 'No se encontraron índices de la cancha' };

  // hoyoSalida: prefer explicit param from frontend, fall back to stored meta
  var hoyoSalida;
  if (paramHoyoSalida !== undefined && paramHoyoSalida !== null) {
    hoyoSalida = parseInt(paramHoyoSalida) || 1;
  } else {
    const fechaMeta = getFechaMeta_(fStr);
    hoyoSalida = (fechaMeta && fechaMeta.hoyoSalida) ? parseInt(fechaMeta.hoyoSalida) : 1;
  }
  const holeOrder  = [];
  if (hoyoSalida === 10) {
    for (var ho = 9; ho < 18; ho++) holeOrder.push(ho);
    for (var ho = 0; ho < 9;  ho++) holeOrder.push(ho);
  } else {
    for (var ho = 0; ho < 18; ho++) holeOrder.push(ho);
  }

  const matchWriteOps = [];
  const rowYMap = {}; // sheetRow → { mat1, pts1, mat2, pts2 }
  const affectedMats = {};
  let updated = 0;

  for (let i = 0; i < matchData.length; i++) {
    if (String(matchData[i][0] || '').trim() !== fStr) continue;
    const matA = String(matchData[i][1] || '').trim();
    const matB = String(matchData[i][2] || '').trim();
    if (!matA || !matB) continue;

    const tarjA = tarjMap[matA];
    const tarjB = tarjMap[matB];
    if (!tarjA || !tarjB) continue;

    const hcpA = parseFloat(tarjA[2]);
    const hcpB = parseFloat(tarjB[2]);
    if (isNaN(hcpA) || isNaN(hcpB)) continue;

    const scoresA = tarjA.slice(4, 22);
    const scoresB = tarjB.slice(4, 22);
    const hasScores = scoresA.some(function(s){ return s !== '' && s !== null && s !== undefined; })
                   && scoresB.some(function(s){ return s !== '' && s !== null && s !== undefined; });
    if (!hasScores) continue;

    const hcp85A = Math.round(hcpA * 0.85);
    const hcp85B = Math.round(hcpB * 0.85);
    const ayA = Math.max(0, hcp85A - hcp85B);
    const ayB = Math.max(0, hcp85B - hcp85A);
    const bcA = Math.max(0, ayA - 18);
    const bcB = Math.max(0, ayB - 18);

    const netA = new Array(18), netB = new Array(18);
    for (let h = 0; h < 18; h++) {
      const idx  = cpIndices[h] || 0;
      const adjA = (ayA > 0 && ayA >= idx ? -1 : 0) + (bcA > 0 && idx <= bcA ? -1 : 0);
      const adjB = (ayB > 0 && ayB >= idx ? -1 : 0) + (bcB > 0 && idx <= bcB ? -1 : 0);
      const gA   = (scoresA[h] !== '' && scoresA[h] != null) ? parseInt(scoresA[h]) : null;
      const gB   = (scoresB[h] !== '' && scoresB[h] != null) ? parseInt(scoresB[h]) : null;
      netA[h]    = (gA !== null && !isNaN(gA)) ? gA + adjA : '';
      netB[h]    = (gB !== null && !isNaN(gB)) ? gB + adjB : '';
    }

    // Match play result in hole-play order (respects hoyoSalida)
    let mpDiff = 0, clinchUp = 0, clinchRem = -1;
    for (let pos = 0; pos < 18; pos++) {
      const h = holeOrder[pos];
      if (netA[h] !== '' && netB[h] !== '') {
        if (netA[h] < netB[h]) mpDiff++;
        else if (netB[h] < netA[h]) mpDiff--;
      }
      const remaining = 17 - pos;
      if (clinchRem === -1 && Math.abs(mpDiff) > remaining) {
        clinchUp = Math.abs(mpDiff); clinchRem = remaining;
      }
    }
    let xA, xB;
    if (clinchRem === -1) {
      xA = 'AS'; xB = 'AS';
    } else if (mpDiff > 0) {
      xA = clinchRem > 0 ? (clinchUp + '&' + clinchRem) : (clinchUp + ' UP');
      xB = '';
    } else {
      xA = '';
      xB = clinchRem > 0 ? (clinchUp + '&' + clinchRem) : (clinchUp + ' UP');
    }
    const yA = xA === '' ? 0 : (xA === 'AS' ? 3 : 6);
    const yB = xB === '' ? 0 : (xB === 'AS' ? 3 : 6);

    const rowI = i + 2;
    rowYMap[rowI] = { mat1: matA, pts1: yA, mat2: matB, pts2: yB };
    affectedMats[matA] = true; affectedMats[matB] = true;
    // Write [res1, pts1, res2, pts2] to cols E..H of the single row
    matchWriteOps.push({ row: rowI, col: 5, data: [[xA, yA, xB, yB]] });
    updated++;
  }

  if (!matchWriteOps.length) return { ok: false, error: 'No se encontraron matches con scores para recalcular' };

  matchWriteOps.forEach(function(op) {
    matchSh.getRange(op.row, op.col, 1, op.data[0].length).setValues(op.data);
  });

  // Write MA totals → NGT DB
  const matchFull = matchSh.getRange(2, 2, matchLast - 2, 7).getValues();
  Object.keys(affectedMats).forEach(function(mat) {
    let totalMA = 0;
    matchFull.forEach(function(r, ri) {
      if (String(r[0] || '').trim() !== fStr) return;
      const m1 = String(r[1] || '').trim();
      const m2 = String(r[2] || '').trim();
      if (mat !== m1 && mat !== m2) return;
      const shRow = ri + 2;
      if (rowYMap[shRow]) {
        totalMA += mat === rowYMap[shRow].mat1 ? rowYMap[shRow].pts1 : rowYMap[shRow].pts2;
      } else {
        totalMA += mat === m1 ? (Number(r[4]) || 0) : (Number(r[6]) || 0);
      }
    });
    setNGTScoreField_(fStr, mat, 4, totalMA);
  });

  recalcularTotalesScore_(null);
  try { CacheService.getScriptCache().remove('fl_' + fStr); } catch(e) {}
  audit_('RECALCULAR_MATCHES', adminKey, { fecha: fStr, updated: updated, hoyoSalida: hoyoSalida });
  return { ok: true, updated: updated, hoyoSalida: hoyoSalida, holeOrder: holeOrder };
}

/**
 * One-time migration: converts MATCH from 2-rows-per-match to 1-row-per-match.
 * Run ONCE from the Apps Script editor after deploying this version.
 * Safe to re-run: skips rows that are already in 1-row format.
 * Line history data in cols J:L (10-12) is preserved (different column range).
 */
function debugMigrarMatch_() {
  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) { Logger.log('MATCH no encontrado'); return; }
  const lastRow = sh.getLastRow();
  Logger.log('lastRow: ' + lastRow);
  if (lastRow < 3) { Logger.log('Sin datos'); return; }
  const rawData = sh.getRange(2, 2, lastRow - 1, 24).getValues();
  Logger.log('rawData.length: ' + rawData.length);
  // Mostrar primeras 4 filas
  for (var i = 0; i < Math.min(4, rawData.length); i++) {
    Logger.log('row[' + i + '] B=' + rawData[i][0] + ' C=' + rawData[i][1] + ' D=' + rawData[i][2] + ' X=' + rawData[i][22] + ' Y=' + rawData[i][23]);
  }
  // Contar pares válidos
  var validPairs = 0, skipped = 0;
  for (var j = 0; j + 1 < rawData.length; j += 2) {
    var fA = String(rawData[j][0] || '').trim();
    var matA = String(rawData[j][1] || '').trim();
    var matB = String(rawData[j + 1][1] || '').trim();
    if (!fA || !matA || !matB) { skipped++; } else { validPairs++; }
  }
  Logger.log('Pares válidos: ' + validPairs + ' | Saltados: ' + skipped);
}

function migrarMatchA1Fila_() {
  const sh = getSheet_(SHEETS.MATCH);
  if (!sh) return { error: 'Hoja MATCH no encontrada' };
  const lastRow = sh.getLastRow();
  if (lastRow < 3) return { ok: true, converted: 0, message: 'No hay datos para migrar' };

  const rawData = sh.getRange(2, 2, lastRow - 1, 24).getValues();

  const newRows = [];
  let converted = 0;
  for (let i = 0; i + 1 < rawData.length; i += 2) {
    const rA = rawData[i];
    const rB = rawData[i + 1];
    const fA   = String(rA[0] || '').trim();
    const matA = String(rA[1] || '').trim();
    const matB = String(rB[1] || '').trim();
    if (!fA || !matA || !matB) continue;
    const resA = String(rA[22] || '').trim();
    const ptsA = Number(rA[23]) || 0;
    const resB = String(rB[22] || '').trim();
    const ptsB = Number(rB[23]) || 0;
    newRows.push([fA, matA, matB, resA, ptsA, resB, ptsB]);
    converted++;
  }

  if (!newRows.length) return { ok: true, converted: 0, message: 'No se encontraron pares para convertir' };

  sh.getRange(2, 2, lastRow - 1, 24).clearContent();
  sh.getRange(2, 2, newRows.length, 7).setValues(newRows);
  SpreadsheetApp.flush();

  audit_('MIGRAR_MATCH_1FILA', 'admin', { converted: converted, totalRows: newRows.length });
  return { ok: true, converted: converted, totalRows: newRows.length };
}

function crearCancha_(params) {
  const { adminKey, nombre, hoyos, ratings } = params || {};
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const nombreClean = String(nombre || '').trim();
  if (!nombreClean) return { ok: false, error: 'Falta el nombre de la cancha' };
  if (!Array.isArray(hoyos) || hoyos.length !== 18) return { ok: false, error: 'Se necesitan exactamente 18 hoyos' };

  // NGT DB CANCHAS: A=id, B=hoyo, C=par, D=hcp_idx (sin nombre)
  const histSh    = getHistSheet_('CANCHAS');
  const ratingSh  = getHistSheet_('Rating');
  if (!histSh || !ratingSh) return { ok: false, error: 'Hojas NGT DB no encontradas' };

  // Max ID desde NGT DB CANCHAS
  let maxId = 0;
  const lrH = histSh.getLastRow();
  if (lrH >= 2) {
    histSh.getRange(2, 1, lrH - 1, 1).getValues()
      .forEach(function(r){ const id = parseInt(r[0]); if (!isNaN(id) && id > maxId) maxId = id; });
  }
  const newId = maxId + 1;

  // NGT DB CANCHAS: 18 rows — ID, HOYO, PAR, INDICE
  const canchasRows = hoyos.map(function(h, i) {
    return [newId, i + 1, parseInt(h.par) || 4, parseInt(h.indice) || (i + 1)];
  });
  histSh.getRange(histSh.getLastRow() + 1, 1, 18, 4).setValues(canchasRows);

  // NGT DB Rating: one row per tee color — A=id, B=nombre, C=tee, D=rating, E=slope
  if (Array.isArray(ratings) && ratings.length) {
    const ratingRows = ratings
      .filter(function(r){ return r.color && r.rating != null && r.slope != null; })
      .map(function(r){ return [newId, nombreClean, String(r.color).trim().toUpperCase(), parseFloat(r.rating), parseInt(r.slope)]; });
    if (ratingRows.length) ratingSh.getRange(ratingSh.getLastRow() + 1, 1, ratingRows.length, 5).setValues(ratingRows);
  }

  try {
    const cache = CacheService.getScriptCache();
    cache.remove('canchas');
    cache.remove('cp2_' + newId);
    cache.remove('allColoresCancha');
  } catch(e) {}

  return { ok: true, id: newId, nombre: nombreClean };
}