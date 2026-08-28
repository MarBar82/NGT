# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-21
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Marco reportó que en "Gestionar Fechas" → Puntos Dobles, solo aparece el jugador que ya tiene el doble tildado en esa fecha (y si nadie lo usó, no aparece nadie para elegir). Encontré la causa (Parte A), y de paso un segundo problema relacionado que Marco ya confirmó que se puede sacar del todo (Parte B) — ver Tarea 26, las 2 partes se hacen juntas en esta misma tarea.

---

## 🎯 Tarea para Claude Code — Tarea 26

### Parte A — `getJugadoresConDobleDisponible_` lee la hoja SCORE con una estructura vieja que ya no existe

**Causa raíz confirmada:** en `03_Reads.gs`, el comentario de las líneas 51-60 documenta que la hoja SCORE tenía ANTES una estructura "ancha" — una fila por jugador (col A = matricula), con las 4 estadísticas de cada fecha en un bloque de columnas hacia la derecha (E-H para fecha 1, I-L para fecha 2, etc.), y una columna AT (46) al final como "casillero global de ya-usó-el-doble".

Esa estructura ya NO es la real. Hoy SCORE tiene la estructura "NGT DB" documentada más abajo en el mismo archivo (línea 74): una fila por cada combinación fecha+jugador (A=Fecha, B=Matricula, C=Stableford, D=Match, E=Bonus, F=Doble, G=PosFecha, H=PosLeaderboard) — la misma que usan `getAllNGTScoreData_`, `setNGTScoreField_`, y todo el resto de la app.

`getJugadoresConDobleDisponible_` (línea 225) quedó con el código viejo: lee `sh.getRange(2, 1, 19, 46)` (fijo a 19 filas y 46 columnas — un resabio de cuando había una sola fila por jugador) y trata la columna A de cada fila como si fuera la matrícula — pero hoy la columna A es la FECHA. Como resultado, la lista de "disponibles" que arma no tiene ninguna matrícula real (son números de fecha, tipo "1", "2", "7"), así que ningún jugador real hace match y no aparece nadie tildable. La columna AT (46) que se lee como "casillero global" tampoco corresponde a nada real en la estructura actual — y confirmé además que ningún lugar del código ESCRIBE nunca esa columna, así que ese casillero está muerto (nunca se usó realmente).

**Fix:** reescribí la función para que arme la lista de matrículas disponibles usando las fuentes correctas y ya probadas del resto de la app — la lista completa de jugadores (`cachedRead_('jugadores', 300, getJugadores_)`) menos los que ya usaron el doble en cualquier fecha (`getAllNGTScoreData_()`, filtrando `db !== 0` — esa parte del código viejo SÍ estaba bien, no la toques):

```js
function getJugadoresConDobleDisponible_() {
  // Returns list of matriculas that have NOT used their doble in ANY fecha.
  const ngtRows = getAllNGTScoreData_();
  const dobledMats = new Set();
  ngtRows.forEach(function(r) { if (r.db !== 0) dobledMats.add(r.mat); });

  const todosMats = cachedRead_('jugadores', 300, getJugadores_).map(function(j) {
    return String(j.matricula).trim();
  });
  return todosMats.filter(function(m) { return !dobledMats.has(m); });
}
```

De paso, `debugDobles_()` (la función de al lado, línea ~253, un endpoint de debug que no usa ninguna pantalla real) tiene el mismo problema de lectura vieja — si es rápido, actualizala también para que sea consistente y siga sirviendo como herramienta de diagnóstico a futuro; si no, no es urgente.

---

### Parte B — Sacar del todo la escritura vieja a `SCORE!AU` (confirmado con Marco: no se usa ningún leaderboard con fórmulas)

Investigando la Parte A encontré una escritura relacionada, rota por el mismo motivo (estructura vieja de SCORE): cuando un jugador con el doble activado firma su tarjeta, además de guardar el puntaje correcto en la hoja NGT DB SCORE (eso funciona bien, no se toca), el código intenta ADEMÁS escribir ese mismo valor en una celda vieja — `SCORE!AU` (columna 47) — a través de `writeDobleStScore_` → `getScoreRowForMat_` (`03_Reads.gs`, líneas 62 y 286). Esa escritura vieja asume la estructura "ancha" de SCORE (una fila por jugador) y por eso nunca encuentra la fila — siempre falla en silencio, sin romper nada, pero genera un mensaje confuso para el admin al firmar ("doble marcado pero AU no se pudo escribir: Matrícula no está en SCORE").

Le pregunté a Marco si todavía usa algún leaderboard armado con fórmulas de Google Sheets que dependa de esa columna AU — **confirmó que no, que el único leaderboard que usa es el que escribe la app** (el sistema NGT DB + `recalcularTotalesScore_`). Así que esta escritura vieja es 100% código muerto, sin ningún consumidor real.

**Fix:**

1. En `04_Writes.gs` (~línea 613-619, dentro de `cargarTarjeta_`, sección "9. Puntos dobles"), sacá la llamada a `writeDobleStScore_` y dejá el mensaje simple, sin la rama de éxito/error de esa escritura:
```js
if (currentDobles_.indexOf(String(matricula)) >= 0 && stbBreak) {
  // Write actual ST value to NGT DB Doble column (replaces placeholder 1)
  setNGTScoreField_(fStr, mStr, 6, stbBreak.k);
  dobleMsg = 'doble aplicado: ST=' + stbBreak.k;
}
```
2. En `03_Reads.gs`, borrá las 2 funciones que quedan sin ningún uso después de este cambio: `getScoreRowForMat_` (línea ~62) y `writeDobleStScore_` (línea ~286). Antes de borrarlas, confirmá con un grep que no las llama nada más en todo el proyecto (yo ya lo hice y no encontré otros llamadores, pero verificalo vos también antes de borrar).

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿reescribiste `getJugadoresConDobleDisponible_` como se describe? Probá mentalmente con un jugador que nunca usó el doble (tiene que aparecer disponible) y uno que ya lo usó en una fecha anterior (tiene que quedar afuera de la lista, en cualquier otra fecha).

**R:** Sí, reescrita exactamente como se describe. Prueba mental: Racho (mat "89837") nunca usó el doble → no aparece en `ngtRows` con `db !== 0` → `dobledMats` no lo tiene → pasa el filtro → aparece en `available` ✓. Obiglio (mat "12345") usó el doble en fecha 6 → hay una fila `{fecha:"6", mat:"12345", db:36}` en `ngtRows` → `dobledMats.add("12345")` → el filtro lo rechaza → no aparece ✓. La función ya no toca la hoja SCORE directamente — lee solo de `getAllNGTScoreData_()` y `getJugadores_()`, ambas funciones correctas.

2. ¿Actualizaste también `debugDobles_()`, o la dejaste para después? Cualquiera de las dos está bien, decime cuál elegiste.

**R:** La actualicé. La nueva versión usa `getAllNGTScoreData_()` + `getJugadores_()` y devuelve por jugador `{ matricula, usedDoble, fechas: [lista de fechas donde usó doble] }` — más informativa que la versión vieja que solo mostraba el valor crudo de la columna AT (que siempre estaba vacía).

3. **Parte B:** ¿confirmaste (con tu propio grep) que `getScoreRowForMat_` y `writeDobleStScore_` no tenían otros llamadores antes de borrarlas? ¿Quedó el mensaje `dobleMsg` simplificado como se describe?

**R:** Confirmado con grep en todos los `.gs`. `getScoreRowForMat_` solo era llamada dentro de `writeDobleStScore_` (mismo archivo). `writeDobleStScore_` solo era llamada en `cargarTarjeta_` (línea 618 de `04_Writes.gs`), que ahora tiene el bloque simplificado: solo `setNGTScoreField_` + `dobleMsg = 'doble aplicado: ST=' + stbBreak.k`. Sin rama AU, sin `auResult`, sin mensaje de error.

4. Hash y mensaje del commit.

**R:** `d7104a6` — Tarea 26: fix dobles — reescribir getJugadoresConDobleDisponible_, borrar funciones muertas

5. ¿Alguna duda?

**R:** No. Nota: también quedó sin uso el comentario de las líneas 55-60 de `03_Reads.gs` que documentaba la estructura "ancha" vieja de SCORE (el bloque `// A=matricula, B=nombre, C=total...`). Lo dejé como está porque es un comentario inofensivo, pero se puede limpiar en otra tarea si se quiere.
