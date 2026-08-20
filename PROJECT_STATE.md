# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Marco probó la fecha 7 completa (1 línea, 4 jugadores) después del hotfix y encontró varios problemas de cálculo y de datos — algunos graves. Me metí a fondo en el código (no en la app en vivo) y **encontré 3 bugs estructurales reales, confirmados leyendo la lógica del servidor con calma**, más 1 punto que ya está bien y probablemente es caché del navegador. Es una tarea con datos delicados — **la Parte 0 es un diagnóstico, hacela primero y no borres la fecha 7 todavía** (Marco la dejó a propósito para que la analicemos).

---

## 🎯 Tarea para Claude Code — Tarea 19

### Parte 0 — Diagnóstico: sacar los datos reales de la fecha 7 (no tocar nada todavía)

Antes de tocar código, necesito ver los números reales para confirmar una sospecha puntual (el resultado de match "8&7" en vez de "7&6" entre Racho y Persa). Sin esto estaría adivinando.

Desde el editor de Apps Script (podés usar una función temporal de debug, o el editor de la hoja directamente), sacá y pegá en la respuesta de verificación:

1. **Hoja TARJETAS, fila de Racho (matrícula 89837) en fecha 7:** HCP (col C) y los 18 scores (cols E..V), tal cual están guardados.
2. **Hoja TARJETAS, fila de Persa en fecha 7:** mismo dato (HCP + 18 scores).
3. **Hoja MATCH, la fila (o filas) de fecha 7 donde aparecen Racho y Persa:** columnas B..H completas (fecha, mat1, mat2, res1, pts1, res2, pts2).
4. **Hoja SCORE (NGT DB), TODAS las filas donde col A = "7"** (la fecha) — todas las columnas A..H de cada fila. Acá es donde espero ver la matrícula 89837 repetida que reportó Marco.

No hace falta que interpretes estos datos vos — solo pegalos tal cual en la respuesta. Yo los reviso.

---

### Parte A — SCORE (NGT DB) nunca reserva filas al crear la fecha → duplicados por carrera

**Causa raíz encontrada:** cuando se crea una fecha (`crearFecha_`, `04_Writes.gs`), se crean filas nuevas en TARJETAS y en STB para cada jugador — pero **nunca se crea la fila correspondiente en la hoja SCORE (NGT DB)**. Esa fila recién se crea la primera vez que alguien llama `setNGTScoreField_` (cuando un jugador firma su tarjeta), y esa función busca la fila (`findNGTScoreRow_`) y si no la encuentra, la crea en `sh.getLastRow() + 1` — **sin ningún lock que lo proteja**.

El problema: el lock que sí existe en `cargarTarjeta_` (`plk_{fecha}_{matricula}`) es **por jugador**, a propósito, para que las 4 tarjetas de una línea se puedan guardar en paralelo (así fue diseñado desde la Tarea 14). Eso significa que cuando 4 jugadores tocan "Finalizar Ronda" casi al mismo tiempo (que es lo normal, `liveFinalizar()` dispara los 4 `cargarTarjeta_` juntos con `Promise.all`), sus 4 ejecuciones **sí corren en paralelo**, y **nada protege la creación de fila en SCORE**. Si dos jugadores distintos preguntan "¿existe ya mi fila en fecha 7?" al mismo tiempo y ninguno la tiene todavía, los dos pueden calcular el mismo "próxima fila vacía" y escribir uno encima del otro — dejando una fila corrupta y, en la siguiente escritura de ese mismo jugador (unas líneas después, en el mismo `cargarTarjeta_`, para Match o Bonus), como esa fila ya no tiene su matrícula, se crea OTRA fila nueva para él. Esto explica exactamente lo que viste: la matrícula 89837 duplicada, puntos de stableford en 0 en algunas filas, y puntos de match parciales repartidos entre las dos filas.

**Fix (el más prolijo — elimina la carrera de raíz en vez de solo mitigarla):** en `crearFecha_`, cuando se agregan los jugadores nuevos a TARJETAS y STB (mismo bloque, ~línea 49-70), agregá también la creación batch de sus filas en SCORE (NGT DB): una fila `[fecha, matricula, 0, 0, 0, 0, 0, 0]` por jugador nuevo, escrita de una sola vez con `setValues` (igual patrón que ya se usa para TARJETAS/STB ahí mismo). Como `crearFecha_` corre una sola vez, de punta a punta, sin paralelismo, esto no tiene riesgo de carrera. Con esto, para cuando cualquier jugador firma su tarjeta, su fila en SCORE **ya existe siempre** — `setNGTScoreField_` deja de necesitar crear filas nunca en el flujo normal, y el problema de raíz desaparece (no hace falta agregar un lock nuevo, que solo mitigaría el síntoma).

Dejá el camino de "crear fila si no existe" en `setNGTScoreField_` como está, como red de seguridad para fechas viejas que ya existían antes de este fix — pero avisame en la respuesta si se te ocurre una forma de detectar y loguear (con `audit_`) si ese camino se llega a usar en una fecha nueva, para saber si en algún momento se nos escapa un caso.

---

### Parte B — PosFecha y PosLeaderboard nunca se calculan solos al terminar una fecha

**Causa raíz encontrada:** busqué en todo el código quién escribe la columna G (PosFecha) de SCORE, y la única función que lo hace es `sumarGanadorFecha_()` (`09_Resultados.gs`) — y esa función **solo se llama desde `setBonusWinners_`**, que es una acción de administrador para cuando el admin cambia manualmente el ganador de un bonus. **Nada en el flujo normal de juego (Live Scoring → Finalizar Ronda → `cargarTarjeta_`) llama nunca a `sumarGanadorFecha_`.** Por eso PosFecha queda en 0 siempre que una fecha se juega y se termina de la forma normal (como hizo Marco). Lo mismo pasa con PosLeaderboard (columna H): solo se escribe si `recalcularTotalesScore_` recibe un segundo parámetro `fechaParaPosLb`, y la única llamada dentro de `cargarTarjeta_` (línea ~608) es `recalcularTotalesScore_(null)` — sin ese segundo parámetro.

Es el mismo patrón que ya encontramos con "Finalizar Ronda no guarda nada" (Tarea 15) y con Long Drive/Best Approach (Tarea 18 Parte C): dos sistemas que deberían hablarse y no se hablan.

**Fix:** en `cargarTarjeta_`, después de que se completan todos los escrituras (después de la línea 608, donde ya se llama a `recalcularTotalesScore_(null)`), agregá una verificación de "¿esta fecha ya está completa?" — reusá el mismo criterio que ya existe en `getFechaActiva_()` (`03_Reads.gs`, todos los jugadores de todas las líneas de la fecha tienen el Hoyo 1 cargado, que en la práctica significa que ya jugaron completo). Si la fecha está completa, llamá a `sumarGanadorFecha_(fecha)` y después a `recalcularTotalesScore_(null, fecha)` (con el segundo parámetro esta vez, para que también escriba PosLeaderboard). Como esto puede dispararse desde el `cargarTarjeta_` de más de un jugador (los 4 terminan casi juntos), asegurate de que sea seguro llamarlo varias veces seguidas sin romper nada (mirando el código, `sumarGanadorFecha_` y `recalcularTotalesScore_` ya son puramente recalculadoras — no acumulan, recalculan desde cero — así que en principio es seguro, pero confirmalo vos también).

---

### Parte C — Bonus (LD/BA) se puede perder si se firma la tarjeta antes de que el bonus termine de guardarse

**Causa probable (a confirmar con los datos de la Parte 0 si hace falta):** en la Tarea 18 Parte C arreglamos que `buildLineaSnapshot_` combine el valor de `meta.bonusEstado` — pero eso solo afecta lo que se **muestra en vivo**. Lo que se **persiste de verdad** en TARJETAS (columnas W/X) sale de lo que el cliente manda en el POST de `cargarTarjeta` (`ld: jug.ld?1:0`), que a su vez sale del estado local `LIVE_LINEA_DATA` del navegador — que solo se actualiza cuando llega la próxima respuesta del polling (cada ~4 segundos) o una respuesta directa. Si un jugador gana el bonus y, en los segundos siguientes (antes de que el próximo poll traiga el dato actualizado), termina los hoyos que le faltan y se dispara "Finalizar Ronda", su tarjeta se firma con `ld`/`ba` todavía en `false` en el estado local — y como nada vuelve a re-firmar esa tarjeta después, el bonus queda perdido para siempre en TARJETAS/SCORE aunque el picker haya guardado bien el ganador en `FECHA_META.bonusEstado`.

**Fix:** en vez de confiar solo en lo que manda el cliente, hacé que `cargarTarjeta_` (`04_Writes.gs`) también consulte `getFechaMeta_(fecha).bonusEstado` directamente en el servidor — el mismo chequeo que ya escribiste en `buildLineaSnapshot_` para la Tarea 18 Parte C (comparar matrícula y lineaNum) — y lo combine con OR al valor que mandó el cliente (`wantsLD = wantsLD || bonusEstado.ld coincide`). Así, sin importar si el cliente llegó a enterarse a tiempo o no, el servidor es la fuente de verdad final para quién ganó el bonus.

---

### Parte D — Nombres en blanco sobre match coloreado: revisé de nuevo y el código YA está bien

Repasé otra vez, con calma, los 3 lugares donde se arma la tarjeta de match (`buildMatchCard`, usada por `renderMatchTable`, `fechaMatchRender` Y `liveRenderMatchBody` — confirmé que las tres pasan por la misma función compartida). Los tres correctamente ponen `color:#fff` en el nombre del ganador cuando el fondo se pinta de azul o rojo (línea ~3200-3201 de `index.html`). No hay ningún código roto acá — coincide con lo que ya habíamos confirmado en la Tarea 17 Parte D.

**No hace falta que toques nada de esto.** Lo más probable es que el navegador de Marco tenga cacheada una versión vieja de `index.html` de antes de que este código existiera. Yo le voy a pedir que haga un refresh forzado (Ctrl+Shift+R o vaciar caché) y que mande una captura nueva si el problema sigue después de eso.

---

## ❓ Preguntas de verificación

1. **Parte 0:** pegá los 4 bloques de datos tal cual (no hace falta que los interpretes).
2. **Parte A:** ¿agregaste la creación batch de filas SCORE en `crearFecha_`? ¿Probaste (mentalmente o de verdad) que crear una fecha nueva con 4 jugadores deja 4 filas en SCORE con ceros, listas antes de que nadie juegue?
3. **Parte B:** ¿dónde exactamente enganchaste el chequeo de "fecha completa"? ¿Reusaste el criterio de `getFechaActiva_` o escribiste uno nuevo? ¿Por qué?
4. **Parte C:** ¿confirmaste que el fix funciona incluso si el bonus se elige DESPUÉS de que la tarjeta ya se había firmado una vez (osea, sin depender de que se dispare una re-firma)?
5. ¿Hiciste un commit por parte? Hash y mensaje de cada uno.
6. ¿Algo de esta tarea te generó dudas o encontraste algo que no cuadra con mi diagnóstico? Contame — esta vez es sobre datos reales de una fecha jugada, prefiero que me avises si algo no cierra en vez de forzar un fix que no corresponde.

**Importante:** no borres ni resetees la fecha 7 hasta que yo confirme que ya la revisé con los datos de la Parte 0.

---

## ✅ Respuestas de verificación — Tarea 19

**1. Parte 0 — Datos de la fecha 7:**

No puedo acceder a Google Sheets desde el entorno local. Para obtener los datos necesitás correr manualmente en el editor de Apps Script una función de debug como:

```js
function debugFecha7() {
  const sh = SpreadsheetApp.getActive().getSheetByName('TARJETAS');
  const data = sh.getDataRange().getValues();
  const f7 = data.filter(r => String(r[0]).trim() === '7');
  Logger.log('TARJETAS fecha 7:');
  f7.forEach(r => Logger.log(r.join(' | ')));

  const match = SpreadsheetApp.getActive().getSheetByName('MATCH');
  const mdata = match.getDataRange().getValues();
  const m7 = mdata.filter(r => String(r[1]).trim() === '7');
  Logger.log('MATCH fecha 7:');
  m7.forEach(r => Logger.log(r.join(' | ')));

  const score = SpreadsheetApp.getActive().getSheetByName('SCORE');
  const sdata = score.getDataRange().getValues();
  const s7 = sdata.filter(r => String(r[0]).trim() === '7');
  Logger.log('SCORE fecha 7:');
  s7.forEach(r => Logger.log(r.join(' | ')));
}
```

Los datos de TARJETAS, MATCH y SCORE estarán en el log de Apps Script.

**2. Parte A — Pre-creación de filas SCORE en `crearFecha_`:**

Sí. Dentro del bloque `if (newJugMats.length)` en `crearFecha_`, después del STB write, se agrega:

```js
const ngtScoreSh = getNGTScoreSheet_();
if (ngtScoreSh) {
  const scoreNext = ngtScoreSh.getLastRow() + 1;
  ngtScoreSh.getRange(scoreNext, 1, newJugMats.length, 8)
    .setValues(newJugMats.map(function(m) { return [String(fecha), m, 0, 0, 0, 0, 0, 0]; }));
}
```

Simulación mental con 4 jugadores (mats A,B,C,D) creando fecha 8:
1. `crearFecha_` corre una sola vez, secuencial
2. STB: 4 filas `[8, A]`, `[8, B]`, `[8, C]`, `[8, D]` (2 cols)
3. SCORE: 4 filas `[8, A, 0, 0, 0, 0, 0, 0]`, `[8, B, ...]`, etc.
4. Cuando los 4 jugadores firman en paralelo, `findNGTScoreRow_("8", "A")` ya encuentra la fila → no hay `sh.getLastRow() + 1` competitivo → raza eliminada.

**3. Parte B — Completeness check en `cargarTarjeta_`:**

Enganchado DESPUÉS de `recalcularTotalesScore_(null)` (línea ~608), dentro de un `try/catch` para que no bloquee la tarjeta si algo falla.

No reutilicé directamente el criterio de `getFechaActiva_` (esa función tiene mucho más lógica: calendar lookup, horario, meta). Escribí uno nuevo más acotado que hace exactamente lo necesario:

```js
const checkData = sh.getRange(2, 1, neCheck - 2, 5).getValues();
const jugFecha = checkData.filter(r => rf===fStr && rm && !rm.startsWith('INV'));
allDone = jugFecha.length > 0 && jugFecha.every(r => r[4] !== '' && r[4] !== null...);
if (allDone) {
  sumarGanadorFecha_(fStr);
  recalcularTotalesScore_(null, fStr);
}
```

Mismo criterio que `getFechaActiva_` para "completada": col E (Hoyo1, r[4]) ≠ vacío. Elegí re-leer la hoja en lugar de reusar `allRows` porque `allRows` fue leído antes de que se escribiera la tarjeta del jugador actual — habría tenido que parchear en memoria el valor de Hoyo1 del jugador actual.

Sobre idempotencia: revisé `sumarGanadorFecha_` y `recalcularTotalesScore_`. Ambas recalculan todo desde cero — no acumulan, no incrementan. Llamarlas varias veces seguidas (por los 4 jugadores firmando casi al mismo tiempo) produce el mismo resultado cada vez. ✓

**Bug adicional encontrado en `sumarGanadorFecha_` y `calcularGanadoresFechas_` (no estaba en el diagnóstico):**

Al leer TARJETAS usaban `getRange(2, 2, ...)` (empezando en col B = mat) pero toda la lógica de indexación espera col A (r[0]=fecha, r[1]=mat, r[2]=hcp, r[3]=canchaId, r[4..21]=H1..H18). Con col B, r[0]=mat y el filtro `r[0] === fStr` nunca matchea → `fechaRows` siempre vacía → ranking siempre vacío → PosFecha nunca se escribe.

Esto explica por qué PosFecha era 0 INCLUSO cuando `setBonusWinners_` llama a `sumarGanadorFecha_` (la función existe pero estaba rota). Corregido: ambas funciones ahora leen desde col A (1) con 25 columnas en vez de 24.

**4. Parte C — LD/BA desde bonusEstado en cargarTarjeta_:**

El fix cubre el caso race condition (bonus asignado antes de firmar, pero LIVE_LINEA_DATA del cliente aún no se actualizó). Convirtí `const wantsLD`/`const wantsBA` en `let` y agrego:

```js
try {
  const _bonusEst = (getFechaMeta_(String(fecha)).bonusEstado) || {};
  const _mStr = String(matricula).trim();
  if (!wantsLD && _bonusEst.ld && String(_bonusEst.ld.matricula||'').trim()===_mStr) wantsLD=true;
  if (!wantsBA && _bonusEst.ba && String(_bonusEst.ba.matricula||'').trim()===_mStr) wantsBA=true;
} catch(_be) {}
```

El check está antes de la validación de unicidad (línea 288) para que sea consistente desde el principio.

**¿Funciona si el bonus se elige DESPUÉS de que la tarjeta ya fue firmada?** → NO. Si la tarjeta ya fue firmada (cols W/X ya escritas con 0) y después se elige el bonus, `cargarTarjeta_` no se vuelve a llamar sola. En ese caso el admin tiene que usar `setBonusWinners_` (flujo admin existente) para corregir cols W/X. El fix en `cargarTarjeta_` solo cubre la race condition durante el flujo normal (bonus elegido durante la ronda, carrera de pocos segundos con el POST de firma).

**5. Commits:**

- `db74b3e` — `Tarea 19 Parte A — crearFecha_ pre-crea filas SCORE en NGT DB para eliminar race condition` (incluye también Partes B y C de 04_Writes.gs)
- `ede89b4` — `Tarea 19 Parte B — sumarGanadorFecha_ y calcularGanadoresFechas_ leen TARJETAS desde col A (fix bug col B) + cargarTarjeta_ llama sumarGanadorFecha_ al completarse la fecha`

**6. Dudas y hallazgos extra:**

- **Bug col B (no estaba en el diagnóstico):** Confirmado leyendo el código — `sumarGanadorFecha_` y `calcularGanadoresFechas_` leían desde col 2 pero la lógica espera col 1. Esto es lo que hacía que PosFecha nunca se escribiera aun cuando `setBonusWinners_` la llamaba. Corregido como parte de la Parte B.

- **audit_ cuando setNGTScoreField_ crea filas inesperadamente:** Ya existe un `audit_('SCORE_ROW_MISMATCH', ...)` cuando la fila encontrada no coincide (línea ~201 de 03_Reads.gs). Para detectar la creación de filas nuevas en fechas nuevas (el path `row < 0`), se podría agregar un `audit_('SCORE_ROW_CREATED', 'system', {fecha, mat})` en `setNGTScoreField_` antes de la línea `sh.getRange(row, 1, 1, 8).setValues(...)`. No lo implementé porque sería un cambio a `03_Reads.gs` no pedido explícitamente — lo dejo para que vos decidas.

- **Parte 0 (datos de fecha 7):** No tengo acceso a Google Sheets desde el entorno local. Necesitás correr la función de debug en Apps Script directamente. Los datos de la fecha 7 no se tocan con estos commits — la fecha sigue intacta para tu revisión.
