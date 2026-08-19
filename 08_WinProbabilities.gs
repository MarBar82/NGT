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

  // Read SCORE using the canonical long-format reader (A=fecha, B=mat, C=STB, D=Match,
  // E=Bonus, F=Doble, G=PosFecha, H=PosLeaderboard) — matches what 03_Reads/04_Writes use.
  // The old wide-format read (A=mat, B=nombre, C=total, then 4-col fecha blocks) was wrong
  // and caused validMats to never match, returning an empty players list every time.
  const allScoreRows = getAllNGTScoreData_();
  if (!allScoreRows || !allScoreRows.length) return null;

  // Get valid player matriculas and their nombres
  const jugadoresList = getJugadores_();
  const validMats = {};
  const matNombre = {};
  jugadoresList.forEach(j => {
    const m = String(j.matricula).trim();
    validMats[m] = true;
    matNombre[m] = (j.nombre || m);
  });

  // PASS 1: detect global fechasJugadas (highest fecha number seen with at least one ST > 0)
  let globalFechasJugadas = 0;
  allScoreRows.forEach(r => {
    if (!validMats[r.mat]) return;
    const f = parseInt(r.fecha) || 0;
    if (r.st > 0 && f > globalFechasJugadas) globalFechasJugadas = f;
  });
  const fechasRestantes = Math.max(0, NUM_FECHAS - globalFechasJugadas);

  // PASS 2: group rows by player, build per-fecha history
  // r.db from getAllNGTScoreData_ is a Number (0 or >0 if doble was used/scored)
  const byMat = {};
  allScoreRows.forEach(r => {
    if (!validMats[r.mat]) return;
    const f = parseInt(r.fecha) || 0;
    if (f < 1 || f > globalFechasJugadas) return;
    if (!byMat[r.mat]) byMat[r.mat] = [];
    byMat[r.mat].push(r);
  });

  // Aggregate current total points per player from the SCORE rows themselves
  const totalByMat = {};
  allScoreRows.forEach(r => {
    if (!validMats[r.mat]) return;
    totalByMat[r.mat] = (totalByMat[r.mat] || 0) + r.st + r.ma + r.pb + (r.db || 0);
  });

  const players = [];
  Object.keys(validMats).forEach(m => {
    const fechaRows = byMat[m] || [];
    let stHistory = [], maHistory = [], pbHistory = [];
    let dobleUsed = false;
    let playedCount = 0;

    fechaRows.forEach(r => {
      const played = r.st > 0 || r.ma > 0;
      if (played) {
        playedCount++;
        stHistory.push(r.st);
        maHistory.push(r.ma);
        pbHistory.push(r.pb);
        if (r.db > 0) dobleUsed = true;
      }
    });

    players.push({
      matricula: m,
      nombre: matNombre[m] || m,
      currentPoints: totalByMat[m] || 0,
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
    const key = 'winProbs_v5';   // bumped: long-format SCORE reader fix
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