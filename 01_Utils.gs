// ════════════ WARM-UP ════════════
/**
 * Mantiene el runtime V8 caliente para evitar cold starts (~15-20s).
 * Instalar UNA VEZ desde el editor de Apps Script:
 *   1. Abrir Code37.gs en script.google.com
 *   2. Ejecutar la función instalarTriggerWarmup_ manualmente
 *   3. Autorizar los permisos cuando se solicite
 * El trigger llama warmUpScript_ cada 5 minutos automáticamente.
 */
function warmUpScript() {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getName();
    CacheService.getScriptCache().put('warmup_ts', String(Date.now()), 300);
  } catch(e) {}
}

function instalarTriggerWarmup() {
  // Eliminar triggers existentes de warmup para no duplicar
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'warmUpScript') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('warmUpScript')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('Trigger warmup instalado: cada 5 minutos.');
}

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
