# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: la Tarea 21 quedó cerrada — deployada, verificada, y `calcularGanadoresFechas_` confirmó que ningún ganador de fecha cambió con el fix del 85%. Marco probó el botón "Recalcular Fecha" en la fecha 7 para preparar la próxima prueba, y encontró un bug nuevo: tira el error `✗ No se encontró cancha para fecha 7`. Investigué y **no es un problema de los datos de la fecha 7** — es un bug real de código, y no está solo: encontré el mismo error repetido en 4 funciones distintas del proyecto, todas con la misma causa. Ver Tarea 22.

---

## 🎯 Tarea para Claude Code — Tarea 22

### 4 funciones leen la hoja TARJETAS con columnas que ya no existen — quedaron desactualizadas de una versión vieja

**Contexto para entender el problema:** la hoja TARJETAS hoy tiene esta estructura real (confirmada cruzando contra el código que la ESCRIBE, `crearFecha_` en `04_Writes.gs`):

- Col A = fecha
- Col B = matrícula
- Col C = HCP de juego
- Col D = canchaId
- Col E a V = Hoyo 1 a Hoyo 18
- Col W = Long Drive
- Col X = Best Approach
- Col Y = color de tee

Encontré 4 funciones que en algún momento del pasado quedaron escritas para una estructura VIEJA y distinta de TARJETAS (con una columna "nombre" y una columna "cancha" de texto que ya no existen, y con el HCP y el color de tee en otras columnas) y nunca se actualizaron cuando la hoja cambió a la estructura de arriba. Las 4 comparten el mismo error de fondo: leen desde la columna equivocada, así que terminan comparando cosas que no corresponden (por ejemplo, una matrícula contra un número de fecha) y nunca encuentran lo que buscan.

---

### Parte A — `recalcularHcpFecha_` (`05_HCP.gs`, línea ~502): el bug que Marco encontró (botón "Recalcular Fecha")

Empieza a leer TARJETAS desde la columna B (no A), así que lo que la función cree que es "fecha" (`row[0]`) en realidad es la matrícula del jugador — comparar una matrícula (ej. "89837") contra un número de fecha (ej. "7") nunca da igual, así que el bucle nunca encuentra ninguna fila de esa fecha, y termina devolviendo "No se encontró cancha" — esto pasa siempre, para cualquier fecha, no solo la 7.

**Ojo, hay un segundo problema más serio escondido acá, que por suerte nunca llegó a ejecutarse:** si el bug de lectura no existiera, la función escribiría el HCP recalculado en la columna E (`sh.getRange(i + 2, 5).setValue(newHcp)`), pero la columna E real es el Hoyo 1, no el HCP (que está en la C). Es decir, de rebote, el primer bug (que corta con error antes de llegar a esto) evitó que un segundo bug pisara los puntajes del Hoyo 1 de todo el mundo con un número de hándicap. Hay que corregir las dos cosas juntas.

**Fix:**
```js
const nextEmpty = findNextEmptyRow_(sh, 1);   // antes: findNextEmptyRow_(sh, 2)
if (nextEmpty <= 2) return { ok: false, error: 'TARJETAS vacía' };
const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();
// r[0]=fecha, r[1]=matricula, r[2]=hcp, r[3]=canchaId, r[4..21]=H1..H18, r[22]=LD, r[23]=BA, r[24]=colorTee
```
Ajustá el resto de la función: `canchaId` sale de `row[3]`, `colorTee` de `row[24]` (ya no hay columna de "nombre de cancha" — no hace falta, `buildHcpJuegoMap_` en `03_Reads.gs` línea 614 matchea por `canchaId` solo, con el nombre vacío funciona igual). El chequeo de "no encontrado" pasa a ser `if (!canchaId) return {...}`. Y la escritura del HCP nuevo tiene que ir a la **columna 3 (C)**, no a la 5: `sh.getRange(i + 2, 3).setValue(newHcp);`.

---

### Parte B — `armarLineas_`, rama "modo gestionar" (`06_ArmarLineas.gs`, línea ~50-66)

Mismo problema exacto: `shT.getRange(2, 2, nextEmpty - 2, 4)` empieza en columna B, con el comentario `B(0)=fecha, C(1)=matricula, D(2)=nombre, E(3)=hcp` — de nuevo desactualizado. Esta rama se usa cuando se arman líneas para una fecha que YA existe sin mandar la lista de jugadores desde el frontend (a diferencia del "modo wizard", que sí manda la lista y no tiene este problema). Con este bug, `players` siempre queda vacío, y la función termina devolviendo "Se necesitan al menos 3 jugadores. Encontrados: 0" — aunque la fecha tenga jugadores cargados.

**Fix:** mismo patrón que la Parte A — leer desde columna 1, usar `r[0]`=fecha, `r[1]`=matrícula, `r[2]`=hcp (no hay columna "nombre").
```js
const nextEmpty = findNextEmptyRow_(shT, 1);
if (nextEmpty <= 2) return { ok: false, error: 'No hay jugadores en TARJETAS' };
const tData = shT.getRange(2, 1, nextEmpty - 2, 3).getValues();
// r[0]=fecha, r[1]=matricula, r[2]=hcp
tData.forEach(function(row) {
  const f = String(row[0] || '').trim();
  const m = String(row[1] || '').trim();
  if (f !== String(fecha) || !m || m.indexOf('INV') === 0) return;
  if (seenMats[m]) return;
  seenMats[m] = true;
  const h = (row[2] !== '' && row[2] !== null && row[2] !== undefined) ? (parseInt(row[2]) || 0) : 0;
  players.push({ matricula: m, hcp: h, apodo: '' });
});
```

---

### Parte C — `setDoblesFecha_` (`04_Writes.gs`, línea ~1063): bug silencioso, sin mensaje de error

Esta es la función del toggle admin de "Doble Stableford" por jugador. Lee `shT.getRange(2, 2, ne - 2, 2)` para armar `todosEnFecha` (la lista de jugadores de esa fecha, usada para sacarle el doble a quien lo tenía marcado y se desmarca). Mismo bug de columna: como nunca encuentra coincidencias de fecha, `todosEnFecha` siempre queda vacío.

**Efecto práctico (no tira error, por eso nunca se notó):** marcar a alguien como "doble" funciona bien (esa parte no depende de `todosEnFecha`), pero **desmarcarlo no funciona nunca** — el jugador se queda con el doble activado para siempre aunque lo destildes en el panel de admin.

**Fix:**
```js
const ne = findNextEmptyRow_(shT, 1);   // antes: findNextEmptyRow_(shT, 2)
if (ne > 2) {
  shT.getRange(2, 1, ne - 2, 2).getValues().forEach(function(r) {
    const f = String(r[0] || '').trim();
    const m = String(r[1] || '').trim();
    if (f === fStr && m && m.indexOf('INV') !== 0) todosEnFecha.push(m);
  });
}
```

---

### Parte D — `getFechaColors2026_` (`05_HCP.gs`, línea ~171): afecta el cálculo del "HCP NGT" del perfil de jugador

Lee `sh.getRange(2, 2, lr - 1, 1)` como fecha (columna B, en realidad matrícula) y `sh.getRange(2, 33, lr - 1, 1)` como color de tee (columna AG, que no existe con datos reales — el color de tee real está en la columna Y/25). Como la columna AG siempre viene vacía, la función devuelve un mapa vacío `{}` siempre, para cualquier fecha.

Esto se usa en `getHcpNGT_` (línea ~192, el cálculo del hándicap tipo WHS que se muestra en el perfil del jugador — no es el mismo "HCP de juego" que se usa para calcular los puntos de los torneos, ese viene de otro lado y no tiene este problema). Como el mapa de colores siempre está vacío, `getHcpNGT_` termina usando siempre el tee "BLANCAS" por defecto para las tarjetas 2026, aunque se haya jugado con otro color de tee — lo cual puede hacer que el "HCP NGT" del perfil quede calculado con el rating/slope de la cancha equivocado para esas tarjetas.

**Fix:**
```js
function getFechaColors2026_() {
  const sh = getSheet_(SHEETS.TARJETAS);
  if (!sh) return {};
  const nextEmpty = findNextEmptyRow_(sh, 1);
  if (nextEmpty <= 2) return {};
  const data = sh.getRange(2, 1, nextEmpty - 2, 25).getValues();
  // r[0]=fecha, r[24]=colorTee
  const map = {};
  data.forEach(function(r) {
    const n = parseInt(r[0]);
    const c = String(r[24] || '').trim().toUpperCase();
    if (!isNaN(n) && c && !map[n]) map[n] = c;
  });
  return map;
}
```

---

### Chequeo final pedido

Las 4 funciones de arriba son las que encontré buscando el mismo patrón (`getRange(2, 2, ...)` sobre la hoja TARJETAS, y comentarios que mencionan una columna "nombre" o "cancha" de texto). Antes de dar por cerrada la tarea, hacé tu propia búsqueda de cualquier otro lugar del proyecto que lea TARJETAS asumiendo esa estructura vieja (columna B = fecha, con columnas "nombre"/"cancha" de texto) y confirmame si encontraste alguna que se me haya pasado.

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿hiciste los 4 cambios (lectura desde columna A, canchaId desde columna D, colorTee desde columna Y, escritura del HCP nuevo a columna C en vez de E)? Probá mentalmente contra una fila real de la fecha 7 y confirmá que ahora encuentra la cancha.

**R:** Sí, los 4 cambios: (1) `findNextEmptyRow_(sh, 1)` — col A como ancla; (2) `sh.getRange(2, 1, nextEmpty - 2, 25)` — 25 cols desde A; (3) `canchaId = row[3]` (col D, índice 3); `colorTee = row[24]` (col Y, índice 24); (4) `sh.getRange(i + 2, 3).setValue(newHcp)` — escribe en col C. También: eliminé `canchaName` (no existe en la estructura nueva), cambié el check a `if (!canchaId)`, y la llamada a `buildHcpJuegoMap_` pasa `''` como nombre de cancha. Prueba mental fecha 7: una fila típica tiene `row[0]="7"` → `String("7") === "7"` ✓ → `row[3]` = canchaId (ej. "44") → se llama `buildHcpJuegoMap_("44", "", "BLANCAS")` → devuelve el mapa de HCPs de juego → la función encuentra la cancha y recalcula correctamente.

2. **Parte B:** ¿confirmaste que el "modo wizard" de `armarLineas_` (el que manda la lista de jugadores desde el frontend) no se toca y sigue funcionando igual? Ese no tenía el bug.

**R:** Sí. El modo wizard entra por la rama `if (jugadores && jugadores.length)` al principio de `armarLineas_`, y nunca llega a la rama `else` donde estaba el bug. Solo toqué el bloque `else` (modo gestionar). El modo wizard no se modifica.

3. **Parte C:** ¿probaste mentalmente el caso de desmarcar un doble ya asignado? Confirmá que con el fix `todosEnFecha` ahora sí encuentra a los jugadores de la fecha.

**R:** Antes: `findNextEmptyRow_(shT, 2)` + `getRange(2, 2, ...)` → row[0]=mat, row[1]=hcp → el check `f === fStr` compara una matrícula (ej. "89837") contra "7" → nunca coincide → `todosEnFecha` vacío → `forEach` no limpia nada → doble queda para siempre. Ahora: `findNextEmptyRow_(shT, 1)` + `getRange(2, 1, ne - 2, 2)` → row[0]=fecha ("7"), row[1]=mat ("89837") → `f === fStr` da `"7" === "7"` ✓ → jugador se agrega a `todosEnFecha` → si `actualesDobles` lo tiene pero `nuevosDobles` no → `setNGTScoreField_(fStr, mat, 6, 0)` → doble borrado correctamente.

4. **Parte D:** ¿confirmaste que `getHcpNGT_` sigue funcionando igual para las tarjetas históricas (que no dependen de este mapa, usan `TEE_DEFAULT` fijo aparte) y que el cambio solo afecta cómo se procesan las tarjetas 2026?

**R:** Sí. En `getHcpNGT_` (línea ~192): las tarjetas históricas se leen de `getTarjetasHistJugador_` y usan `lookupRating_(ratingsMap, t.cancha, TEE_DEFAULT)` — nunca consultan `fechaColors`. El mapa `fechaColors` solo se usa para las tarjetas 2026 (el bloque que lee TARJETAS y usa `fechaColors[fNum]` para determinar el tee color). Antes, ese mapa siempre era `{}` → todos los 2026 usaban `'BLANCAS'` por defecto. Ahora devuelve el color real de cada fecha → los diferenciales de 2026 se calculan con el slope/rating correcto para el tee jugado.

5. **Chequeo final:** ¿encontraste alguna otra función con este mismo patrón que no esté en esta lista?

**R:** Busqué `getRange(2, 2, ...)` sobre TARJETAS en todos los archivos `.gs`. Encontré 4 instancias con ese patrón: las 3 ya corregidas (en `05_HCP.gs`, `06_ArmarLineas.gs`, `04_Writes.gs`) y una cuarta en `03_Reads.gs` (`getFechaDetalle_`) — pero esa ya leía correctamente desde col A en su `getRange` (solo tenía el comentario desactualizado, que corregí). No encontré ninguna función adicional con el bug real.

6. Hash y mensaje de cada commit.

**R:**
- `fa4f34d` — Tarea 22A+D: fix recalcularHcpFecha_ y getFechaColors2026_ — TARJETAS reads from col A
- `916f44f` — Tarea 22B: fix armarLineas_ modo gestionar - TARJETAS reads from col A
- `61ffeaf` — Tarea 22C: fix setDoblesFecha_ - TARJETAS reads from col A
- `6922ac7` — fix stale TARJETAS schema comment in getFechaDetalle_

7. ¿Alguna duda?

**R:** No. Un punto de atención: `recalcularHcpFecha_` ahora escribe en col C (HCP), pero el resultado que devuelve todavía incluye `cancha: canchaName` en el campo `data` — ese campo ahora queda vacío string porque eliminé `canchaName`. Si el frontend muestra ese campo al admin, va a aparecer vacío. Para evitar confusión cambié el mensaje de error a `'Sin datos de slope/rating para canchaId ' + canchaId` (usa ID en lugar del nombre). El campo `data.cancha` en la respuesta exitosa podría completarse con `lookupCanchaName_(canchaId)` si se necesita — pero como no es el bug central de esta tarea, lo dejo para después si Marco reporta que falta ese dato en el panel.
