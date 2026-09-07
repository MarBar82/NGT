// ════════════ JUGADORES (Gestionar Jugadores) ════════════

// Lee un valor de la columna ACTIVO y decide si el jugador cuenta como activo.
// Vacío/sin cargar = activo (compatibilidad con los jugadores ya existentes).
function jugadorEstaActivo_(rawValue) {
  return rawValue !== false && String(rawValue).trim().toUpperCase() !== 'FALSE';
}

// Lista completa de jugadores para la pantalla de Admin — incluye activos e inactivos,
// y un booleano "tienePin" en vez del hash real (nunca se expone el PIN_HASH al cliente).
function getJugadoresAdmin_(params) {
  const adminKey = params && params.adminKey;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Hoja JUGADORES no encontrada' };
  const data = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const mat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (!mat) continue;
    out.push({
      matricula: mat,
      nombre:    String(data[i][COL_J.NOMBRE] || '').trim(),
      apodo:     String(data[i][COL_J.APODO]  || '').trim(),
      rol:       String(data[i][COL_J.ROL]    || 'Jugador').trim(),
      hcpIndex:  (data[i][COL_J.HCP_INDEX] !== '' && data[i][COL_J.HCP_INDEX] != null) ? parseFloat(data[i][COL_J.HCP_INDEX]) : null,
      activo:    jugadorEstaActivo_(data[i][COL_J.ACTIVO]),
      tienePin:  !!String(data[i][COL_J.PIN_HASH] || '').trim(),
    });
  }
  out.sort(function(a, b){ return a.nombre.localeCompare(b.nombre); });
  return { ok: true, data: out };
}

// Alta de un jugador nuevo. El HCP de juego queda vacío — se completa solo
// después (primera actualización de HCP o primera ronda), igual que hoy.
function crearJugador_(params) {
  const adminKey = params && params.adminKey;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const matricula = String(params.matricula || '').trim();
  const nombre    = String(params.nombre    || '').trim();
  const apodo     = String(params.apodo     || '').trim();
  const rol       = (String(params.rol || '').trim() === 'Admin') ? 'Admin' : 'Jugador';
  if (!matricula || !nombre || !apodo) return { ok: false, error: 'Faltan datos (matrícula, nombre y apodo son obligatorios)' };

  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Hoja JUGADORES no encontrada' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_J.MATRICULA] || '').trim() === matricula) {
      return { ok: false, error: 'Ya existe un jugador con esa matrícula' };
    }
  }
  // Fila: ORDEN(vacío), MATRICULA, NOMBRE, APODO, HCP_INDEX(vacío), HCP_UPDATED(vacío), PIN_HASH(vacío), ROL, FOTO_ID(vacío), ACTIVO
  const row = ['', matricula, nombre, apodo, '', '', '', rol, '', true];
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().removeAll(['jugadores', 'jugadoresHist']); } catch(e) {}
  return { ok: true, matricula: matricula };
}

// Edita nombre/apodo/rol de un jugador existente. La matrícula NO se puede
// cambiar acá a propósito — está referenciada en años de historial, tarjetas
// y resultados; cambiarla rompería esas referencias.
function editarJugador_(params) {
  const adminKey = params && params.adminKey;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const matricula = String(params.matricula || '').trim();
  const nombre    = String(params.nombre    || '').trim();
  const apodo     = String(params.apodo     || '').trim();
  const rol       = (String(params.rol || '').trim() === 'Admin') ? 'Admin' : 'Jugador';
  if (!matricula || !nombre || !apodo) return { ok: false, error: 'Faltan datos' };

  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Hoja JUGADORES no encontrada' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_J.MATRICULA] || '').trim() !== matricula) continue;
    sh.getRange(i + 1, COL_J.NOMBRE + 1, 1, 3).setValues([[nombre, apodo, rol]]);
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().removeAll(['jugadores', 'jugadoresHist']); } catch(e) {}
    return { ok: true };
  }
  return { ok: false, error: 'Jugador no encontrado' };
}

// Activa o desactiva un jugador (nunca se borra la fila).
function setActivoJugador_(params) {
  const adminKey = params && params.adminKey;
  if (!checkAdmin_(adminKey)) return { ok: false, error: 'No autorizado' };
  const matricula = String(params.matricula || '').trim();
  const activo = !!params.activo;
  if (!matricula) return { ok: false, error: 'Falta matrícula' };

  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Hoja JUGADORES no encontrada' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_J.MATRICULA] || '').trim() !== matricula) continue;
    sh.getRange(i + 1, COL_J.ACTIVO + 1).setValue(activo);
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().removeAll(['jugadores', 'jugadoresHist']); } catch(e) {}
    return { ok: true };
  }
  return { ok: false, error: 'Jugador no encontrado' };
}
