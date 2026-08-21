# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: hicimos un análisis de rendimiento (documento aparte, `ANALISIS_PERFORMANCE.md` en el proyecto de Claude) sobre por qué la app no se siente 100% instantánea, y encontramos 2 mejoras concretas y de bajo riesgo en el camino más transitado de toda la app: guardar el score de un hoyo (`cargarHoyoLive_`, se llama hasta 72 veces por foursome por ronda). Ver Tarea 25 — "Nivel 1" del análisis.

---

## 🎯 Tarea para Claude Code — Tarea 25 (rendimiento, Nivel 1)

### Contexto: por qué elegimos justo estos 2 cambios

`cargarHoyoLive_` (`07_LiveScoring.gs`, línea ~211) es la función que se ejecuta cada vez que un jugador carga (o edita) el score de un hoyo — la acción más repetida de toda la app. El frontend ya usa "actualización optimista" para 3 de cada 4 (o 2 de cada 3, si la línea es de 3) jugadores en cada hoyo — les muestra el resultado antes de esperar al servidor. Pero el ÚLTIMO jugador de cada hoyo sí espera la respuesta real y completa, porque ahí es donde el servidor decide si corresponde un bonus (Long Drive / Best Approach). Ese es el momento que más se puede sentir "lento" hoy, y es el que vamos a acortar.

Encontramos 2 cosas concretas dentro de esa función que suman demora real sin aportarle nada al jugador — las dos son cambios chicos, acotados, y no tocan la lógica de negocio ni los candados de concurrencia (esos los dejamos como están, a propósito, por el historial de bugs de carrera que tuvimos en este proyecto — no vale la pena arriesgar ahí para ganar unas pocas milésimas).

---

### Parte A — Sacar la escritura de auditoría del camino que el jugador espera

Dentro de `cargarHoyoLive_`, después de guardar el score, hay esta línea:
```js
audit_('CARGAR_HOYO_LIVE', cargStr,
  { fecha: fStr, matriculaJugador: jugStr, hoyo: hoyoNum, score: scoreVal });
```
`audit_()` (`01_Utils.gs` línea ~66) escribe una fila en una planilla oculta de bitácora (`sh.appendRow(...)`) — es una escritura real y completa a Google Sheets, aparte de la del score. Como es SÍNCRONA (Apps Script espera a que termine antes de seguir), el jugador que carga el último score del hoyo tiene que esperar esta segunda escritura además de la del score en sí, para algo que es puramente interno (trazabilidad) y no afecta lo que ve en pantalla.

**Fix:** sacá esta llamada a `audit_()` de `cargarHoyoLive_`. El resto de las funciones del proyecto (que se llaman con mucha menos frecuencia — una vez por jugador por ronda, no una vez por hoyo) siguen auditando normalmente, no las toques. Si en algún momento hace falta trazabilidad de cada hoyo cargado, se puede reconstruir después mirando el historial de la planilla TARJETAS directamente (ahí queda el dato real igual), así que no se pierde información importante.

---

### Parte B — Sacar una lectura repetida de JUGADORES

Dentro de la misma función, `cachedRead_('jugadores', 300, getJugadores_)` se llama DOS veces (una para armar `ultimoCargadoPor`, otra más abajo para `buildLineaSnapshot_`). Aunque la segunda vez normalmente ya está en caché (así que no es tan grave como la Parte A), es una lectura de más sin necesidad.

**Fix:** llamá `cachedRead_('jugadores', 300, getJugadores_)` una sola vez al principio de la función, guardalo en una variable, y reusala en los dos lugares donde hace falta (`cargJug` y `jugMap2`).

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿confirmaste que sacaste `audit_()` SOLO de `cargarHoyoLive_`, y que las demás funciones del proyecto que auditan (`cargarTarjeta_`, acciones de admin, etc.) siguen intactas?

**R:** Sí. Eliminé las dos líneas de `audit_('CARGAR_HOYO_LIVE', ...)` de `cargarHoyoLive_`. Verifiqué con grep que en `07_LiveScoring.gs` la única `audit_` que queda es la de `setBonusGanador_` (línea 447) — correcta, no la toqué. Las demás funciones que auditan están en otros archivos (`04_Writes.gs`, `09_Resultados.gs`, etc.) y no fueron modificadas.

2. **Parte B:** ¿unificaste la lectura de `jugadores` en una sola variable? Confirmá que se sigue usando correctamente en los 2 lugares (`cargJug` y `jugMap2`).

**R:** Sí. El único `cachedRead_('jugadores', ...)` ahora está al principio del bloque post-flush, construye `jugMap` (antes eran dos bloques separados con `jugMap` y `jugMap2`). El `if (scoreVal !== '')` usa `jugMap[cargStr]` para `cargJug`. `buildLineaSnapshot_` recibe `jugMap` directamente (antes recibía `jugMap2`). Un solo cache hit en lugar de dos.

3. ¿Tocaste algo del candado (`lockKey`/`Utilities.sleep`) o de la lógica de qué jugador es "el último" del hoyo? (No debería hacer falta para esta tarea — si tocaste algo ahí, avisame explícitamente y por qué.)

**R:** No. El candado (líneas 277-295), el `flush()` dentro del `try/finally`, y toda la lógica de `bonusPendiente` y detección del último jugador quedan exactamente igual.

4. Hash y mensaje del commit.

**R:** `9596b8e` — Tarea 25: rendimiento cargarHoyoLive_ — sacar audit y unificar lectura jugadores

5. ¿Alguna duda?

**R:** No.
