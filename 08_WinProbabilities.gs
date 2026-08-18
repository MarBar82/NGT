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