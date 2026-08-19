# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 13-16 cerradas y probadas en vivo con hasta 5 líneas simultáneas — funcionó bien en general. Marco encontró 6 mejoras/bugs jugando de verdad. Ya investigué cada uno leyendo el código real (no son suposiciones) y dejo abajo el diagnóstico y la solución para cada parte. Es una tarea grande — 6 partes independientes entre sí, hacé **un commit por parte** para poder revisar cada una por separado.

---

## 🎯 Tarea para Claude Code — Tarea 17

### Parte A — Agilizar la carga de score por hoyo (el auto-avance espera de más)

**Diagnóstico:** en `liveSmConfirm` (`index.html`, ~línea 6616), cuando un jugador carga su score, el modal se cierra al toque (línea ~6039-6040), pero el auto-avance al siguiente jugador (`liveAutoAdvancePlayer`) recién se dispara **dentro de `handleOk`**, es decir, después de que el POST a `cargarHoyoLive` vuelve del backend. Cada POST a Apps Script tarda un par de segundos (más si hay que esperar el mutex del jugador), así que entre jugador y jugador hay una espera real — eso es lo que Marco ve como "aparece guardando unos segundos".

**No hace falta rediseñar el backend para arreglar esto** — la clave es que el cliente YA sabe, con los datos que tiene en `LIVE_LINEA_DATA` (actualizados de forma optimista apenas se toca un score), si quedan otros jugadores sin cargar en ese hoyo. Solo hace falta esperar la confirmación del backend en el caso puntual del **último de los 4 jugadores en cargar ese hoyo**, porque ahí es donde el backend decide si corresponde disparar el picker de bonus (Long Drive / Best Approach) — eso sí depende de datos que el cliente no tiene (`meta.bonusHoyos`, `meta.bonusEstado`).

**Cambio a hacer en `liveSmConfirm`:**
1. Después de la actualización optimista (`jug.scores[hoyo-1] = score; liveRender();`), fijate si ya sabés localmente que quedan otros jugadores de la línea sin score en este hoyo (mismo chequeo que ya hace `liveAutoAdvancePlayer` con `allDoneHere`, pero evaluado acá antes de esperar al backend).
2. Si es así (no es el último jugador del hoyo) y no es una edición desde "Revisar Tarjetas" (`LIVE_REVIEW_MAT !== mat`): llamá a `liveAutoAdvancePlayer(hoyo, mat)` **de inmediato**, sin esperar el POST. El POST sigue mandándose igual en paralelo, en segundo plano, con el mismo reintento y manejo de error que ya existe hoy (si termina fallando, se revierte el score local y se avisa con el toast — mismo comportamiento actual, la única diferencia es que ahora el aviso puede llegar cuando el usuario ya está en la pantalla de otro jugador, lo cual está bien).
3. Si es el último jugador del hoyo (o es una edición de Revisar Tarjetas): dejá el comportamiento actual sin cambios — esperar la respuesta del backend antes de avanzar o disparar el bonus, porque ahí sí hace falta el dato que solo tiene el servidor.
4. Ajustá `handleOk` para no volver a llamar `liveAutoAdvancePlayer` si ya se llamó de forma optimista en el paso 2 (evitar doble avance).

Con esto, 3 de cada 4 cargas por hoyo deberían sentirse instantáneas, y solo la última (antes de pasar al hoyo siguiente) sigue esperando al servidor como hasta ahora.

---

### Parte B — La franja de "fecha activa" no se cierra cuando termina el torneo del día

**Diagnóstico — encontré el bug exacto, no es un tema de refresco:** en `applyFechaActiva(fa)` (`index.html`, ~línea 7754), la función solo tiene código para **mostrar** la franja cuando hay una fecha activa (`if(!fa || !fa.fechaNum) return;` corta ahí mismo). Cuando el backend ya no tiene ninguna fecha activa (todas las líneas terminaron), `initData` igual manda `fechaActiva: null` explícitamente — y como `d.fechaActiva !== undefined` es cierto incluso para `null`, se llama `applyFechaActiva(null)`, que no hace nada. **Nunca existió el código para ocultar la franja** — por eso queda pegada con el último dato que tenía guardado en `localStorage` (`ngt_fechaActiva`).

**Fix:** en `applyFechaActiva(fa)`, agregar el caso contrario: cuando `!fa || !fa.fechaNum`, ocultar la franja (`strip.style.display='none'`, `strip.dataset.active='0'`) y limpiar `localStorage.removeItem('ngt_fechaActiva')` para que no vuelva a aparecer un instante en la próxima carga de la app antes de que responda la API.

**Segundo hallazgo, relacionado (confirmá antes de tocar):** la función backend `getFechaActiva_()` (`03_Reads.gs`, ~línea 963) decide si una fecha está "completada" leyendo `r[6]` de las columnas A-G de `TARJETAS` como si fuera el score del Hoyo 1. Comparando contra cómo `cargarHoyoLive_` realmente escribe los hoyos (`07_LiveScoring.gs`, `sh.getRange(rowIdx, 4 + hoyoNum)` — Hoyo 1 = columna E, no G), y contra cómo `cargarTarjeta_` arma la fila (`04_Writes.gs`, `newRow[2+h]` = Hoyo1 en la 3ra posición desde la columna C = columna E también), la columna real de Hoyo 1 es **E**, no G — G sería Hoyo 3. Es decir, `getFechaActiva_()` está chequeando si el jugador llegó al hoyo 3, no si cargó el hoyo 1. En la práctica esto probablemente no afecta el cierre final (para cuando termina la ronda ya se cargó el hoyo 3 también), pero es un dato incorrecto que puede confundir en casos raros (por ejemplo demoras en detectar que alguien ya arrancó a cargar). **Confirmá vos mismo cuál es la columna real de Hoyo 1** (cruzando `cargarHoyoLive_` y `cargarTarjeta_`, no confíes en los comentarios del código — encontré varios comentarios de columnas desactualizados en `04_Writes.gs`) y corregí `getFechaActiva_()` para que lea la columna correcta.

---

### Parte C — El Match de Live Scoring muestra resultados imposibles (ej. "8&2")

**Diagnóstico:** en `buildLineaSnapshot_` (`07_LiveScoring.gs`, ~línea 147-160), el cálculo del match recorre los 18 hoyos y suma puntos ganados/perdidos por cada uno con datos cargados, **sin frenar cuando el match ya está matemáticamente decidido**. En golf, un match termina en el momento en que la diferencia de hoyos ganados supera a los hoyos que quedan por jugar (ej: 5 arriba con 4 por jugar = termina "5&4", ahí mismo, no se sigue contando). Como acá el torneo sigue jugando los 18 hoyos igual (por el Stableford y otros formatos), el cálculo del match sigue sumando hoyos jugados después del cierre real, y el resultado final que se muestra (`diff` y `remaining` calculados sobre TODOS los hoyos con datos) puede terminar siendo una combinación imposible como "8&2" (nunca hubiera llegado a jugarse el hoyo que generó ese resultado, porque el match ya había terminado antes).

**Fix:** en el `for (let h = 0; h < 18; h++)` que calcula `pts1`/`pts2`/`detallePorHoyo`, cortar el conteo apenas se detecte el cierre matemático: después de sumar el resultado de cada hoyo, calculá la diferencia acumulada hasta ese hoyo y los hoyos que quedan (`18 - (h+1)`) — si el valor absoluto de la diferencia ya supera los hoyos restantes, ese es el hoyo de cierre: dejá de procesar hoyos siguientes (aunque tengan datos cargados), y que `hoyosJugados`/`diff`/`remaining` quede congelado en el valor de ese hoyo de cierre. Los hoyos posteriores al cierre no deberían sumar al resultado del match (podés dejarlos sin marcar en `detallePorHoyo`, o marcarlos de alguna forma neutra si querés — es una decisión de diseño menor, elegí la que te parezca más clara).

Con el ejemplo de Marco: si en el hoyo 14 alguien queda 5 arriba con 4 por jugar, el cálculo debería frenar ahí y mostrar "5&4", sin importar qué pase en los hoyos 15 a 18.

---

### Parte D — Contraste de texto en los matches de otras pantallas

Marco me señaló que en los matches de otras pantallas de la app (fecha pasada, sección Match) falta poner el nombre del jugador en blanco cuando el fondo se pinta de rojo o azul. **Revisé el código de `buildMatchCard()` (`index.html`, ~línea 3179, usado en `renderMatchTable()` y `fechaMatchRender()`) y de `liveRenderMatchBody()` (la del propio Live Scoring, ~línea 6278) y en ambas el texto YA se pone en blanco (`color:'#fff'`) cuando el lado gana y se pinta de color** — no encontré, leyendo el código, un lugar con el bug tal como lo describe.

Antes de tocar nada: hacé tu propia revisión (buscá cualquier otro lugar del archivo que pinte texto de jugador sobre fondo rojo/azul de match, por si hay una tercera función que no encontré) y confirmame qué encontraste. Si realmente no hay ningún lugar con el bug en el código actual, decímelo así en vez de "arreglar" algo que ya está bien — le voy a pedir a Marco una captura de pantalla de dónde lo ve para identificar el lugar exacto.

---

### Parte E — La tarjeta desplegada en Stableford de Live Scoring obliga a hacer scroll horizontal

**Diagnóstico:** al tocar un jugador en la tabla de Stableford de Live Scoring (`liveLoadStableford()`, `index.html` ~línea 6357), se despliega una fila acordeón (`liveStbToggle`) que muestra `renderTarjeta18Hoyos()` — esta función ya arma la tarjeta como dos tablas de 9 hoyos (IDA y VUELTA), así que el "9 hoyos por línea" ya está — el problema es que cada hoyo se dibuja como una insignia de score fija de 30×30px (`.sc-sym`, línea ~1257) más una columna de etiqueta de 50px de ancho (`.perf-ecl-table .lbl`, línea ~1356), y esa tabla interna está metida dentro de la fila del acordeón, dentro de la tabla general de Stableford — el ancho mínimo que necesita term ina forzando scroll horizontal en el celular, y de paso puede estar empujando el ancho de toda la tabla de Stableford (no solo la parte desplegada).

**Fix:**
1. A la tabla general de Stableford (el `<table>` que arma `liveLoadStableford()`, línea ~6370), agregale `table-layout:fixed` para que el contenido de la fila desplegada no pueda forzar el ancho de toda la tabla.
2. Para el uso específico de `renderTarjeta18Hoyos()` dentro de este acordeón (línea ~6381 — **no** toques los otros 3 usos de esta función, en el modal de tarjeta individual, en la tabla eclíptica de perfil, ni en el otro lugar que la usa, que hoy están bien porque tienen más espacio disponible), hacé una versión más compacta: insignias de score más chicas (por ejemplo 22-24px en vez de 30px) y columna de etiqueta más angosta (por ejemplo 34px en vez de 50px), lo suficiente para que las 2 tablas de 9 hoyos entren completas en el ancho de un celular común (~360-390px) sin necesitar scroll horizontal. Podés lograrlo agregando una clase modificadora (ej. `.perf-ecl-table.compact`) que se aplique solo en este caso, o agregando un parámetro opcional a `renderTarjeta18Hoyos()` — elegí lo que te resulte más prolijo, pero confirmá que los otros 3 usos de la función no cambian de tamaño.

---

### Parte F — El scroll vertical no llega hasta el final, la barra inferior tapa contenido

**Diagnóstico — encontré el bug exacto:** las páginas reservan espacio abajo para no quedar tapadas por la barra inferior fija con `.pg.with-bnav{padding-bottom:66px;}` (línea ~1512). Pero desde la Tarea 11 existe también la franja fija de "fecha activa" (`#fecha-activa-strip`), que se dibuja **arriba** de la barra inferior (`bottom:66px; height:40px`, línea ~1497) y está visible en casi toda la app (todo menos dentro de Live Scoring). El padding de las páginas nunca se actualizó para sumar esos 40px extra — por eso, en cualquier pantalla donde la franja está visible, el final del contenido queda tapado por esa franja (que se suma a la barra inferior).

**Fix:** en vez de un valor fijo de 66px, hacé que el padding-bottom de las páginas sea dinámico según si la franja está visible o no — el mismo patrón que ya usa la app para la altura del topbar (`setTbHeight()`, línea ~3322, que mide el alto real y lo guarda en la variable CSS `--tb-h`). Armá algo equivalente para el pie: medí la altura combinada de la barra inferior + la franja (cuando está visible) y guardala en una variable CSS (ej. `--footer-h`), y cambiá `.pg.with-bnav` para usar `padding-bottom:var(--footer-h, 66px)`. Llamá a esta función de recálculo cada vez que la franja cambia de visible a oculta o viceversa (al entrar/salir de Live Scoring, y en `applyFechaActiva` — tanto cuando se muestra como cuando se oculta, la de la Parte B de esta misma tarea).

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿confirmaste que 3 de los 4 jugadores avanzan sin esperar al servidor? ¿Qué pasa si el guardado en segundo plano de un jugador que ya "avanzó" termina fallando — se revierte bien y se avisa, aunque el usuario ya esté en la pantalla de otro jugador?
2. **Parte B:** ¿la franja desaparece sola cuando termina la última línea de la fecha? ¿Cuál es la columna real de Hoyo 1 en `TARJETAS` que confirmaste, y la corregiste en `getFechaActiva_()`?
3. **Parte C:** ¿probaste el caso del ejemplo (5 arriba en el hoyo 14, 4 por jugar) y confirma que corta en "5&4" en vez de seguir sumando?
4. **Parte D:** ¿qué encontraste? ¿Había algún lugar con el bug real, o el código ya estaba bien como sospeché?
5. **Parte E:** ¿las 2 tablas de 9 hoyos entran sin scroll horizontal en un ancho de celular común? ¿Confirmaste que los otros 3 usos de `renderTarjeta18Hoyos()` no cambiaron de tamaño?
6. **Parte F:** ¿el contenido llega hasta el final sin quedar tapado, tanto con la franja visible como sin ella?
7. ¿Hiciste un commit por parte (A a F)? Hash y mensaje de cada uno.
8. ¿Algo de esta tarea te generó dudas? Contame qué decidiste y por qué.

---

## ✅ Respuestas de verificación — Tarea 17

**1. Parte A — Auto-avance optimista:**

Sí. En `liveSmConfirm`, después del update optimista y `liveRender()`, se evalúa si todos los jugadores ya tienen score en ese hoyo (`allDoneHere`). Si quedan jugadores sin score (≠ el último), se llama `liveAutoAdvancePlayer` de inmediato sin esperar el POST — esto cubre 3 de los 4 guardados por hoyo. El POST sigue mandándose en paralelo.

Para el último jugador del hoyo (`allDoneHere === true`), o para ediciones de revisión (`LIVE_REVIEW_MAT === mat`), se mantiene el comportamiento original: esperar la respuesta del backend antes de avanzar (porque ahí sí hace falta `bonusPendiente`).

En `handleOk`, se agregó `else if(!optimisticAdvanced)` para no llamar `liveAutoAdvancePlayer` una segunda vez en los casos que ya avanzaron optimísticamente.

Si el guardado en segundo plano falla (ambos intentos fallen): `onFinalFailure` revierte `jug.scores[hoyo-1] = null` y llama `liveRender()` para actualizar la UI, más el toast "Error al guardar". El usuario ya puede estar en la pantalla del siguiente jugador cuando esto ocurre — el toast es visible desde cualquier pantalla del Live Scoring (`position:fixed`), así que el aviso llega igual. No probé en producción con falla real.

**2. Parte B — Franja se oculta al terminar + fix columna:**

En `applyFechaActiva(fa)`, cuando `!fa || !fa.fechaNum` (que es lo que el backend manda cuando no hay fecha activa), ahora se oculta la franja con `strip.style.display='none'`, `strip.dataset.active='0'` y `localStorage.removeItem('ngt_fechaActiva')`. También llama `setFooterHeight()` para actualizar el padding. Antes, el `return` inmediato dejaba todo intacto.

Columna real de Hoyo 1 en TARJETAS, verificada cruzando dos fuentes:
- `cargarHoyoLive_` (`07_LiveScoring.gs`): `sh.getRange(rowIdx, 4 + hoyoNum)` → para hoyo=1, columna 5 = **E**
- `cargarTarjeta_` (`04_Writes.gs`): `sh.getRange(rowIdx, 3, 1, 22).setValues([newRow])` con `newRow[2+h]` para hoyos → newRow[0]=hcp→C, newRow[1]=canchaId→D, newRow[2]=H1→**E**

El comentario en `getFechaActiva_` (03_Reads.gs) estaba mal (decía `C(2)=nombre, D(3)=hcp, E(4)=cancha, F(5)=canchaId, G(6)=hoyo1`) y el código usaba `r[6]` = columna G = Hoyo 3. Corregido a `r[4]` = columna E = Hoyo 1, con comentario actualizado.

**3. Parte C — Match early termination:**

Sí. En el `for` de `buildLineaSnapshot_`, después de cada hoyo procesado, se calcula `diffSoFar = pts1 - pts2` y se compara `Math.abs(diffSoFar) > (18 - hoyosJugados)`. Si se cumple, se hace `break` — los hoyos posteriores al cierre quedan con `detallePorHoyo[h] = null` (sin marcar), y `pts1/pts2/hoyosJugados` quedan fijos en el valor del hoyo de cierre.

Para el ejemplo de Marco: 5 UP en hoyo 14 → `diffSoFar=5`, `18-14=4`, `5>4` → break. `hoyosJugados=14`, `remaining=18-14=4`, resultado `"5&4"`. No pude probar con datos reales de un torneo.

**4. Parte D — Match text contrast:**

No hay bug en el código. Revisé:
- `buildMatchCard()` (~línea 3179): `var l1Txt = j1Wins ? '#fff' : 'var(--text)'` → nombre en blanco cuando el fondo es azul/rojo ✓
- `liveRenderMatchBody()` (~línea 6278): `var l1Txt = j1Wins ? '#fff' : 'var(--text)'` → mismo patrón ✓

No hay una tercera función que pinte nombres sobre fondo coloreado. No hice ningún cambio de código — commit vacío para documentarlo. Hay que pedirle a Marco una captura de dónde ve el problema, porque el código actual ya hace lo correcto.

**5. Parte E — Scorecard compacta en Stableford:**

Tres cambios:
1. CSS: `.perf-ecl-table.compact .sc-sym{width:22px;height:22px;font-size:11px;}` y `.perf-ecl-table.compact .lbl{width:34px;font-size:9px;}` más padding/fuente reducidos en th/td
2. `renderTarjeta18Hoyos` ahora acepta un 6° parámetro `compact` — si `true`, la tabla lleva clase `perf-ecl-table compact`
3. En `liveLoadStableford`: tabla externa con `table-layout:fixed` (evita que el acordeón ensanche las otras columnas), y `renderTarjeta18Hoyos(..., true)` para el scorecard compacto

Los otros 3 usos de `renderTarjeta18Hoyos` (modal de tarjeta individual, tabla eclíptica de perfil, modal de ronda bajo par) no pasan el 6° parámetro → reciben `compact=undefined` → usan la clase original `perf-ecl-table` sin `.compact`. No cambié su tamaño. No pude verificar en browser que las 2 tablas de 9 hoyos queden dentro del viewport en 360px — estimé que 34px de etiqueta + 10×(22+4)px = 34+260=294px por mitad + algo de padding ≈ 310px → entra en 360px, pero hay que verificar en un celular real.

**6. Parte F — Padding-bottom dinámico:**

Agregué `setFooterHeight()` que:
- Mide el alto real de `#bnav-main` con `getBoundingClientRect().height` (fallback 66px)
- Suma el alto de `#fecha-activa-strip` solo si está visible (`display !== 'none'` && `dataset.active === '1'`)
- Guarda el resultado en `--footer-h`

`.pg.with-bnav` ahora usa `padding-bottom:var(--footer-h,66px)`.

Se llama en: `setFooterHeight()` al cargar; `resize` y `load`; `applyFechaActiva` (ambas ramas — cuando muestra y cuando oculta la franja); `pg()` al final (cubre entrar/salir de Live Scoring que oculta/muestra la franja).

No pude verificar visualmente en un celular real. El cálculo es correcto en teoría: con franja visible, `--footer-h ≈ 106px` (66+40); sin franja, `≈ 66px`.

**7. Commits:**

- `17ac80a` — `Tarea 17 Parte A — auto-avance optimista en liveSmConfirm (index.html)`
- `a367e1c` — `Tarea 17 Parte B — applyFechaActiva oculta franja al terminar + fix col Hoyo1`
- `ed559c9` — `Tarea 17 Parte C — cortar match en hoyo de cierre en buildLineaSnapshot_ (07_LiveScoring.gs)`
- `deb364b` — `Tarea 17 Parte D — sin cambio: texto en match ya usa #fff sobre fondo coloreado`
- `f186cfe` — `Tarea 17 Parte E — scorecard compacta en acordeón Stableford sin scroll horizontal`
- `4000377` — `Tarea 17 Parte F — padding-bottom dinámico para franja + barra inferior (index.html)`

**8. Dudas y decisiones:**

- **Parte A — `allDoneHere` post-update**: el chequeo de si "quedan otros jugadores" se hace DESPUÉS del update optimista, es decir `jug.scores[hoyo-1]` ya tiene el nuevo score. Si soy el último en cargar, `allDoneHere` es `true` → espero backend (correcto: necesito `bonusPendiente`). Si no soy el último, `allDoneHere` es `false` → avanzo de inmediato (correcto). El orden de operaciones es clave y es correcto.

- **Parte B — `var strip` doble declaración**: el código original declaraba `var strip = ...` dos veces dentro de la misma función (una nueva al inicio, otra en el bloque `if`). En JS `var` tiene function scope, así que no falla, pero lo consolidé en una sola declaración al inicio de la función.

- **Parte C — hoyos posteriores en `detallePorHoyo`**: decidí dejarlos como `null` (que ya es el valor inicial del array). La UI de `liveRenderMatchBody` los renderiza como círculo vacío (borde gris, sin color), lo cual es la representación más honesta de "este hoyo no contó para el match". No los marqué de ninguna forma especial.

- **Parte F — `setFooterHeight` antes que `setTbHeight`**: `setTbHeight` no llama `setFooterHeight` ni viceversa — son independientes, cada una guarda su propia variable CSS. No hay riesgo de orden de llamado.
