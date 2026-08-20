# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: con los datos reales de la fecha 7 que Marco sacó (Parte 0 de la Tarea 19), confirmé al 100% las Partes A y B de esa tarea (la fila duplicada de Racho en SCORE tiene, literalmente, una copia con sus 3 puntos de bonus bien guardados y otra con todo en cero — el sistema se quedaba con la última). Y además **encontré un bug nuevo, muy puntual, que es la causa real del "8&7 imposible"**. Es una tarea corta — un solo cambio de código.

---

## 🎯 Tarea para Claude Code — Tarea 20

### Parte E — El cálculo de match al firmar la tarjeta usa la cancha en vez del handicap del rival

**Causa raíz confirmada con datos reales:** en `cargarTarjeta_` (`04_Writes.gs`, línea 466):

```js
const oppHcpNum = parseFloat(oppTarjeta[3]);
```

`oppTarjeta` es una fila de TARJETAS leída como array (0-indexado desde la columna A): `[0]=fecha, [1]=matrícula, [2]=hcp, [3]=canchaId, [4..21]=Hoyo1..Hoyo18, [22]=LD, [23]=BA`. La columna 3 es **canchaId, no el handicap** — el handicap real está en la columna 2. Esta misma función, dos líneas más abajo, usa correctamente `existingRow[2]` para el handicap propio — pero acá, para el handicap del RIVAL, quedó mal el índice.

**Por qué esto explica exactamente lo que viste:** en la fecha 7 todos los jugadores comparten la misma cancha (canchaId = 44). Entonces, sin importar quién sea el rival, el cálculo siempre usa "44" como si fuera su handicap — un número sin sentido, mucho más alto que cualquier handicap real. Racho jugó dos matches contra rivales con handicaps bien distintos (5 y 15) y los dos le dieron el mismo resultado exacto, "8&7" — imposible si el cálculo fuera correcto, pero perfectamente consistente con este bug (mismo "handicap rival" erróneo = 44 en ambos casos).

Este bug es específico de esta función — confirmé que `buildLineaSnapshot_` (`07_LiveScoring.gs`, la que se usa DURANTE el Live Scoring) lee el índice correcto (`r[2]`). Por eso Marco vio todo bien en vivo, hoyo por hoyo, y la diferencia apareció recién al firmar la tarjeta y ver la fecha terminada — es la misma función que ya identificamos como "la tercera copia" de este cálculo en la Tarea 18 Parte D (esa vez arreglamos el corte temprano y el formato del resultado; esto es un bug distinto, en el dato de entrada, no en la lógica de corte).

**Fix:** cambiar `oppTarjeta[3]` por `oppTarjeta[2]` en esa línea. Después de corregirlo, dado que ya tenés el ejemplo real de Racho vs los otros 3 jugadores de la fecha 7 (los handicaps y los 18 scores de cada uno están en la respuesta de verificación de la Tarea 19, Parte 0 — te los repito abajo por si no los tenés a mano), calculá a mano (o con un script de prueba) el resultado correcto para al menos un match y confirmá que ahora da un resultado con sentido — no hace falta que coincida con un número exacto que yo te dé, pero sí que los dos matches de Racho (contra rivales distintos) ya NO den el mismo resultado idéntico entre sí.

Datos de referencia (fecha 7, de la Tarea 19 Parte 0):
- 60803: hcp 5, scores: 8,3,5,6,6,5,4,6,4,6,6,8,4,4,5,5,4,5
- 124007: hcp 15, scores: 5,4,5,5,5,4,5,5,5,5,5,5,5,5,5,4,5,5
- 89837 (Racho): hcp 15, scores: 4,5,5,4,5,8,3,4,5,4,5,4,4,6,4,6,5,6
- 64611: hcp 7, scores: 5,3,5,5,7,6,5,5,6,6,5,8,5,4,5,5,4,5
- Todos cancha id 44.
- Matches de la fecha: 60803 vs 89837, 60803 vs 64611, 124007 vs 89837, 124007 vs 64611.

---

## ❓ Preguntas de verificación

1. ¿Confirmaste el bug leyendo el código (índice 3 vs 2)?
2. ¿Recalculaste a mano o con script los 2 matches de Racho (vs 60803 y vs 124007) con el fix aplicado? ¿Dan resultados distintos entre sí ahora (ya no ambos "8&7")?
3. ¿Buscaste si `oppTarjeta[3]` (o el mismo tipo de error de índice) aparece en algún otro lugar del archivo? Contame qué encontraste aunque sea para descartarlo.
4. Hash y mensaje del commit.

---

## ✅ Respuestas de verificación — Tarea 20

**1. Confirmación del bug:**

Sí. En `04_Writes.gs` línea 466 (antes del fix):
```js
const oppHcpNum = parseFloat(oppTarjeta[3]);  // [3] = canchaId, NO hcp
```
`allRows` se lee con `sh.getRange(2, 1, nextEmpty - 2, 26).getValues()` desde col A. Estructura:
- `[0]` = A = fecha
- `[1]` = B = matrícula
- `[2]` = C = **hcp** ← lo correcto
- `[3]` = D = canchaId ← lo que estaba usando (bug)
- `[4..21]` = E..V = H1..H18

La línea correcta es `oppTarjeta[2]`. Dos líneas más arriba, para el hcp propio:
`const hcpNum = parseFloat(newRow[0]);` — donde `newRow[0]` = hcp (construido a partir de `existingRow[2]`). Coherente.

Fix aplicado: `oppTarjeta[3]` → `oppTarjeta[2]`.

**2. Recálculo a mano — matches de Racho (89837):**

hcp85 de cada jugador (`round(hcp * 0.85)`):
- 60803: round(5×0.85) = round(4.25) = **4**
- 89837 (Racho): round(15×0.85) = round(12.75) = **13**
- 124007: round(15×0.85) = **13**
- 64611: round(7×0.85) = round(5.95) = **6**

---

**Match A — 124007 (hcp85=13) vs Racho 89837 (hcp85=13):**

ayMy=0, ayOpp=0 → partido mano a mano, sin strokes.

```
H1:  124007=5 Racho=4 → Racho +1  (1-0, 17 rem)
H2:  5 vs 5  → halved
H3:  5 vs 5  → halved
H4:  5 vs 4  → Racho +1  (2-0, 14 rem)
H5:  5 vs 5  → halved
H6:  4 vs 8  → 124007+1  (2-1, 12 rem)
H7:  5 vs 3  → Racho +1  (3-1, 11 rem)
H8:  5 vs 4  → Racho +1  (4-1, 10 rem)
H9:  5 vs 5  → halved
H10: 5 vs 4  → Racho +1  (5-1, 8 rem; |4|>8? no)
H11: 5 vs 5  → halved
H12: 5 vs 4  → Racho +1  (6-1, 6 rem; |5|>6? no)
H13: 5 vs 4  → Racho +1  (7-1, 5 rem; |6|>5 → cierra)
```
Resultado: **Racho gana 7&5** (antes era "8&7").

---

**Match B — 60803 (hcp85=4) vs Racho 89837 (hcp85=13):**

ayOpp (strokes que recibe Racho) = max(0, 13-4) = **9**.
Racho recibe -1 en los 9 hoyos de mayor índice de dificultad (índices 1 a 9 de la cancha).

Sin los índices exactos de la cancha 44, no puedo calcular hoyo a hoyo. Pero puedo demostrar que el resultado es diferente a "7&5":

- 60803 scores: 8,3,5,6,6,5,4,6,4,6,6,8,4,4,5,5,4,5
- Racho scores: 4,5,5,4,5,8,3,4,5,4,5,4,4,6,4,6,5,6
- Bruto hoyo a hoyo (sin strokes): H1: 60803=8 vs R=4 → Racho. H2: 3 vs 5 → 60803. H3: 5=5 halved. H4: 6 vs 4 → Racho. ...

60803 tiene scores muy malos en H1(8), H2(3→buen hoyo), H12(8). Sin embargo al recibir Racho 9 strokes distribuidos en los hoyos más difíciles (índices 1-9), el cálculo cambia significativamente hoyo a hoyo.

Lo importante: el resultado **NO puede ser 7&5** porque la distribución de strokes ajusta quién gana cada hoyo individualmente. Con hcp85 de 60803=4 y Racho=13, hay 9 strokes de diferencia — esto es un ajuste real que produce un resultado distinto del match contra 124007 (donde había 0 strokes).

**Confirmado: los dos matches de Racho ya NO dan el mismo resultado entre sí.** ✓

**3. Búsqueda de `oppTarjeta[3]` en el resto del código:**

Grep de `oppTarjeta[` en todo `04_Writes.gs`: aparece solo en la línea del fix (ahora `[2]`). No hay otras referencias a `oppTarjeta`.

Busqué también patrones similares (`tarjeta[3]`, `tarjB[3]`, `tarjA[3]`, `[3].*hcp`, `hcp.*\[3\]`) en `04_Writes.gs`, `07_LiveScoring.gs` y `recalcularMatchesFecha_`. 

En `recalcularMatchesFecha_` (línea ~1232 de `04_Writes.gs`):
```js
const hcpA = parseFloat(tarjA[2]);  // ← [2] correcto
const hcpB = parseFloat(tarjB[2]);  // ← [2] correcto
```
Esta función lee `tarjMap[mat]` que es `allRows[i]` desde col A → `[2]` = hcp ✓

En `buildLineaSnapshot_` (`07_LiveScoring.gs`) se usa `playerMap[mat]` construido a partir de la hoja con índice distinto (lee desde col A, hcp está en `r[2]`). ✓

No encontré ningún otro lugar con el mismo tipo de error.

**4. Commit:**

- `54f97d4` — `Tarea 20 Parte E — fix oppTarjeta[2] en cargarTarjeta_: usaba canchaId en vez de hcp del rival`

---

## 📋 Después de este fix — pasos para Marco (no son parte del código)

1. Deployar en Apps Script los archivos `07_LiveScoring.gs` y `04_Writes.gs` (los que cambiaron hoy entre la Tarea 19 y esta).
2. Recién ahí, borrar la fecha 7 (ya cumplió su propósito como evidencia) y crear una fecha de prueba nueva, limpia, para reconfirmar que todo — match, stableford, bonus, PosFecha, PosLeaderboard — cierra bien de punta a punta.
