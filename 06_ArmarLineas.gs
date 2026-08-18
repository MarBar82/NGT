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
    // Modo wizard: lista enviada desde el frontend
    params.jugadores.forEach(function(item) {
      const m = String(item.matricula || '').trim();
      if (!m || m.indexOf('INV') === 0 || seenMats[m]) return;
      seenMats[m] = true;
      players.push({ matricula: m, hcp: parseInt(item.hcp) || 0, apodo: '' });
    });
    // Recalcular HCP con fórmula WHS completa si vienen parámetros de cancha
    const cId   = String(params.canchaId   || '').trim();
    const cName = String(params.canchaName || '').trim();
    const cTee  = String(params.colorTee   || 'BLANCAS').trim();
    if (cId || cName) {
      try {
        const hcpInfo = buildHcpJuegoMap_(cId, cName, cTee);
        if (hcpInfo && Object.keys(hcpInfo.hcpMap).length > 0) {
          players.forEach(function(p) {
            if (hcpInfo.hcpMap[p.matricula] !== undefined) {
              p.hcp = hcpInfo.hcpMap[p.matricula];
            }
          });
        }
      } catch(e) { /* continuar con HCP del frontend si falla */ }
    }
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

  // 3a+3b. Una sola lectura de MATCH (B=fecha, C=mat1, D=mat2).
  // - matchedPairs: todos los enfrentamientos históricos (para evitar repetir 1v1).
  // - recentLinePairs: compañeros de línea en las últimas 2 fechas, reconstruidos
  //   por componentes conectados (jugadores unidos por al menos un match en la misma
  //   fecha forman una línea — funciona para líneas de 3 y de 4).
  const matchedPairs   = {}; // "matA|matB" → nº de veces que se enfrentaron
  const recentLinePairs = {}; // "matA|matB" → true si compartieron línea en últimas 2 fechas
  try {
    const lastRowM = shM.getLastRow();
    if (lastRowM >= 3) {
      const mRows = shM.getRange(2, 2, lastRowM - 1, 3).getValues();

      // Agrupar matches por fecha
      const matchesByFecha = {};
      for (var mi = 0; mi < mRows.length; mi++) {
        const f  = String(mRows[mi][0] || '').trim();
        const m1 = String(mRows[mi][1] || '').trim();
        const m2 = String(mRows[mi][2] || '').trim();
        if (!f || !m1 || !m2 || m1 === m2) continue;
        const key = [m1, m2].sort().join('|');
        matchedPairs[key] = (matchedPairs[key] || 0) + 1;
        if (!matchesByFecha[f]) matchesByFecha[f] = [];
        matchesByFecha[f].push([m1, m2]);
      }

      // Últimas 2 fechas anteriores a la actual
      const currentFechaNum = parseInt(fecha) || 0;
      const lastTwo = Object.keys(matchesByFecha).map(Number)
        .filter(function(f2) { return f2 < currentFechaNum; })
        .sort(function(a, b) { return b - a; })
        .slice(0, 2);

      // Componentes conectados por fecha → líneas
      lastTwo.forEach(function(f2) {
        const pairs = matchesByFecha[String(f2)];
        if (!pairs || !pairs.length) return;
        // Union-Find
        const parent = {};
        function find(x) {
          if (!parent[x]) parent[x] = x;
          if (parent[x] !== x) parent[x] = find(parent[x]);
          return parent[x];
        }
        pairs.forEach(function(p) {
          const px = find(p[0]), py = find(p[1]);
          if (px !== py) parent[px] = py;
        });
        // Agrupar jugadores por componente
        const lines = {};
        const allMats = [];
        pairs.forEach(function(p) {
          if (allMats.indexOf(p[0]) < 0) allMats.push(p[0]);
          if (allMats.indexOf(p[1]) < 0) allMats.push(p[1]);
        });
        allMats.forEach(function(m) {
          const root = find(m);
          if (!lines[root]) lines[root] = [];
          lines[root].push(m);
        });
        // Todos los pares dentro de cada línea = recentLinePairs
        Object.keys(lines).forEach(function(root) {
          const grp = lines[root];
          for (var i = 0; i < grp.length; i++)
            for (var j = i + 1; j < grp.length; j++)
              recentLinePairs[[grp[i], grp[j]].sort().join('|')] = true;
        });
      });
    }
  } catch(e) { /* continuar sin historial */ }

  // ── 5. Algoritmo de armado de líneas ─────────────────────────────────────
  const N = players.length;

  // Líneas preferentemente de 4. Usar de 3 solo cuando N no es divisible por 4.
  // Fórmula: N = 4*numFour + 3*numThree, maximizando numFour (mínimas líneas de 3).
  // N mod 4 == 0 → 0 líneas de 3
  // N mod 4 == 1 → 3 líneas de 3 (requiere N >= 9)
  // N mod 4 == 2 → 2 líneas de 3
  // N mod 4 == 3 → 1 línea de 3
  var numThree, numFour;
  var r = N % 4;
  if      (r === 0) { numFour = N / 4;       numThree = 0; }
  else if (r === 1) { numFour = (N - 9) / 4; numThree = 3; } // e.g. N=17 → 2 fours + 3 threes
  else if (r === 2) { numFour = (N - 6) / 4; numThree = 2; } // e.g. N=18 → 3 fours + 2 threes
  else              { numFour = (N - 3) / 4; numThree = 1; } // e.g. N=15 → 3 fours + 1 three

  // Prioridades de horario — siempre comparar como strings para evitar type mismatch
  var primeraMats = (params.prioridades || [])
    .filter(function(p) { return p.posicion === 'primera'; })
    .map(function(p) { return String(p.matricula); });
  var ultimaMats = (params.prioridades || [])
    .filter(function(p) { return p.posicion === 'ultima'; })
    .map(function(p) { return String(p.matricula); });

  // Seed para producir variantes distintas (0 = determinístico; N > 0 = aleatorio)
  var seed = parseInt(params.seed) || 0;
  // PRNG mutable (mulberry32) — siempre inicializado; con seed=0 usa seed=1 (no importa
  // porque solo se invoca dentro de buildLines cuando seed > 0).
  var _rngState = (seed > 0 ? seed : 1) >>> 0;
  function rand_() {
    _rngState += 0x6D2B79F5;
    var r = Math.imul(_rngState ^ _rngState >>> 15, 1 | _rngState);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  }
  var orderedPlayers = players.slice();

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
  // matchedPairs[key] es un CONTADOR: penalizamos en proporción a las veces que jugaron.
  var PEN_MATCH_REPEAT = 10000; // por cada vez que ese par ya jugó: muy indeseable
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
      // Penalizar matches repetidos (proporcional a la cantidad de veces que ya jugaron)
      var matchScore = mps.reduce(function(s, mp) {
        return s + Math.abs(mp[0].hcp - mp[1].hcp)
                 + (matchedPairs[pKey(mp[0], mp[1])] || 0) * PEN_MATCH_REPEAT;
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
      return s + (matchedPairs[pKey(mp[0], mp[1])] || 0) * PEN_MATCH_REPEAT;
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

    // Con seed > 0: mezclar antes de ordenar por score para que combos de igual
    // puntaje se prueben en orden distinto cada llamada → resultados diferentes.
    if (seed > 0) {
      for (var ri = combos.length - 1; ri > 0; ri--) {
        var rj = Math.floor(rand_() * (ri + 1));
        var rt = combos[ri]; combos[ri] = combos[rj]; combos[rj] = rt;
      }
    }

    // Ordenar por puntaje (menor primero) — el shuffle previo randomiza empates
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

  var lines = buildLines(orderedPlayers, numThree, numFour);
  if (!lines) {
    return { ok: false, error: 'Error inesperado al armar líneas. Intentá de nuevo.' };
  }

  // ── 6. Reordenar líneas según prioridades de horario ────────────────────
  // Regla: líneas de 3 van antes que las de 4, SALVO que un jugador prioritario
  // esté en una línea de 4 — en ese caso su línea va al inicio/final igualmente.
  var primerSet = {}, ultimaSet = {};
  primeraMats.forEach(function(m) { primerSet[m] = true; });
  ultimaMats.forEach(function(m)  { ultimaSet[m] = true; });
  var hasFirst = function(l) { return l.players.some(function(p) { return primerSet[String(p.matricula)]; }); };
  var hasLast  = function(l) { return l.players.some(function(p) { return ultimaSet[String(p.matricula)]; }); };

  if (primeraMats.length || ultimaMats.length) {
    // Prioridad siempre gana — la línea del prioritario va primero/último sin importar tamaño
    var firstLines  = lines.filter(hasFirst);
    var lastLines   = lines.filter(hasLast);
    var middleLines = lines.filter(function(l) { return !hasFirst(l) && !hasLast(l); });
    // Dentro del grupo del medio (sin prioritarios), las de 3 van antes que las de 4
    middleLines.sort(function(a, b) { return a.players.length - b.players.length; });
    lines = firstLines.concat(middleLines).concat(lastLines);
  } else {
    // Sin prioridades: las de 3 van antes que las de 4
    lines.sort(function(a, b) { return a.players.length - b.players.length; });
  }

  // ── 7. Contar matches repetidos en la solución ───────────────────────────
  var repeatCount = 0;
  lines.forEach(function(l) {
    l.matches.forEach(function(m) {
      var key = [m.j1, m.j2].sort().join('|');
      if (matchedPairs[key]) repeatCount++;
    });
  });

  // ── 8. Formatear resultado ────────────────────────────────────────────────
  return {
    ok: true,
    repeatCount: repeatCount,
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