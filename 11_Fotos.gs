// ════════════ FOTOS ════════════

function getFotoUrl_(fotoId) {
  if (!fotoId) return '';
  return 'https://lh3.googleusercontent.com/d/' + fotoId + '=s400';
}

function getOrCrearCarpetaFotos_() {
  const props = PropertiesService.getDocumentProperties();
  const cachedId = props.getProperty('CARPETA_FOTOS_ID');
  if (cachedId) {
    try { return DriveApp.getFolderById(cachedId); } catch(e) {}
  }
  const nombre = 'NGT - Fotos de Jugadores';
  const iter = DriveApp.getFoldersByName(nombre);
  const carpeta = iter.hasNext() ? iter.next() : DriveApp.createFolder(nombre);
  props.setProperty('CARPETA_FOTOS_ID', carpeta.getId());
  return carpeta;
}

function subirFoto_(params) {
  const token = String(params.token || '').trim();
  const base64 = String(params.base64 || '').trim();
  const mimeType = String(params.mimeType || 'image/jpeg').trim();

  const sess = validarSesion_(token);
  if (!sess) return { ok: false, error: 'Sesión inválida' };
  const matricula = sess.mat;

  if (!base64) return { ok: false, error: 'Falta imagen' };

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 3 * 1024 * 1024) return { ok: false, error: 'La foto supera 3 MB' };

  const sh = getSheet_(SHEETS.JUGADORES);
  if (!sh) return { ok: false, error: 'Error interno' };
  const data = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_J.MATRICULA] || '').trim() === matricula) { rowIdx = i; break; }
  }
  if (rowIdx < 0) return { ok: false, error: 'Jugador no encontrado' };

  const fotoIdActual = String(data[rowIdx][COL_J.FOTO_ID] || '').trim();
  if (fotoIdActual) {
    try { DriveApp.getFileById(fotoIdActual).setTrashed(true); } catch(e) {}
  }

  const carpeta = getOrCrearCarpetaFotos_();
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const blob = Utilities.newBlob(bytes, mimeType, 'foto_' + matricula + ext);
  const file = carpeta.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  sh.getRange(rowIdx + 1, COL_J.FOTO_ID + 1).setValue(file.getId());
  SpreadsheetApp.flush();

  CacheService.getScriptCache().removeAll(['jugadores', 'perf_' + matricula]);

  return { ok: true, fotoUrl: getFotoUrl_(file.getId()) };
}
