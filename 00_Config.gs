/**
 * NUMA GOLF TOUR — Apps Script Backend v5 (modularizado)
 * Módulos: 00_Config · 01_Utils · 02_Auth · 03_Reads · 04_Writes
 *          05_HCP · 06_ArmarLineas · 07_LiveScoring · 08_WinProbabilities
 *          09_Resultados · 10_Routing
 */
// ════════════ CONFIG ════════════
const SHEETS = {
  TARJETAS:  'TARJETAS',
  MATCH:     'MATCH',
  JUGADORES: 'JUGADORES',
  FECHAS:    'FECHAS',
  SCORE:     'SCORE',
  AUDIT:     '_AUDIT',
};

const COL_J = { ORDEN: 0, MATRICULA: 1, NOMBRE: 2, APODO: 3, HCP_INDEX: 4, HCP_UPDATED: 5, PIN_HASH: 6, ROL: 7, FOTO_ID: 8 };
const COL_C = { ID: 0, NOMBRE: 1 }; // Slope/Rating leídos desde NGT DB hoja "Rating"
