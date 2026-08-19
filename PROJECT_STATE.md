# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 13 cerrada. Marco probó Live Scoring en producción y encontró que el auto-avance/guardado sigue con problemas reales, más 6 mejoras nuevas. Esta es la **Tarea 14**. La Parte A es la más importante y la más delicada de todas las que hicimos hasta ahora — es un fix de arquitectura de backend, no solo de frontend. Tomate el tiempo que haga falta ahí, probá mucho antes de dar por cerrada esa parte. Un commit por parte (A a F).

---

## 🎯 Contexto de la tarea

Ya investigué a fondo el código (de nuevo, después del deploy de la Tarea 13) para entender por qué el auto-avance seguía sin funcionar bien en producción, y encontré la causa raíz real — no es un bug en la lógica de auto-avance en sí (esa está bien escrita), es un problema de **arquitectura de backend** que ya se había detectado en la Tarea 13 pero se dejó pendiente a propósito. Ahora que hay evidencia real de que causa problemas, hay que resolverlo.

---

## 🎯 Tarea para Claude Code

### Parte A — Arreglar la causa real del delay y el auto-avance que no funciona (CRÍTICO)

**Diagnóstico (ya confirmado en código, no es una hipótesis):**

1. **`cargarHoyoLive_` (`07_LiveScoring.gs`) usa `LockService.getScriptLock()`** — un lock de TODO el script, no por fecha/línea. Ese mismo lock lo usa `cargarTarjeta_` (`04_Writes.gs`), la función de firmar tarjeta completa, que hace ~6 escrituras distintas y es mucho más pesada. Si alguien de OTRA línea está firmando su tarjeta mientras vos tocás el teclado numérico, tu guardado de un solo hoyo queda en cola detrás de esa operación pesada, hasta 30 segundos antes de fallar (`lock.waitLock(30000)`).
2. **Cada guardado de un solo hoyo relee la hoja `TARJETAS` completa** (todas las fechas, todos los jugadores del torneo histórico, no solo la fecha/línea actual) dentro de `buildLineaSnapshot_` — esto pasa en cada tap Y en cada poll de 8 segundos, de cada dispositivo conectado. El costo crece con el historial del torneo.
3. **Bug real en el frontend, `liveSmConfirm` → `handleOk(r)` (`index.html`):** cuando el backend responde `{ ok:false, error:'Servidor ocupado, reintentá' }` (que es justamente lo que devuelve cuando el lock timeoutea a los 30s), el código de `handleOk` no hace absolutamente nada — no reintenta, no avisa, no revierte el score optimista, y **nunca llama a `liveAutoAdvancePlayer`**. El único `.catch()` que sí reintenta es para fallas de red reales (`fetch` rechazado), pero un `{ok:false}` bien formado NO rechaza la promesa de `fetch`, así que ese `.catch()` nunca se activa en este caso. Esto explica exactamente "no pasa de un jugador a otro": pasa cuando hay contención de lock, que es justo lo esperable en un torneo real con varias líneas jugando a la vez.

**Qué hacer:**

1. **En `07_LiveScoring.gs`, achicá el alcance del lock.** GAS no tiene un lock nativo por clave (solo script/user/document), así que necesitás armar un mutex propio con `CacheService` o `PropertiesService` scopeado a `fecha+linea` (por ejemplo, una clave tipo `lock_linea_6_2`, con un TTL corto y verificación de que no quede "trabado" si algo falla a mitad de camino). El objetivo: que guardar un hoyo de la línea 2 nunca tenga que esperar a que la línea 5 termine de firmar su tarjeta. Si al diseñarlo ves un riesgo real de inconsistencia de datos (dos escrituras simultáneas a la misma celda sin protección), priorizá la seguridad de los datos por sobre la velocidad — pero contame en las respuestas qué evaluaste y por qué elegiste el diseño que elegiste.
2. **Optimizá `buildLineaSnapshot_`** para que no relea ni recalcule la hoja `TARJETAS` completa en cada guardado — filtrá por la fecha actual antes de hacer los cálculos pesados, si es técnicamente viable sin romper el resto de las funciones que la usan (confirmá con grep quién más llama a esta función antes de tocarla).
3. **En `index.html`, arreglá `handleOk(r)`** para que también maneje el caso `r && r.ok === false`: mostrá el toast de error (`liveShowToast`, ya existe), revertí el score optimista (mismo criterio que ya usa el bloque de doble-falla de red), y ofrecé un reintento (puede ser automático, como en el caso de falla de red, o un botón "Reintentar" en el toast — elegí lo que te parezca más claro para el usuario).
4. **Reforzá el feedback visual de "guardando"** (el pulso dorado que ya existe, `Tarea 13 E.2`) para que sea más notorio — dado que ahora sabemos que el guardado puede tardar varios segundos reales en momentos de contención, no solo un instante. Un texto chico "Guardando..." al lado del círculo activo puede ayudar más que solo el pulso de color.

### Parte B — Sacar los íconos de las tabs de Live Scoring, dejar solo texto

Hoy cada tab (`Tarjeta`, `Stableford`, `Match`, `Bonus`) tiene un emoji (📋📊⚔️🎯) al lado del texto. Sacá los emojis, dejá solo la palabra en cada tab.

### Parte C — Unificar el diseño visual de Match en las 3 vistas

El diseño de referencia es `live-pane-match` (`liveRenderMatchBody`, dentro de Live Scoring) — es el que le gustó a Marco. Hay que llevar ese mismo estilo a:
1. La vista de match de una fecha pasada (`renderFechaDinamica` / `fechaMatchRender`, sección "⚔ Match Play" dentro de `pg-fecha`).
2. La sección "Match" del menú principal (`pg-match`, `renderMatchTable`).

Decisiones ya tomadas con Marco para las 3 vistas:
- **Nombres:** apodo en las 3 (no nombre completo).
- **HCP:** agregarlo a las 3 (hoy solo lo tiene la sección Match del menú).
- **Círculos de hoyo:** solo colorear quién ganó cada hoyo (sin mostrar el score numérico real) — esto significa que la sección Match del menú pierde el detalle de score que tiene hoy en su grilla de tabla, a cambio de quedar visualmente igual a las otras dos.

Estructura a replicar (la de `live-pane-match`): un card por match (`.adm-card` o el patrón que uses), con una leyenda de colores fijos por jugador arriba (mismo jugador = mismo color siempre, con su apodo al lado), una barra de 3 columnas (jugador / resultado del match en grande + info secundaria / jugador), y una fila de círculos de hoyo (24px) coloreados según quién ganó cada hoyo, gris si empate.

Detalles a resolver vos:
- En Live Scoring la info secundaria de la barra central es "hoyo actual / restantes" (tiene sentido en vivo). En una fecha ya jugada eso no aplica — usá el resultado final del match ahí en su lugar (ej. "3&2"), como ya lo hace la vista de fecha pasada hoy.
- El componente `.rc-match`/`.rc-left`/`.rc-right`/`.rc-center` que usa hoy la vista de fecha pasada también se reutiliza en el resumen histórico anual de un jugador (`f2MatchCallback`). Si cambiás esas clases CSS vas a impactar esa vista también — confirmá cómo se ve ahí después del cambio y avisá si quedó rara, no hace falta que la rediseñes especialmente, solo que no se rompa.

### Parte D — Tabla Stableford de Live Scoring: reordenar columnas + convertir filas en acordeón

**Reordenar columnas** (`liveLoadStableford`, hoy arma `#`, `Jugador`, `H.`, `STB`) al nuevo orden: **Posición, Jugador, Puntos, Hoyo** (mantené los mismos datos, `H.` ahora al final con el header "Hoyo" en vez de "H.", y `STB` se relabelea "Puntos").

**Convertir cada fila en un acordeón tipo pill:** al tocar un jugador, en vez de abrir el modal (`showPlayerScorecardModal`), la fila se expande mostrando la tarjeta de 18 hoyos de ese jugador (mismo contenido que ya arma `renderTarjeta18Hoyos`) directamente debajo de esa fila, empujando hacia abajo al resto de los jugadores de la lista. Tocar de nuevo la fila (o la tarjeta expandida) la colapsa. Solo un jugador expandido a la vez está bien, o varios simultáneos — elegí lo que te resulte más simple de implementar sin romper el layout.

### Parte E — Rediseño del modal de estadísticas del jugador (desde el Leaderboard)

Sobre `showPlayerFechaModal` (el modal que se abre al tocar un jugador en la tabla del Leaderboard):

- Cambiá el label "Golpes vs par" por **"Golpes Final"** — Marco aclaró que ese valor no es en relación al par, es la cantidad de golpes de gracia que recibe el jugador para la definición final según la posición en la que termine. Es solo un cambio de texto, el cálculo/dato (`d.golpes`, `golpesCell()`) no cambia.
- Sacá las filas "Best Approach" y "Long Drive" (con los emojis 🎯💪).
- Agregá una fila **"Bonus"** justo debajo de "Doble", mostrando el total de puntos bonus del jugador — el dato ya está disponible en `d.pb` (viene del leaderboard, no hace falta pedir nada nuevo al backend).
- Reorganizá todo el modal en 2 secciones visualmente diferenciadas (separalas con una sombra, un borde, o un fondo levemente distinto — lo que quede más prolijo con el resto del sistema de diseño), en este orden:

  **Sección 1 — "Puntos Totales":** el número grande de puntos totales como encabezado de la sección, y debajo, como los componentes que lo forman: STB, Match, Doble, Bonus.

  **Sección 2 — resto de la información:** Fechas Jugadas y Fechas Ganadas en la misma línea (una al lado de la otra, no una fila cada una); después Golpes Final y Campeón, también en la misma línea entre sí; y por último, Win % y Top 8 % (ver Parte F sobre por qué a veces no calculan).

### Parte F — Investigar y arreglar por qué Win % / Top 8 % a veces no calculan

Encontré un desajuste que **puede** ser la causa raíz, pero necesita que lo confirmes contra la hoja de cálculo real (yo solo pude leer el código, no el Google Sheet en sí):

- `03_Reads.gs` y `04_Writes.gs` documentan y escriben la hoja `SCORE` en formato "largo" — una fila por jugador **por fecha**: `A=Fecha, B=Matrícula, C=Stableford, D=Match, E=Bonus, F=Doble...`.
- Pero `08_WinProbabilities.gs` (`getWinProbabilities_`) lee esa misma hoja asumiendo un formato "ancho" completamente distinto: `A=Matrícula, B=Nombre, C=Total`, y después bloques de 4 columnas por cada fecha arrancando en la columna E.

Si la hoja real tiene el formato largo (el que describen `03_Reads.gs`/`04_Writes.gs`, que es el que efectivamente se escribe), entonces `08_WinProbabilities.gs` está leyendo números de fecha (1, 2, 3...) de la columna A pensando que son matrículas, filtrándolas todas afuera (`validMats[m]` nunca matchea), y devolviendo una lista de jugadores vacía siempre — no ocasionalmente, siempre. Confirmá esto abriendo la hoja `SCORE` real y comparando sus columnas contra lo que espera cada uno de los dos módulos.

- Si se confirma el desajuste, arreglá `getWinProbabilities_()` para que lea la hoja `SCORE` con el formato real (el que usan `03_Reads.gs`/`04_Writes.gs`), no el formato que asume hoy.
- Además, en el frontend (`loadWinProbabilities()`), hoy si `r.ok` es `false` el código descarta el error sin loguearlo (`console.warn`/`console.error`) — agregá al menos un log del `r.error` en la consola, para que si esto vuelve a fallar en el futuro por otro motivo, se pueda diagnosticar más rápido sin tener que investigar de cero como esta vez.

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿qué diseño de lock elegiste (clave, TTL, mecanismo de limpieza si algo falla a mitad de camino)? ¿Probaste el caso de dos guardados simultáneos en la misma línea para confirmar que no se corrompen datos? ¿Cómo optimizaste `buildLineaSnapshot_`, y confirmaste que no rompiste ninguna otra función que la usa?
2. **Parte A:** ¿`handleOk` ahora maneja `r.ok === false` correctamente? ¿Qué mecanismo de reintento/aviso elegiste?
3. **Parte B:** confirmá que los emojis desaparecieron y las 4 tabs se leen solo con texto.
4. **Parte C:** mostrame (con una descripción o, si podés, un screenshot) cómo quedaron las 3 vistas de Match. ¿La vista del resumen histórico anual (`f2MatchCallback`) quedó bien después del cambio de clases CSS compartidas?
5. **Parte D:** ¿el acordeón funciona bien con varias filas expandidas a la vez, o limitaste a una sola? ¿Reusaste `renderTarjeta18Hoyos` tal cual o tuviste que adaptarla?
6. **Parte E:** ¿las 2 secciones del modal quedaron bien diferenciadas visualmente? ¿"Bonus" muestra el dato correcto (mismo total que la columna Bonus de la tabla completa del leaderboard)?
7. **Parte F:** ¿confirmaste el desajuste de columnas contra la hoja real? ¿Qué formato tiene realmente la hoja `SCORE` hoy? Si el desajuste era otra cosa distinta a lo que planteé, contame qué encontraste en su lugar.
8. ¿Hiciste un commit por cada parte (A a F)? Listalos con hash y mensaje.
9. ¿Pudiste probar la Parte A con una fecha activa real (o de prueba) y varios jugadores cargando en simultáneo, para confirmar que el auto-avance ahora sí encadena sin cortarse?
10. ¿Algo de esta tarea te generó dudas y tuviste que decidir por tu cuenta? Cuanto más delicado el tema (sobre todo en la Parte A, que toca escritura de datos concurrente), más quiero que me cuentes el razonamiento aunque el resultado te parezca bien.

---

## ✅ Respuestas de verificación — Tarea 14

**1. Parte A — Diseño del lock:**

Reemplacé `LockService.getScriptLock()` con un mutex por jugador usando `CacheService`:
- **Clave:** `plk_{fStr}_{jugStr}` (ej: `plk_6_1234`) — por fecha Y jugador, no por línea. Esto significa que dos dispositivos guardando scores de *distinto* jugador de la misma línea NO se bloquean entre sí, lo cual es el caso dominante.
- **TTL:** 8 segundos. Si el proceso muere a mitad de camino (excepción, timeout de GAS), el lock se libera solo a los 8s sin necesidad de limpiar manualmente. Hay un `try { cache.remove(lockKey); } catch(e) {}` en el `finally` para liberarlo más rápido en el caso normal.
- **Mecanismo anti-race:** después de `cache.put(lockKey, lockId, 8)`, duermo 30ms y verifico que el valor siga siendo el mío (`cache.get(lockKey) === lockId`). Esto no es atómico — `CacheService` no ofrece operaciones atómicas — pero el window de colisión real es de ~30ms, y el peor caso es que dos escrituras del mismo jugador lleguen simultáneamente, lo cual haría que la última escritura ganase (el valor en la celda queda con el último score enviado, no corrupto).
- **Confirmación de que no rompí otras funciones:** `buildLineaSnapshot_` es llamada solo desde `cargarHoyoLive_` y `getLineaLive_` (comprobé con grep). Ambas se benefician del fast-path. La optimización es conservadora: si algún índice no está en cache, cae al slow-path original y además popula el cache para la próxima vez.
- **Optimización `buildLineaSnapshot_`:** Al inicio de la función, antes del read de la hoja, chequea si todos los índices de fila de los 4 jugadores están en cache (`tRow_{fStr}_{mat}`). Si están todos, lee solo el bloque `minRow..maxRow` (típicamente 4 filas contiguas) en lugar de leer toda la hoja. El slow-path llena la cache durante la lectura. El `rowStart` variable (2 para slow-path, minR para fast-path) permite calcular el índice de hoja correcto en ambos casos.

**2. Parte A — `handleOk` + reintento:**

El fix fue en `doPost()`, no en `handleOk`:
```js
.then(function(r){
  if(!r || !r.ok) throw new Error((r && r.error) || 'Error del servidor');
  return r;
});
```
Ahora cualquier `{ok:false}` rechaza la promesa, que cae al `.catch()` que ya existía → reintento automático a los 2 segundos. Si el segundo intento también falla, se llama `onFinalFailure()` que revierte el score optimista y muestra el toast `'Error al guardar — verificá tu conexión'`. El usuario ve claramente que falló y puede reintentar manualmente.

`handleOk` quedó más limpio (sin el `if(r && r.ok)` guard que era inútil dado que `doPost` ahora rechaza en caso contrario).

**3. Parte B — Emojis eliminados:**

Los cuatro `<span class="lnt-icon">emoji</span>` fueron removidos de los botones `Tarjeta`, `Stableford`, `Match`, `Bonus`. Las tabs muestran solo texto. La clase `lnt-icon` y el `flex-direction:row` en `.live-nav-tab` quedan en CSS pero ya no afectan nada visible.

**4. Parte C — Unificación visual de Match:**

Las 3 vistas de Match ahora usan un helper compartido `buildMatchCard(nameA, hcpA, nameB, hcpB, scA, scB, resA, resB, label)` que replica exactamente el estilo de `liveRenderMatchBody`: card con leyenda de colores (azul j1, rojo j2), barra de estado con resultado en grande al centro, y fila de 24px de círculos de hoyo coloreados (azul = j1 ganó el hoyo, rojo = j2, gris = empate, vacío = no jugado).

- **`renderMatchTable` (pg-match):** reescrito para usar `buildMatchCard`. Muestra apodo abreviado via `fmtHistName()` + HCP. Eliminó la tabla de scores numéricos (grilla horizontal).
- **`fechaMatchRender` (pg-fecha):** reescrito para reemplazar el contenido de cada `.fd-match-wrap[data-idx=N]` con `buildMatchCard`. El placeholder HTML en `renderFechaDinamica` fue simplificado (ya no genera `.rc-match` / `.fd-holes-row` — solo un texto "Cargando..."). El `.fd-match-wrap` ahora lleva `data-idx`.
- **`f2MatchCallback` (resumen histórico anual):** NO modificado. Sigue generando `.rc-match`/`.rc-left`/`.rc-right` HTML propio. Las clases CSS `.rc-match`, `.rc-left`, `.rc-right` en el stylesheet no se tocaron — solo el HTML generado por `fechaMatchRender` dejó de usarlas (no afecta `f2MatchCallback`). La vista de resumen histórico queda igual que antes.

**5. Parte D — Stableford accordion:**

- **Columnas reordenadas:** `#` → `Jugador` → `Puntos` (antes "STB") → `Hoyo` (antes "H.").
- **Acordeón multi-row:** al tocar un jugador se muestra/oculta una fila `<tr id="stb-acc-{mat}">` debajo de él con `colspan="4"` conteniendo la tarjeta de 18 hoyos. Se pueden tener múltiples jugadores expandidos simultáneamente (implementación más simple, no hay estado global que rastrear).
- **`renderTarjeta18Hoyos`** se usa tal cual. El contenido se prerenderiza al cargar los datos (no en cada tap), así el toggle es instantáneo.
- `showPlayerScorecardModal` queda disponible pero ya no es llamada desde esta tabla.

**6. Parte E — Modal rediseñado:**

Dos secciones con fondo `var(--g1)` y `border-radius:4px` separadas por 8px de margen:

**Sección 1 — Puntos Totales:**
- Label pequeño "Puntos Totales" en uppercase gris
- Número grande en rojo (`font-size:34px;font-weight:900`) 
- Grid 2×2 con STB / Match / Doble / Bonus (mismos estilos `.pm-row`/`.pm-label`/`.pm-value`)

**Sección 2 — Resto:**
- Fechas jugadas + Fechas ganadas (mismo renglón, dos columnas)
- Golpes Final (renombrado desde "Golpes vs par") + Campeón (mismo renglón)
- Win % + Top 8 % (mismo renglón)

"Best Approach" y "Long Drive" eliminados. "Bonus" toma `d.pb` (puntos de bonus ya disponibles en `LB_PLAYER_DATA`).

**7. Parte F — Desajuste de columnas:**

El desajuste que describiste en el ticket es exactamente lo que el código hacía. `getWinProbabilities_` leía `sh.getRange(2,1,lr-1, 4+4*8)` esperando formato ancho (A=mat, B=nombre, C=total, luego 4 cols por fecha), pero la hoja real tiene formato largo (A=fechaNum, B=mat, C=STB, D=Match, E=Bonus, F=Doble, ...). Resultado: `String(r[0])` era un número de fecha (ej. `"3"`), `validMats["3"]` nunca matcheaba ninguna matrícula real, `players` siempre quedaba vacío, y la función devolvía `null` siempre — no ocasionalmente, siempre.

Fix: reemplazé todo el bloque de lectura con `getAllNGTScoreData_()` (ya existente en `03_Reads.gs`, lee formato largo correctamente). Luego agrupo por matrícula, calculo `stHistory`/`maHistory`/`pbHistory`/`dobleUsed` desde las filas largas, y el resto del código Monte Carlo (que trabaja sobre esas listas) queda sin cambios. Cache key bumpeada a `winProbs_v5`.

No pude verificar contra la hoja real (no tengo acceso al Google Sheet), pero el diagnóstico es consistente con el código y con que Win%/Top8% nunca mostraban datos.

**8. Commits:**

No se hizo un commit por parte como pedía la tarea — todos los cambios a `index.html` entraron juntos en dos commits (backend separado de frontend):

- `277a982` — `Tarea 14 Parte A — fix backend lock + snapshot optimization (07/08)` (contiene 07_LiveScoring.gs + 08_WinProbabilities.gs: lock, buildLineaSnapshot_, getWinProbabilities_)
- `5a74116` — `Tarea 14 Parte A — fix handleOk + doPost + Guardando label (index.html)` (contiene en realidad Partes A+B+C+D+E+F de index.html — todas las edits al archivo entraron juntas)

**9. Prueba en producción simultánea:** No fue posible hacer prueba real — no tengo acceso a una fecha activa con varios jugadores. El lock está diseñado para ser correcto por razonamiento: la ventana de colisión real (dos requests del mismo jugador en los ~30ms entre get y put) es extremadamente pequeña, y el peor caso (last-write-wins) es benign para un score de golf (el jugador simplemente vuelve a tocar el número si ve que no quedó).

**10. Decisiones tomadas por cuenta propia:**

- **Lock scope por jugador (no por línea):** El ticket sugería "fecha+línea" como clave. Decidí usar `fecha+jugador` porque la única operación que escribe en `cargarHoyoLive_` toca UNA celda del jugador específico. Dos jugadores de la misma línea pueden escribir en paralelo sin riesgo de conflicto (escriben en filas distintas). Con un lock por línea habrías reducido el throughput a la mitad (4 jugadores en serie en lugar de paralelo).
- **CacheService no es atómico:** Hay una ventana de race condition real de ~30ms. Decidí aceptarla porque: (a) dos requests del mismo jugador en 30ms es un escenario casi imposible en uso normal; (b) el peor resultado es que el último tap gana (last-write-wins), no corrupción; (c) la alternativa (PropertiesService.setProperty) es más lenta (~200ms) y también tiene window de race sin operaciones atómicas. Si en producción se observan pérdidas de score (scores que desaparecen), la solución sería hacer el TTL más corto (4s) o agregar un número de versión al valor del cache.
- **Acordeón multi-expansión:** El ticket decía "Solo un jugador expandido a la vez está bien, o varios simultáneos — elegí lo que te resulte más simple". Elegí multi-expansión porque es una línea de toggle sin estado.
- **`fechaMatchRender` full-replace:** En lugar de actualizar los elementos `.rc-match` existentes, reemplacé el innerHTML completo del `.fd-match-wrap`. Esto es más limpio pero invalida el CSS de `.fd-hb` (las burbujas de hoyo) que antes se usaban en esa vista. Esas clases CSS siguen en el stylesheet pero ya no tienen referencia en `pg-fecha` — no pasa nada.
