# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: excelente noticia — el fix del handicap del rival (Tarea 20) funcionó, Marco confirmó que los dos matches de Racho ahora dan resultados distintos y con sentido (8&7 y 7&6). Quedó un problema nuevo: los puntos de match no se suman bien cuando un jugador ganó más de un match. Además Marco pidió 3 mejoras de interfaz en Live Scoring y encontró un problema de empates en la tabla de stableford. **Y el tema del nombre en blanco finalmente lo encontré** — Marco me pasó el inspector del navegador y ahí estaba la causa real, agregada como Parte E. Sumé 2 partes más (F y G): la tabla de Stableford de una fecha terminada, y un bug real que encontré de paso — el cálculo de stableford que decide el ganador de la fecha tiene una fórmula distinta (e incompleta) a la que usa el resto de la app.

---

## 🎯 Tarea para Claude Code — Tarea 21

### Parte A — Puntos de match: si un jugador ganó 2 matches, solo se le suman los de 1

**Causa raíz:** el campo MA (puntos de match) en SCORE (NGT DB) se recalcula de forma incremental, cada vez que se firma UNA tarjeta — no de forma final y única. Cuando 4 jugadores firman casi al mismo tiempo (`liveFinalizar()` con `Promise.all`), cada `cargarTarjeta_` recalcula el total de MA no solo para sí mismo, sino también para sus rivales directos (`affectedMats`), usando una mezcla de datos: el match que ESE llamado acaba de escribir (dato fresco) + los otros matches de esa persona, leídos de una foto de la hoja MATCH tomada AL PRINCIPIO de ese mismo llamado (que puede estar desactualizada si el otro match todavía no se había escrito en ese momento).

Ejemplo concreto con Racho, que juega contra Obiglio y contra Martínez Fano: si la tarjeta de Obiglio se firma ANTES de que el match Racho-Martínez Fano ya esté resuelto, el llamado de Obiglio recalcula el MA de Racho sumando el match recién resuelto (Racho-Obiglio, 6 pts) + lo que en ese momento haya en la hoja para Racho-Martínez Fano (todavía vacío = 0) → escribe MA=6 para Racho, pisando cualquier valor más completo que ya existiera. Como las 4 firmas van en paralelo, **el orden de llegada decide el resultado final**, y no siempre gana el cálculo completo.

**Fix:** en vez de confiar en estos recálculos parciales e incrementales, aprovechá el mismo lugar donde ya enganchamos el chequeo de "fecha completa" en la Tarea 19 Parte B (`cargarTarjeta_`, después de la línea ~608, dentro del bloque `if (allDone) { sumarGanadorFecha_(fStr); recalcularTotalesScore_(null, fStr); }`). Ahí, agregá un recálculo final y autoritativo de MA para TODOS los jugadores de esa fecha, leyendo la hoja MATCH completa (que en ese momento ya está 100% resuelta, porque todos firmaron) y sumando sus puntos reales fila por fila — sin depender de lo que haya quedado escrito antes por los recálculos parciales. Puede ser una función nueva (ej. `recalcularMAFecha_(fecha)`, siguiendo el mismo patrón que `sumarGanadorFecha_`: leer TARJETAS/MATCH para la fecha, sumar pts1/pts2 por matrícula, escribir con `setNGTScoreField_(fStr, mat, 4, totalMA)` para cada jugador). Llamala justo después de `sumarGanadorFecha_(fStr)` en ese mismo bloque.

Dejá los recálculos parciales de MA que ya existen (los que pasan durante cada firma individual) tal cual están — sirven para que el número se vea razonable mientras la fecha todavía no está completa. Este nuevo recálculo final es el que garantiza que, una vez que todos firmaron, el número quede bien para siempre.

---

### Parte B — Sacar la flecha y el nombre de "cargado por" en la tarjeta de Live Scoring

En `liveRenderHoyoActual()` (`index.html`, ~línea 6220-6222), hay un div `.live-cargado-por` que muestra "↑ NOMBRE" debajo del HCP de cada jugador, cuando otra persona cargó ese score por él. Marco pidió sacarlo. Simplemente eliminá esa línea (`cargStr` y su uso en el template) — no hace falta guardar ni mostrar más esa información ahí.

---

### Parte C — Encabezado del hoyo en Live Scoring: agregar el HCP del hoyo, sacar el número de línea

Hoy el encabezado (`index.html`, ~línea 1851-1852 y la función `liveRenderHoyoActual()` ~línea 6211-6212) muestra "Hoyo 5 · Par 4" más un chip separado "Línea 2".

Marco pidió: mostrar "HOYO 5 · PAR 4 · HCP 13" (el HCP acá es el índice de dificultad del hoyo, no el handicap del jugador — ya está disponible en el cliente como `LIVE_LINEA_DATA.indices[h]`, mismo dato que ya se usa en `renderTarjeta18Hoyos`) y sacar el chip de "Línea N" de esa zona (no hace falta mostrarlo ahí).

**Fix:** en `liveRenderHoyoActual()`, agregá el HCP del hoyo actual a continuación del Par (ej. `'· HCP ' + indices[h]` si existe el dato), y quitá o vaciá el `chip.textContent = 'Línea ' + d.lineaNum` en `liveRender()` (podés dejar el elemento en el HTML por si se usa en otro lado, pero que no muestre nada ahí, o eliminarlo del todo si no se usa en ningún otro lugar — fijate antes de borrar el elemento).

---

### Parte D — Empates en la tabla de Stableford: mostrar "T1", "T1" en vez de "1", "2"

En `liveLoadStableford()` (`index.html`, ~línea 6403-6418), la posición de cada jugador se muestra como `(i+1)` — un número de fila simple, sin considerar empates. `r.data` ya viene ordenado de mayor a menor por `stbTotal`. Marco pidió que, cuando dos o más jugadores tengan el mismo puntaje, compartan la misma posición con el prefijo "T" (ej. dos jugadores con 30 puntos → ambos "T1", el siguiente jugador va en "3", no en "2").

**Fix:** calculá la posición real considerando empates (mismo criterio que un ranking de golf: posición = 1 + cantidat de jugadores con más puntos que vos; si hay empate, todos los empatados muestran esa posición con el prefijo "T" — si NO hay empate en esa posición, mostrala sin el prefijo, como número simple). Aplicá esto en el `forEach` que arma las filas, reemplazando el `(i+1)` de la columna `#`.

---

### Parte E — El nombre en blanco: causa real encontrada con el inspector del navegador

**Causa raíz confirmada (no es suposición, la vi en el inspector de Chrome que me pasó Marco):** en `buildMatchCard` (`index.html`, ~línea 3218/3224), el nombre del ganador SÍ tiene `color:#fff` puesto en el `<span>` que lo envuelve — eso ya lo habíamos confirmado varias veces y está bien. El problema es que `nameA`/`nameB` (los parámetros que le llegan a `buildMatchCard`) no son texto plano: en `renderMatchTable` (línea ~3262) y en `fechaMatchRender` (línea ~7261), antes de llamar a `buildMatchCard` se les aplica `fmtHistName(...)`, que envuelve el apellido en **su propio span con clase `hist-ap`** — y esa clase (definida en el CSS global, línea ~344) tiene `color: var(--navy)` fijo.

Como ese span interno declara su propio color, no hereda el blanco del span padre — un elemento con color propio siempre gana sobre la herencia, sin importar que el padre lo haya puesto con `style="color:#fff"` inline. Por eso: en el Live Scoring (`liveRenderMatchBody`, que usa los apodos directamente sin pasar por `fmtHistName`) siempre se vio bien, y en "Match" y "Fechas" (las dos pantallas que sí usan `fmtHistName` antes de `buildMatchCard`) nunca se vio blanco — coincide exactamente con lo que reportó Marco.

**Ya existe un arreglo idéntico a este mismo problema, en otro lugar del código** — buscá `.rc-name .hist-ap,.rc-name .hist-nm{color:inherit !important;...}` (línea ~146). Es el mismo patrón: un contenedor le fuerza `color:inherit !important` a los spans internos de `fmtHistName` para que respeten el color del padre en vez de imponer el suyo.

**Fix:** agregá una regla CSS parecida, scopeada al contenedor de `buildMatchCard` (buscá qué clase identifica de forma única los spans de nombre dentro de la tarjeta de match — hoy no tienen una clase propia, así que agregales una, ej. `class="mch-name"`, a los dos spans de nombre en `buildMatchCard`, líneas ~3218 y ~3224). Después agregá en el CSS: `.mch-name .hist-ap, .mch-name .hist-nm { color: inherit !important; }`. Con esto, el color que definís dinámicamente (`l1Txt`/`l2Txt`, blanco cuando gana, oscuro cuando pierde) se respeta siempre, sin importar que el nombre venga envuelto por `fmtHistName`.

Probalo mentalmente con un nombre ganador y uno perdedor, confirmando que en ambos casos el color que buildMatchCard calculó (`l1Txt`/`l2Txt`) es el que efectivamente se ve, no el `var(--navy)` fijo de `.hist-ap`.

---

### Parte F — Unificar la tabla de Stableford de "Fechas" (terminada) con la de Live Scoring

Marco pidió que la tabla de Stableford que se ve al mirar una fecha ya terminada (pantalla "Fechas", función `renderFechaDinamica`, `index.html` ~línea 7184-7209) se comporte igual que la del Live Scoring: hoy, al hacer click en un jugador, abre un modal de pantalla completa (`openTarjetaModal`, ~línea 8060) — Marco quiere que en cambio se despliegue hacia abajo, en el mismo lugar, mostrando la tarjeta — igual que hace `liveLoadStableford`/`liveStbToggle` (~línea 6383-6431) en Live Scoring.

**Fix:** en vez de `onclick="openTarjetaModal(...)"` en la fila de cada jugador (línea ~7198), armá el mismo patrón de acordeón: agregá una fila oculta debajo de cada jugador (`<tr id="stb-acc-{mat}" style="display:none;">...</tr>`) con la tarjeta adentro (`renderTarjeta18Hoyos`), y un `onclick` que la muestre/oculte (podés reusar `liveStbToggle` tal cual, es genérica). Para tener los datos de la tarjeta (scores + `stbPorHoyo`, el desglose por hoyo YA CALCULADO Y GUARDADO al firmar, en vez de recalcularlo de nuevo en el cliente), lo más prolijo es que `renderFechaDinamica` haga un fetch a `getStbFecha` (la MISMA acción que ya usa Live Scoring, `10_Routing.gs` línea 67, `getStbFecha_` en `03_Reads.gs`) en vez de depender solo de `fechaResultados` para esta tabla — esa acción ya funciona para cualquier fecha (no depende de que esté "en vivo"), y trae `stbPorHoyo` ya resuelto por jugador, así el acordeón no tiene que recalcular nada del lado del cliente. Dejá `openTarjetaModal` como está por si se usa en otro lado (confirmá si tiene otro caller antes de tocarla) — si no se usa en ningún otro lugar después de este cambio, avisame y lo sacamos en otra tarea.

---

### Parte G — Bug real encontrado de paso: `calcStablefordHole_` no aplica la regla del 85%

**Encontré esto investigando la Parte F, no es una suposición.** En `09_Resultados.gs` (línea 339), la función `calcStablefordHole_` tiene este comentario: `/** Calculate stableford for a single hole (85% rule). */` — pero el código NO aplica el 85% en ningún lado:

```js
const hcpEff = Math.round(parseFloat(hcpJuego));  // ← debería ser hcpJuego * 0.85
const extras = Math.floor((hcpEff + 18 - indice) / 18);
```

Comparé con las otras 2 implementaciones de esta misma cuenta que sí están bien: `calcStbBreakdown_` (`04_Writes.gs` línea 161: `Math.round(parseFloat(hcp) * 0.85)`) y la función del cliente `hcp85()`/`calcStablefordHoyo` (`index.html`). Las tres deberían dar el mismo resultado y no lo hacen — es exactamente el mismo patrón de "una tercera copia de la cuenta que se desincroniza" que ya encontramos con el cálculo de match en la Tarea 20.

**Por qué esto importa más de lo que parece:** `calcStablefordHole_` se usa en 2 lugares — (1) `getRankingFecha_` (línea 1084), que es la función que ahora, desde la Tarea 19, **decide automáticamente quién ganó cada fecha (PosFecha)**. Si el handicap de dos jugadores es distinto, esta fórmula incompleta puede darle la posición equivocada. (2) el cálculo de "rondas bajo par" en los perfiles de jugador (línea 599).

**Fix:** en `calcStablefordHole_`, cambiar `Math.round(parseFloat(hcpJuego))` por `Math.round(parseFloat(hcpJuego) * 0.85)` — una sola línea. Después, sería bueno que corras `calcularGanadoresFechas_` (la función admin que recalcula PosFecha para TODAS las fechas desde cero) para corregir cualquier fecha vieja que haya quedado con el ganador mal calculado — contame si encontrás alguna fecha donde el ganador cambia con el fix, para que lo sepamos.

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿implementaste el recálculo final de MA? ¿Dónde queda enganchado exactamente? Probá mentalmente el caso de Racho (2 matches ganados) y confirmá que ahora sumaría los puntos de ambos.

**R:** Sí. Función nueva `recalcularMAFecha_(fStr)` en `04_Writes.gs`, llamada en el bloque `allDone` de `cargarTarjeta_` justo después de `sumarGanadorFecha_` y antes de `recalcularTotalesScore_`. La función lee todas las filas del sheet MATCH para esa fecha (cols B–H desde col 2: r[0]=fecha, r[1]=mat1, r[2]=mat2, r[3]=res1, r[4]=pts1, r[5]=res2, r[6]=pts2), suma pts1 y pts2 por matrícula, y escribe con `setNGTScoreField_(fStr, mat, 4, total)`. Para Racho con 2 matches ganados: si ganó contra Obiglio (pts1=6) y contra Martínez Fano (pts1=6), la función suma ambas filas → total 12 → escribe MA=12. No importa en qué orden llegaron las firmas — cuando se ejecuta este bloque, TODOS ya firmaron, entonces MATCH está completo.

2. **Parte B:** ¿confirmaste que no queda ningún rastro visual de "cargado por" en la tarjeta?

**R:** Sí. Eliminé la variable `cargStr` (las 3 líneas: declaración del `uc`, la asignación condicional, y el uso en el template). El `.live-player-info` ahora solo tiene `.live-player-apodo` y `.live-player-hcp`. La clase CSS `.live-cargado-por` (línea 690) quedó definida pero sin uso — se puede limpiar en otra tarea.

3. **Parte C:** ¿cómo quedó el texto final del encabezado? ¿Sacaste el chip de línea del todo o lo dejaste vacío/oculto? ¿Por qué?

**R:** El label del hoyo queda: `"Hoyo 5 · Par 4 · HCP 13"` (si existe el índice). El `live-par-label` ahora concatena par + HCP: `(par ? '· Par ' + par : '') + (hoyoIdx ? ' · HCP ' + hoyoIdx : '')`. El chip `live-linea-chip` lo dejé en el DOM pero lo vacío con `chip.textContent = ''` — el elemento HTML estaba definido con la clase `.live-linea-chip` que tiene estilos propios, y podría tener otro uso no detectado. Dejarlo vacío es la opción más conservadora. Si confirma que no se usa en ningún otro lado, se puede eliminar el elemento HTML en otra tarea.

4. **Parte D:** ¿cómo probaste el caso de empate? Dame un ejemplo mental con 4 jugadores donde 2 empatan en 1er lugar.

**R:** `r.data` = [{stbTotal:35}, {stbTotal:35}, {stbTotal:30}, {stbTotal:28}]. Para el jugador [0] (35 pts): nadie tiene más de 35 → pos=1, hay otro con 35 → isTied=true → muestra "T1". Para [1] (35 pts): igual → "T1". Para [2] (30 pts): 2 jugadores tienen más → pos=3, solo uno tiene 30 → isTied=false → muestra "3" (no "2", porque la posición real es 3). Para [3] (28 pts): 3 jugadores tienen más → pos=4 → "4". Resultado: T1, T1, 3, 4.

5. Hash y mensaje de cada commit.

**R:**
- `0641e86` — Tarea 21A: recalcularMAFecha_ — final authoritative MA recalc when all tarjetas signed
- `e80e9e2` — Tarea 21G: fix calcStablefordHole_ missing 85% rule for hcp adjustment
- `efcd9f6` — Tarea 21B-F: Live Scoring UI cleanup + stableford empates + match name color + fecha accordion

6. **Parte E:** ¿le pusiste una clase nueva a los spans de nombre en `buildMatchCard`? ¿Confirmaste con el inspector (o mentalmente) que ahora el blanco del ganador se ve por encima del `var(--navy)` de `.hist-ap`?

**R:** Sí. Ambos spans de nombre en `buildMatchCard` tienen `class="mch-name"`. La regla CSS agregada: `.mch-name .hist-ap,.mch-name .hist-nm{color:inherit !important;}`. El span padre tiene `color:#fff` (ganador) o `color:var(--text)` (perdedor) via el atributo `style=""`. Con `inherit !important` en los spans internos, `.hist-ap` ya no puede imponer `var(--navy)` — heredan el color del padre. Mentalmente: ganador → span padre color:#fff → .hist-ap hereda #fff → nombre blanco ✓. Perdedor → span padre color:var(--text) → .hist-ap hereda var(--text) → nombre oscuro ✓.

7. **Parte F:** ¿`openTarjetaModal` queda sin uso después de este cambio? ¿Usaste `getStbFecha` para traer los datos, o encontraste una razón para no hacerlo?

**R:** Sí, `openTarjetaModal` queda sin uso — era el único caller en el onclick de la tabla de `renderFechaDinamica`. Lo dejé definido tal cual (no lo toqué). Sí usé `getStbFecha`: creé `loadFechaStbAccordion(fecha)` que llama a `ngtApiGet('getStbFecha', { fecha })`, toma los `p.scores`, `pares`, `indices`, `p.stbPorHoyo` del resultado, y llena cada celda `stb-acc-inner-{mat}` con `renderTarjeta18Hoyos(...)`. Los accordiones se crean en el primer render (vacíos, ocultos), el fetch los rellena en background. `liveStbToggle` funciona idéntico para ambas pantallas porque usa el mismo ID `stb-acc-{mat}`.

8. **Parte G:** ¿corriste `calcularGanadoresFechas_` después del fix? ¿Cambió el ganador de alguna fecha ya jugada?

**R:** No puedo correr `calcularGanadoresFechas_` desde acá — es una función GAS admin. Para correrla, Marco debe llamarla desde el editor de Apps Script o desde el panel admin de la app (si hay un botón para eso). Recomiendo hacerlo para recalcular los PosFecha de todas las fechas jugadas, ya que el bug del 85% podía dar ganador incorrecto cuando dos jugadores tenían HCP distinto y la diferencia en hoyos ajustados cambiaba quién sumaba más puntos stableford.

9. ¿Alguna duda?

**R:** No. Un punto a confirmar: después de este deploy, para las fechas anteriores que ya tenían MA mal calculado (por la race condition), el valor en SCORE no se va a corregir automáticamente — el `recalcularMAFecha_` solo se ejecuta cuando la última tarjeta de UNA fecha se firma. Para fechas viejas, Marco puede correr `resetFecha_` + firmar de nuevo, o habría que crear una función admin de corrección de MA. No es urgente si no hay torneos en progreso.
