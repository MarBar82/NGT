# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Este archivo reemplaza los prompts sueltos para copiar y pegar. De acá en adelante, cada tarea nueva que definamos se escribe acá, con instrucciones técnicas precisas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso hasta ahora: ✅ logo duplicado (14,6MB→390KB), ✅ código muerto de admin key eliminado, ✅ `fecha.html` dinámico creado. Esta es la siguiente tarea del roadmap (dividir `Code37.gs`).

---

## 🎯 Tarea para Claude Code

Dividir `Code37.gs` (6.273 líneas en un solo archivo) en varios archivos `.gs` organizados por sección. Es **solo reorganización de código, no reescritura de lógica** — ninguna función debe cambiar de comportamiento.

Usá las secciones ya marcadas en el archivo original con comentarios tipo `════════════ NOMBRE ════════════` como guía de qué mover a cada archivo nuevo:

| Archivo nuevo | Contenido (sección original) |
|---|---|
| `00_Config.gs` | CONFIG |
| `01_Utils.gs` | UTILS + WARM-UP |
| `02_Auth.gs` | AUTH |
| `03_Reads.gs` | READS |
| `04_Writes.gs` | WRITES |
| `05_HCP.gs` | HCP NGT (WHS) + HCP INDEX (actualización semanal) |
| `06_ArmarLineas.gs` | ARMAR LÍNEAS |
| `07_LiveScoring.gs` | LIVE SCORING |
| `08_WinProbabilities.gs` | WIN PROBABILITIES (Monte Carlo) |
| `09_Resultados.gs` | RESULTADOS POR FECHA + HISTÓRICO (NGT DB) |
| `10_Routing.gs` | ROUTING (`doGet`, `doPost`) |

Reglas:
1. No cambiar lógica interna de ninguna función, no renombrar funciones ni variables.
2. Apps Script comparte el mismo espacio de nombres global entre todos los archivos `.gs` de un proyecto (no hace falta import/require) — el orden de archivos no afecta la ejecución, pero mantené la numeración sugerida para que se lea ordenado en el editor.
3. Al terminar, `Code37.gs` debe quedar vacío o eliminado — todo su contenido tiene que estar distribuido en los archivos nuevos. Si por algún motivo preferís dejar algo ahí, explicá por qué antes de decidirlo.
4. Actualizá el comentario de encabezado ("NUMA GOLF TOUR — Apps Script Backend v5") en `00_Config.gs` para reflejar que el backend ahora está modularizado.
5. Al final, generá una lista `función → archivo` completa para que yo la pueda revisar contra el original antes de deployar.

---

## ❓ Preguntas de verificación

Respondé esto al terminar, acá mismo en este archivo (debajo de esta línea):

1. ¿Cuántas funciones tenía `Code37.gs` originalmente, y cuántas quedaron en total repartidas en los archivos nuevos? (los dos números tienen que coincidir)
2. ¿Encontraste alguna función duplicada entre archivos? Si sí, ¿cuál y cómo la resolviste?
3. ¿Quedó `Code37.gs` vacío/eliminado, o quedó algo sin mover? Si quedó algo, ¿qué y por qué?
4. ¿Tuviste que tocar alguna lógica (aunque sea mínima) para que algo siguiera funcionando? Si sí, ¿cuál y por qué era necesario?
5. ¿Confirmás que puedo crear cada uno de estos archivos `.gs` directamente en el editor de Apps Script (script.google.com) pegando el contenido tal cual, sin ningún paso extra de build o bundling?
6. ¿Hiciste `git add`, `commit` y `push`? Si no, ¿qué falta para que yo lo haga?

---

## ✅ Respuestas de verificación — 2026-08-18

**1. Conteo de funciones**

`Code37.gs` original: **136 funciones**. Total en los 10 módulos nuevos: **136 funciones**. Los números coinciden exactamente.

**2. Funciones duplicadas**

Ninguna. Verificado con grep sobre los 10 archivos nuevos: todos los nombres son únicos.

**3. Estado de `Code37.gs`**

Quedó con solo un bloque de comentario (12 líneas) indicando dónde está cada módulo. No hay código ejecutable ni ninguna función. El contenido completo original fue distribuido en los módulos. Se dejó el archivo (en vez de eliminarlo) porque Apps Script puede tener referencias internas al nombre del archivo original; se puede borrar una vez que el nuevo despliegue esté activo y verificado.

**4. Cambios de lógica**

Ninguno. Solo se actualizó el comentario de encabezado en `00_Config.gs` para listar los 10 módulos (regla 4 de la tarea). Ninguna función fue modificada.

**Nota sobre funciones sin sección marcada:** Había dos grupos de funciones en el archivo original sin marcador `════════════` propio:
- Entre `end Win Probabilities` y `LIVE SCORING` (líneas 3665–4199): `calcStablefordHole_`, `getTarjetasHistJugador_`, `getGolpesHistJugador_`, `debugGolpesVsTarjetas_`, `getCampeones_`, `getJugadorPerfil_`, `getJugadorEclectic_` → asignadas a `09_Resultados.gs` (todas leen NGT DB histórico y construyen perfiles de jugador).
- Después de `fin ARMAR LÍNEAS` (líneas 5318–6266): `setDoblesFecha_`, `doPost`, `recalcularHcpFecha_`, `recalcularStbFecha_`, `getCanchasAdmin_`, `updateCanchaHoyos_`, `updateRating_`, `recalcularMatchesFecha_`, `debugMigrarMatch_`, `migrarMatchA1Fila_`, `crearCancha_`, `recalcularTotalesScore_`, `getRankingFecha_`, `getGanadorFecha_`, `sumarGanadorFecha_`, `calcularGanadoresFechas_`, `test`, `run*` → distribuidas entre `04_Writes.gs`, `05_HCP.gs`, `09_Resultados.gs` y `10_Routing.gs` según su función.

**5. Compatibilidad con Apps Script**

Sí. Todos los archivos son JavaScript válido para GAS (V8 runtime). No usan `import`/`export` ni ningún paso de build. Podés crear cada uno en el editor de script.google.com, pegar el contenido, guardar, y desplegar — sin bundling ni transpilación.

**6. Git**

Sí: `git add`, `git commit` y `git push` completados. Rama `main` actualizada.

---

## 📋 Lista completa función → archivo

| Función | Archivo |
|---|---|
| `warmUpScript` | `01_Utils.gs` |
| `instalarTriggerWarmup` | `01_Utils.gs` |
| `jsonResponse_` | `01_Utils.gs` |
| `jsonpResponse_` | `01_Utils.gs` |
| `cachedRead_` | `01_Utils.gs` |
| `audit_` | `01_Utils.gs` |
| `getSheet_` | `01_Utils.gs` |
| `findNextEmptyRow_` | `01_Utils.gs` |
| `hashPin_` | `02_Auth.gs` |
| `generarToken_` | `02_Auth.gs` |
| `guardarSesion_` | `02_Auth.gs` |
| `validarSesion_` | `02_Auth.gs` |
| `loginConPin_` | `02_Auth.gs` |
| `crearPin_` | `02_Auth.gs` |
| `cambiarPin_` | `02_Auth.gs` |
| `resetPin_` | `02_Auth.gs` |
| `cerrarSesion_` | `02_Auth.gs` |
| `getRankingCampeones_` | `02_Auth.gs` |
| `checkAdmin_` | `02_Auth.gs` |
| `checkPlayer_` | `02_Auth.gs` |
| `checkPlayerByMat_` | `02_Auth.gs` |
| `getJugadores_` | `03_Reads.gs` |
| `getCanchas_` | `03_Reads.gs` |
| `lookupCanchaName_` | `03_Reads.gs` |
| `lookupJugadorName_` | `03_Reads.gs` |
| `getScoreRowForMat_` | `03_Reads.gs` |
| `getNGTScoreSheet_` | `03_Reads.gs` |
| `getAllNGTScoreData_` | `03_Reads.gs` |
| `getJugadorFechas_` | `03_Reads.gs` |
| `findNGTScoreRow_` | `03_Reads.gs` |
| `setNGTScoreField_` | `03_Reads.gs` |
| `getNGTScoreRow_` | `03_Reads.gs` |
| `getJugadoresConDobleDisponible_` | `03_Reads.gs` |
| `debugDobles_` | `03_Reads.gs` |
| `setDobleForFecha_` | `03_Reads.gs` |
| `getStForPlayerInFecha_` | `03_Reads.gs` |
| `writeDobleStScore_` | `03_Reads.gs` |
| `getStableforFromSTB_` | `03_Reads.gs` |
| `getHcpsForFecha_` | `03_Reads.gs` |
| `getBonusWinnersDetailed_` | `03_Reads.gs` |
| `getCanchaForFecha_` | `03_Reads.gs` |
| `getMatchesFullForFecha_` | `03_Reads.gs` |
| `getFechasConEstado_` | `03_Reads.gs` |
| `getMisFechas_` | `03_Reads.gs` |
| `getCanchaPares_` | `03_Reads.gs` |
| `buildHcpJuegoMap_` | `03_Reads.gs` |
| `debugHcpCalculo_` | `03_Reads.gs` |
| `debugHcpCanchas_` | `03_Reads.gs` |
| `getFechasActivas_` | `03_Reads.gs` |
| `getJugadoresEnFecha_` | `03_Reads.gs` |
| `getTarjetaJugador_` | `03_Reads.gs` |
| `getBonusWinners_` | `03_Reads.gs` |
| `getBonusesAcum_` | `03_Reads.gs` |
| `getFechaMeta_` | `03_Reads.gs` |
| `getFechaActiva_` | `03_Reads.gs` |
| `getFechaLineas_` | `03_Reads.gs` |
| `getFechaDetalle_` | `03_Reads.gs` |
| `getDoblesForFecha_` | `03_Reads.gs` |
| `editarFecha_` | `03_Reads.gs` |
| `debugMatch_` | `03_Reads.gs` |
| `getCanchasAdmin_` | `03_Reads.gs` |
| `crearFecha_` | `04_Writes.gs` |
| `calcStbBreakdown_` | `04_Writes.gs` |
| `getTarjetasForFecha_` | `04_Writes.gs` |
| `setBonusWinners_` | `04_Writes.gs` |
| `cargarTarjeta_` | `04_Writes.gs` |
| `resetFecha_` | `04_Writes.gs` |
| `eliminarFecha_` | `04_Writes.gs` |
| `cargarMatches_` | `04_Writes.gs` |
| `getMatchesForFecha_` | `04_Writes.gs` |
| `editarMatches_` | `04_Writes.gs` |
| `setDoblesFecha_` | `04_Writes.gs` |
| `recalcularStbFecha_` | `04_Writes.gs` |
| `updateCanchaHoyos_` | `04_Writes.gs` |
| `updateRating_` | `04_Writes.gs` |
| `recalcularMatchesFecha_` | `04_Writes.gs` |
| `debugMigrarMatch_` | `04_Writes.gs` |
| `migrarMatchA1Fila_` | `04_Writes.gs` |
| `crearCancha_` | `04_Writes.gs` |
| `getRatingsMap_` | `05_HCP.gs` |
| `lookupRating_` | `05_HCP.gs` |
| `calcStrokesPerHole_` | `05_HCP.gs` |
| `calcScoreAdjusted_` | `05_HCP.gs` |
| `calcDiferencial_` | `05_HCP.gs` |
| `getWhsTableEntry_` | `05_HCP.gs` |
| `calcHcpIndex_` | `05_HCP.gs` |
| `getTarjetas2026Jugador_` | `05_HCP.gs` |
| `getFechaColors2026_` | `05_HCP.gs` |
| `getHcpNGT_` | `05_HCP.gs` |
| `getColoresCancha_` | `05_HCP.gs` |
| `getAllColoresCancha_` | `05_HCP.gs` |
| `calcHandicapJuego_` | `05_HCP.gs` |
| `fetchHcpIndex_` | `05_HCP.gs` |
| `testFetchHcpUno` | `05_HCP.gs` |
| `actualizarHcpIndices_` | `05_HCP.gs` |
| `triggerActualizarHcp` | `05_HCP.gs` |
| `crearTriggerJueves` | `05_HCP.gs` |
| `recalcularHcpFecha_` | `05_HCP.gs` |
| `armarLineas_` | `06_ArmarLineas.gs` |
| `buildLineaSnapshot_` | `07_LiveScoring.gs` |
| `cargarHoyoLive_` | `07_LiveScoring.gs` |
| `getLineaLive_` | `07_LiveScoring.gs` |
| `getBonusEstado_` | `07_LiveScoring.gs` |
| `setBonusGanador_` | `07_LiveScoring.gs` |
| `sampleNormal_` | `08_WinProbabilities.gs` |
| `sampleMatchPoints_` | `08_WinProbabilities.gs` |
| `samplePB_` | `08_WinProbabilities.gs` |
| `getHcpMapActual_` | `08_WinProbabilities.gs` |
| `getWinProbabilities_` | `08_WinProbabilities.gs` |
| `getWinProbabilitiesCached_` | `08_WinProbabilities.gs` |
| `getStablefordForFecha_` | `09_Resultados.gs` |
| `getFechaResultados_` | `09_Resultados.gs` |
| `getProximaFecha_` | `09_Resultados.gs` |
| `getHistSheet_` | `09_Resultados.gs` |
| `getJugadoresHist_` | `09_Resultados.gs` |
| `getCanchasHistMap_` | `09_Resultados.gs` |
| `calcStablefordHole_` | `09_Resultados.gs` |
| `getTarjetasHistJugador_` | `09_Resultados.gs` |
| `getGolpesHistJugador_` | `09_Resultados.gs` |
| `debugGolpesVsTarjetas_` | `09_Resultados.gs` |
| `getCampeones_` | `09_Resultados.gs` |
| `getJugadorPerfil_` | `09_Resultados.gs` |
| `getJugadorEclectic_` | `09_Resultados.gs` |
| `recalcularTotalesScore_` | `09_Resultados.gs` |
| `getRankingFecha_` | `09_Resultados.gs` |
| `getGanadorFecha_` | `09_Resultados.gs` |
| `sumarGanadorFecha_` | `09_Resultados.gs` |
| `calcularGanadoresFechas_` | `09_Resultados.gs` |
| `test` | `09_Resultados.gs` |
| `runCalcularGanadoresFechas` | `09_Resultados.gs` |
| `runRecalcularTotalesScore` | `09_Resultados.gs` |
| `runDebugMigrarMatch` | `09_Resultados.gs` |
| `runMigrarMatchA1Fila` | `09_Resultados.gs` |
| `doGet` | `10_Routing.gs` |
| `getStbFecha_` | `10_Routing.gs` |
| `doPost` | `10_Routing.gs` |
