// ════════════ AUTH ════════════

// ── Sesiones PIN ──────────────────────────────────────────────────────────────

function hashPin_(mat, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, mat + ':' + String(pin))
    .map(function(b){ return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function generarToken_() {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(Date.now()) + Math.random().toString(36) + String(Math.random()))
    .map(function(b){ return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').substring(0, 48);
}

function guardarSesion_(mat, rol) {
  const token = generarToken_();
  const exp = Date.now() + 90 * 24 * 3600 * 1000; // 90 días
  PropertiesService.getDocumentProperties().setProperty('SES_' + token, JSON.stringify({ mat: mat, rol: rol, exp: exp }));
  return token;
}

function validarSesion_(token) {
  if (!token) return null;
  const raw = PropertiesService.getDocumentProperties().getProperty('SES_' + token);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (Date.now() > s.exp) {
      PropertiesService.getDocumentProperties().deleteProperty('SES_' + token);
      return null;
    }
    return s; // { mat, rol, exp }
  } catch(e) { return null; }
}

function loginConPin_(params) {
  const mat = String(params.matricula || '').trim();
  const pin = String(params.pin || '').trim();
  if (!mat || !pin) return { ok: false, error: 'Faltan parámetros' };
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Error interno' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowMat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (rowMat !== mat) continue;
    const pinHash = String(data[i][COL_J.PIN_HASH] || '').trim();
    const rol = String(data[i][COL_J.ROL] || 'Jugador').trim();
    if (!pinHash) {
      return { ok: false, needsPin: true, matricula: mat,
               nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
               apodo:  String(data[i][COL_J.APODO]  || '').trim() };
    }
    if (pinHash !== hashPin_(mat, pin)) return { ok: false, error: 'PIN incorrecto' };
    const token = guardarSesion_(mat, rol);
    return { ok: true, token: token, player: {
      matricula: mat,
      nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
      apodo:  String(data[i][COL_J.APODO]  || '').trim(),
      hcpIndex: (function(v){ return (v !== '' && v !== null) ? (parseFloat(v) || null) : null; })(data[i][COL_J.HCP_INDEX]),
      rol: rol,
    }};
  }
  return { ok: false, error: 'Matrícula no encontrada' };
}

function crearPin_(params) {
  const mat = String(params.matricula || '').trim();
  const pin = String(params.pin || '').trim();
  const pinConfirm = String(params.pinConfirm || '').trim();
  if (!mat || !pin) return { ok: false, error: 'Faltan parámetros' };
  if (pin !== pinConfirm) return { ok: false, error: 'Los PINs no coinciden' };
  if (pin.length < 4) return { ok: false, error: 'El PIN debe tener al menos 4 dígitos' };
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Error interno' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowMat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (rowMat !== mat) continue;
    const current = String(data[i][COL_J.PIN_HASH] || '').trim();
    if (current) return { ok: false, error: 'PIN ya configurado — pedile al admin que lo resetee' };
    sh.getRange(i + 1, COL_J.PIN_HASH + 1).setValue(hashPin_(mat, pin));
    SpreadsheetApp.flush();
    const rol = String(data[i][COL_J.ROL] || 'Jugador').trim();
    const token = guardarSesion_(mat, rol);
    return { ok: true, token: token, player: {
      matricula: mat,
      nombre: String(data[i][COL_J.NOMBRE] || '').trim(),
      apodo:  String(data[i][COL_J.APODO]  || '').trim(),
      rol: rol,
    }};
  }
  return { ok: false, error: 'Matrícula no encontrada' };
}

function cambiarPin_(params) {
  const mat   = String(params.matricula || '').trim();
  const token = String(params.token || '').trim();
  const pinActual  = String(params.pinActual  || '').trim();
  const pinNuevo   = String(params.pinNuevo   || '').trim();
  const pinConfirm = String(params.pinConfirm || '').trim();
  const sess = validarSesion_(token);
  if (!sess || sess.mat !== mat) return { ok: false, error: 'Sesión inválida' };
  if (pinNuevo !== pinConfirm) return { ok: false, error: 'Los PINs no coinciden' };
  if (pinNuevo.length < 4) return { ok: false, error: 'El PIN debe tener al menos 4 dígitos' };
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Error interno' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowMat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (rowMat !== mat) continue;
    const current = String(data[i][COL_J.PIN_HASH] || '').trim();
    if (current && current !== hashPin_(mat, pinActual)) return { ok: false, error: 'PIN actual incorrecto' };
    sh.getRange(i + 1, COL_J.PIN_HASH + 1).setValue(hashPin_(mat, pinNuevo));
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Jugador no encontrado' };
}

function resetPin_(params) {
  const token  = String(params.token || '').trim();
  const target = String(params.matriculaTarget || '').trim();
  const sess = validarSesion_(token);
  if (!sess || sess.rol !== 'Admin') return { ok: false, error: 'No autorizado' };
  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Error interno' };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowMat = String(data[i][COL_J.MATRICULA] || '').trim();
    if (rowMat !== target) continue;
    sh.getRange(i + 1, COL_J.PIN_HASH + 1).clearContent();
    SpreadsheetApp.flush();
    return { ok: true };
  }
  return { ok: false, error: 'Jugador no encontrado' };
}

function cerrarSesion_(params) {
  const token = String(params.token || '').trim();
  if (token) PropertiesService.getDocumentProperties().deleteProperty('SES_' + token);
  return { ok: true };
}

function getRankingCampeones_() {
  const jugs = cachedRead_('jugadores', 300, getJugadores_);
  const ranking = jugs.map(function(j) {
    const c = getCampeones_(j.matricula) || {};
    return { matricula: j.matricula, nombre: j.nombre, apodo: j.apodo, p1: c.p1 || 0, p2: c.p2 || 0, p3: c.p3 || 0, podios: c.podios || 0, participaciones: c.participaciones || 0 };
  });
  ranking.sort(function(a, b) {
    if (b.p1 !== a.p1) return b.p1 - a.p1;
    if (b.p2 !== a.p2) return b.p2 - a.p2;
    if (b.p3 !== a.p3) return b.p3 - a.p3;
    return b.podios - a.podios;
  });
  return { ok: true, data: ranking };
}

function checkAdmin_(key) {
  if (!key) return false;
  const sess = validarSesion_(String(key).trim());
  return !!(sess && sess.rol === 'Admin');
}
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
