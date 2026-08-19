# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 10-12 (rediseño de navegación) cerradas y verificadas. Marco probó la app real (`https://marbar82.github.io/NGT/`) y encontró 7 correcciones — algunas visuales chicas, pero **3 de ellas son bugs reales de funcionamiento, no solo estética** (ver Partes D, E y C). Esta es la **Tarea 13**. Es la más delicada hasta ahora porque toca la carga de score en vivo, que es lo que se usa en cancha con el torneo en curso — probá cada parte con cuidado antes de pasar a la siguiente, un commit por parte (A a G).

---

## 🎯 Contexto de la tarea

Ya investigué el código a fondo para cada uno de los 7 puntos que reportó Marco, así que las instrucciones de abajo son precisas (archivo y línea). Aun así, antes de tocar cualquier función, confirmá con grep quién más la usa — varias de estas piezas están compartidas entre Live Scoring y otras pantallas.

Dos hallazgos importantes que vale la pena que sepas antes de empezar:

- **Parte B (tabs sin texto legible):** no es que falte el texto — ya está en el HTML. Es un bug de contraste: el texto es blanco sobre fondo blanco. Se ve solo el emoji porque los emojis ignoran el `color` del CSS.
- **Parte G (falta ida/vuelta en la tarjeta):** el cálculo y la separación de IDA/VUELTA con sus totales **ya existen** en `renderTarjeta18Hoyos()`. Lo que probablemente pasó es que, al estar sin destacar visualmente (celda chica, sin fondo, mismo estilo que el resto), el total pasa desapercibido. Antes de asumir que hay que calcular algo nuevo, confirmá esto y avisá si encontraste que realmente no se ve en algún caso.

---

## 🎯 Tarea para Claude Code

### Parte A — Sacar el card duplicado del Leaderboard; arreglar la franja persistente

Hoy con fecha activa aparecen DOS avisos: el card `home-fecha-card` arriba de la tabla del Leaderboard (`index.html`, `pg-lb`, con el botón `#home-fecha-btn`) y la franja persistente `#fecha-activa-strip`. Marco pidió sacar el card y dejar solo la franja.

- Sacá el botón `#home-fecha-btn` (`home-fecha-card`) de `#pg-lb` por completo. Confirmá con grep que `applyFechaActiva()` no rompe si esos elementos (`hfi-num`, `hfi-cancha`, `hfi-fecha`, `hfi-fecha-row`) ya no existen — si hace falta, ajustá esa función para que solo actualice lo que queda (la franja).
- En la franja (`#fecha-activa-strip`, `.fas-cta`, línea ~1497 del CSS): cambiá `color:var(--red)` por blanco (`color:#fff` o `var(--white)`), y cambiá el texto "Continuar →" (línea ~2415) por "Cargar Score →".

### Parte B — Tabs de Live Scoring: arreglar contraste, no agregar texto (ya está)

`.live-bottom-nav` perdió el fondo oscuro al convertirse en tabs inline en la Tarea 11, pero `.live-nav-tab` sigue con texto blanco (`rgba(255,255,255,.45)` / `#fff`) — por eso se ve invisible sobre fondo blanco, y solo se percibe el emoji.

- Arreglá el contraste: la forma más simple es darle a `.live-bottom-nav` un fondo oscuro (mismo criterio que `.bottom-nav`, que usa `var(--navy)` y sí funciona con esa paleta de texto) — pero como ahora es una barra de tabs de sección (no fija abajo), evaluá si te parece mejor visualmente eso, o cambiar el color de texto a oscuro sobre fondo claro. Elegí el tratamiento que más consistente quede con el resto del sistema de diseño (podés usar el mismo patrón de tabs que uses en Historia si ya definiste uno ahí).
- De paso, subí el tamaño de fuente (hoy 10px, es chico para pestañas) y pasá de layout apilado (ícono arriba, texto abajo) a un layout más de pestaña tradicional si te parece que se lee mejor — el pedido de Marco es que se lea claro "Tarjeta / Stableford / Match / Bonus" como palabras, no solo íconos.

### Parte C — Hoyo de salida: la tarjeta debe arrancar en el hoyo configurado, no siempre en el 1

El dato `hoyoSalida` (definido por el admin al crear la fecha, para arranques tipo shotgun) ya se guarda bien en el backend y ya llega al frontend dentro del snapshot de `getLineaLive` — pero ninguna función del frontend lo usa. Hoy `LIVE_HOYO` arranca siempre en 1 (`index.html` línea ~5653 y ~6088), y `liveInitHoyo()` (línea ~6167) recorre del hoyo 1 al 18 buscando el primer hueco vacío, así que con un arranque en hoyo 10 (nadie cargó nada del 1 al 9 todavía) siempre "aterriza" en el hoyo 1 en vez del 10.

- Ajustá `liveInitHoyo(data)` para que arranque la búsqueda del primer hoyo pendiente desde `data.hoyoSalida` (con wraparound: si no encuentra ninguno vacío desde `hoyoSalida` hasta 18, seguí buscando desde el hoyo 1 hasta `hoyoSalida - 1`, en vez de terminar en 18 sin revisar el resto).
- Ajustá `livePrevHoyo()` / `liveNextHoyo()` (línea ~6573) para que la navegación también dé la vuelta correctamente en un arranque tipo shotgun (ej. arrancando en 10: 10→11→...→18→1→2→...→9→10), no que se quede clampeada en 1 y 18 como si siempre se jugara en orden lineal.
- Ajustá el auto-avance de hoyo (dentro de `liveAutoAdvance()`, línea ~6530) con el mismo criterio de recorrido circular desde `hoyoSalida`.
- Probá el caso normal (`hoyoSalida = 1`, el 99% de las fechas) para confirmar que no se rompió nada ahí — tiene que comportarse exactamente igual que hoy.

### Parte D — Bonus (Long Drive / Best Approach): esperar a que los 4 jugadores tengan score en ese hoyo

Hoy el picker de "¿quién ganó Long Drive/Best Approach?" (`liveBonusModalAbrir`, disparado desde `liveSmConfirm`, `index.html` línea ~6499-6528) aparece apenas se carga el score del **primer** jugador en el hoyo designado — interrumpiendo antes de que los otros 3 tengan su score. La condición está en el backend, `cargarHoyoLive_` (`07_LiveScoring.gs` líneas 276-284): solo chequea que el hoyo coincida con `meta.bonusHoyos.ba`/`.ld` y que el bonus no esté resuelto, sin mirar cuántos jugadores de la línea ya cargaron ese hoyo.

- En `cargarHoyoLive_`, sumá la condición de que **los 4 jugadores de la línea ya tengan score cargado en ese hoyo** antes de devolver `bonusPendiente`. Si falta alguno, no dispares el bonus todavía — se va a disparar naturalmente cuando se cargue el último de los 4 (podés chequearlo en cada guardado individual, comparando contra el snapshot de la línea).
- Confirmá que el flujo sigue funcionando para el caso normal: hoyo bonus con los 4 jugadores completos → aparece el picker una sola vez, no se dispara de nuevo después.

### Parte E — Auto-avance entre jugadores + feedback de guardado + condición de carrera real

Esta es la parte más delicada, hay 3 problemas relacionados en el mismo flujo:

**E.1 — Falta auto-avance entre jugadores (fricción real, confirmado en código):**
Hoy cargar el score de los 4 jugadores de un hoyo requiere tocar manualmente cada fila uno por uno (`liveOpenScoreModal(hoyo, matricula)`) — no hay ningún salto automático al jugador siguiente después de guardar. Solo existe avance automático de **hoyo** (`liveAutoAdvance()`, línea ~6530), y únicamente cuando los 4 ya están completos en el hoyo actual.

Agregá auto-avance **entre jugadores dentro del mismo hoyo**: al confirmar el score del jugador actual (dentro de `liveSmConfirm`), si hay un jugador siguiente de la línea sin score en este hoyo, abrí automáticamente su modal de carga (mismo patrón que usa GolfGameBook: jugador 1 → jugador 2 → jugador 3 → jugador 4, en cadena, sin que el usuario tenga que tocar nada entre uno y otro). Si un jugador queda sin cargar (el usuario cierra el modal sin ingresar nada), tiene que poder cargarlo después tocando su fila manualmente, como hoy — no lo hagas obligatorio.

**E.2 — Falta feedback visual de guardado:**
Hoy no hay ningún indicador de "guardando..." — el círculo del hoyo pasa directo de vacío a lleno con un update optimista (se pinta lleno ANTES de que el backend confirme), sin esperar la respuesta del `POST cargarHoyoLive`. Agregá un estado visual breve de "guardando" (podés usar una clase CSS con una animación sutil, o un ícono chico de reloj/spinner en el círculo) que se resuelva a "guardado" (o vuelva a vacío + aviso de error) cuando llegue la respuesta del backend — para que quede claro que el dato se mandó y confirmó, no adivinado.

**E.3 — Condición de carrera real entre el polling y el guardado (esto es un bug, no solo estético):**
`livePollStart()` corre un `setInterval(livePoll, 8000)` que lee el estado completo de la línea cada 8 segundos, en paralelo a que el usuario esté cargando scores. Ni `livePoll()` ni `liveSmConfirm()` tienen ninguna forma de saber cuál de las dos respuestas es más reciente — cualquiera de las dos puede sobreescribir `LIVE_LINEA_DATA` completo con una versión más vieja que lo que el usuario acaba de cargar, haciendo que un hoyo recién guardado "vuelva" a verse vacío por un instante hasta que se corrige solo. Esto es lo que Marco describe como "pasa de transparente a opaco y de nuevo a transparente".

Agregá una guarda de secuencia: cada vez que se dispara un guardado local (optimista o confirmado por el POST), guardá un timestamp o número de secuencia; cuando llegue una respuesta del `livePoll()`, si es más vieja que el último cambio local conocido, ignorala (no sobreescribas `LIVE_LINEA_DATA` con datos desactualizados). Además, agregá un reintento simple si el `POST cargarHoyoLive` falla (hoy el `.catch()` no hace nada, línea ~6527) — al menos un reintento automático antes de mostrarle al usuario que falló.

**E.4 — Lock global de escritura (evaluar con cuidado, no forzar el cambio si es riesgoso):**
`cargarHoyoLive_` usa `LockService.getScriptLock()` (`07_LiveScoring.gs` líneas 244-253) — es un lock de **todo el script**, no por fecha/línea, así que con varias líneas cargando en simultáneo durante el torneo, todas las escrituras del sistema entero se serializan una por una. Esto puede ser parte de la lentitud que reporta Marco en horas pico. Si te parece seguro achicar el alcance del lock (por ejemplo, un lock por combinación fecha+línea en vez de global), hacelo — pero si tenés dudas de que pueda generar datos corruptos o inconsistentes al hacerlo, no lo toques todavía y avisá en las respuestas para decidirlo con más cuidado antes de aplicarlo.

### Parte F — Botones "Finalizar Ronda" y "Revisar Tarjetas"

Hoy no existe ninguno de los dos. Lo único parecido es que cuando los 4 jugadores llegan a 18 hoyos cargados (`allComplete`, dentro de `liveRender()`, línea ~6184), aparece automáticamente una vista `#live-complete-view` con un resumen y un botón "✍ Firmar" que es individual (solo para el jugador logueado), no de la línea completa.

- Cuando `allComplete` sea verdadero, mostrá dos botones nuevos junto al resumen existente: **"Finalizar Ronda"** y **"Revisar Tarjetas"**.
- **"Finalizar Ronda":** al tocarlo, da por cerrada la carga de esa línea — podés usarlo para, por ejemplo, dejar de hacer polling automático (`livePollStop()`) y llevar al usuario de vuelta a una vista de resumen/Leaderboard. No hace falta que bloquee la edición futura de scores (eso lo cubre "Revisar Tarjetas", que Marco pidió explícitamente que permita seguir modificando) — es más una acción de "ya terminamos, cerrar esta pantalla", no un candado de datos.
- **"Revisar Tarjetas":** al tocarlo, mostrá los 4 jugadores de la línea (nombre + resumen corto). Al tocar un nombre, abrí la tarjeta completa de ese jugador — reutilizá `showPlayerScorecardModal(matricula)` como base (ya arma la tabla de 18 hoyos con IDA/VUELTA, ver Parte G), pero agregale la posibilidad de tocar el score de cualquier hoyo y editarlo ahí mismo (podés reutilizar el mismo modal de teclado numérico que ya usa `liveOpenScoreModal` para la carga normal, pero disparado desde esta vista de revisión en vez de la vista de carga por hoyo).

### Parte G — Estilo de la tarjeta del jugador (IDA/VUELTA, números de hoyo, par y puntos)

**Antes de tocar el cálculo:** confirmá que `renderTarjeta18Hoyos()` (línea ~7440) ya arma las tablas IDA y VUELTA por separado, cada una con su columna "Tot" (par total, score total, puntos STB total del 9). Si efectivamente ya está — que es lo que encontré — el pedido de Marco es de **visibilidad**, no de cálculo faltante: hacé esos totales más destacados (por ejemplo, una fila/celda de cierre más grande o con más contraste, en vez de una celda chica igual a las demás).

- Número de hoyo (hoy `<th>` con `background:var(--off)` y `color:var(--g4)`, texto gris chico): cambialo a fondo azul (`var(--navy)`) y texto blanco.
- Fila "Par" y fila "Puntos" (hoy sin fondo propio, clase `.perf-ecl-par`): agregales fondo gris clarito (`var(--g1)`, ya existe en la paleta) para diferenciarlas visualmente del resto de la tabla.
- Aplicá esto en la tabla que usa `showPlayerScorecardModal` (y cualquier otro lugar que reutilice `renderTarjeta18Hoyos`, para que quede consistente en toda la app — confirmá dónde más se usa esta función antes de cambiar el CSS, por si el estilo nuevo no encaja en algún otro contexto).

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿el card duplicado desapareció sin romper nada de `applyFechaActiva()`? ¿La franja ahora dice "Cargar Score →" en blanco?
2. **Parte B:** ¿qué tratamiento visual elegiste para el contraste de los tabs? ¿Se lee claro "Tarjeta/Stableford/Match/Bonus" ahora?
3. **Parte C:** ¿probaste con una fecha de `hoyoSalida = 10` (o el valor que tengas a mano) que la tarjeta arranca ahí? ¿Confirmaste que el caso normal (`hoyoSalida = 1`) sigue igual que antes?
4. **Parte D:** ¿el picker de bonus ahora espera a los 4 jugadores? ¿Probaste el caso donde el último en cargar es justamente el hoyo bonus?
5. **Parte E:** contame en detalle qué implementaste para cada sub-punto (E.1 auto-avance, E.2 feedback visual, E.3 guarda de secuencia contra el polling, E.4 lock global) — si en E.4 decidiste no tocar el lock, explicá por qué.
6. **Parte F:** ¿"Finalizar Ronda" y "Revisar Tarjetas" aparecen solo cuando los 4 jugadores completan 18 hoyos? ¿La edición de score desde "Revisar Tarjetas" reutiliza el mismo modal de teclado numérico que la carga normal, o armaste uno nuevo?
7. **Parte G:** ¿confirmaste que el cálculo de IDA/VUELTA ya existía? ¿Dónde más en la app se usa `renderTarjeta18Hoyos()`, y el nuevo estilo quedó bien en todos esos lugares?
8. ¿Hiciste un commit por cada parte (A a G)? Listalos con hash y mensaje.
9. ¿Probaste el flujo completo de carga de una línea de 4 jugadores, hoyo por hoyo, hasta completar los 18, incluido un hoyo bonus, sin encontrar el bug de "vuelve a verses vacío"?
10. ¿Algo de esta tarea te generó dudas y tuviste que decidir por tu cuenta? Contame qué y por qué, aunque el resultado te parezca bien — en particular si encontraste algo en Parte E o F que no se comportaba como esperaba el enunciado.

---

## ✅ Respuestas de verificación — Tarea 13

**1. Parte A:**
Sí. El `#home-fecha-btn` / `.home-fecha-card` fue eliminado del HTML de `#pg-lb` por completo. `applyFechaActiva()` fue simplificada: ahora solo actualiza la franja persistente (`#fecha-activa-strip` / `#fas-label`) y ya no intenta tocar `hfi-num`, `hfi-cancha`, `hfi-fecha` ni `hfi-fecha-row` — esos elementos ya no existen. La franja ahora muestra "Cargar Score →" en blanco (`color:#fff`) sobre el fondo azul oscuro de la strip.

**2. Parte B:**
Elegí fondo claro sobre oscuro, consistente con el patrón `.adm-tab` del resto del sistema:
- `.live-bottom-nav` tiene ahora `background:var(--g1)` (gris muy claro) y `border-bottom:2px solid var(--border)` en vez del borde rojo que tenía antes.
- `.live-nav-tab`: `color:var(--g4)` (texto gris oscuro legible), layout horizontal (`flex-direction:row`), fuente 13px (antes 10px).
- `.live-nav-tab.active`: `color:var(--navy)` + subrayado rojo.
Texto "Tarjeta / Stableford / Match / Bonus" perfectamente legible. El emoji queda al lado del texto en vez de encima.

**3. Parte C:**
`liveInitHoyo(data)` ahora arranca la búsqueda desde `data.hoyoSalida - 1` (0-based) y hace wraparound circular por los 18 hoyos. Si todos están completos, aterriza en el último hoyo del recorrido (`(hs + 17) % 18 + 1`).

`livePrevHoyo()` / `liveNextHoyo()`: circular completo — al llegar a hoyo 18 el "siguiente" es hoyo 1 y viceversa.

`liveAutoAdvance()`: calcula el offset del hoyo actual respecto a `hoyoSalida` y busca hacia adelante con wraparound en vez de recorrer linealmente desde `LIVE_HOYO` hasta 18.

Caso normal `hoyoSalida = 1`: `hs = 0`, el offset circular es idéntico al recorrido lineal 1→18, comportamiento exactamente igual que antes.

**4. Parte D:**
Sí. En `cargarHoyoLive_` (`07_LiveScoring.gs`), antes de devolver `bonusPendiente` ahora se verifica que `snap.jugadores.every(j => j.scores[hoyoIdx] !== null)`. Si alguno de los 4 todavía no tiene score en ese hoyo, `bonusPendiente` queda `null` y el picker no se dispara. Cuando el último jugador carga su score, la condición se cumple y el picker aparece una sola vez. Una vez que `bonusEstado.ba` o `.ld` están marcados como resueltos, la condición `!bonusEstado.ba` evita que se dispare de nuevo.

**5. Parte E:**

- **E.1 — Auto-avance entre jugadores:** Nueva función `liveAutoAdvancePlayer(hoyo, justSavedMat)`. Después de que `handleOk()` procesa la respuesta del POST, si no hay bonus pendiente llama a esta función en vez de directamente a `liveAutoAdvance()`. Si el hoyo actual tiene algún jugador sin score, busca el siguiente después de `justSavedMat` (circular) y abre su modal con 300ms de delay. Si están todos completos, llama a `liveAutoAdvance()` para avanzar al próximo hoyo.

- **E.2 — Feedback visual de guardado:** Variables `LIVE_SAVING_MAT` y `LIVE_SAVING_HOYO` que se setean al inicio de `liveSmConfirm()` y se limpian cuando la promesa del POST se resuelve (exitosa o con fallo definitivo). En `liveRenderHoyoActual()`, el círculo del jugador en-vuelo recibe la clase adicional `.saving`, que aplica un ring dorado (`var(--gold)`) con animación de pulsado suave. Cuando la respuesta llega y `liveRender()` vuelve a correr, el círculo ya no tiene `.saving`.

- **E.3 — Guarda de secuencia:** Variable `LIVE_LOCAL_SEQ` (entero, arranca en 0). Se incrementa dos veces por cada ciclo de guardado: una al inicio de `liveSmConfirm()` (inicio del write optimista) y otra en `handleOk()` cuando llega la confirmación del backend. `livePoll()` captura `seqAtPollTime` antes de hacer el GET y, cuando llega la respuesta, solo sobreescribe `LIVE_LINEA_DATA` si `LIVE_LOCAL_SEQ === seqAtPollTime` (es decir, si no hubo ninguna escritura local mientras el poll estaba en vuelo). La respuesta del POST siempre gana (se aplica incondicionalmente en `handleOk`).

- **E.4 — Lock global:** No se tocó. GAS no expone primitivas de lock por-fila o por-línea nativamente — `LockService` solo tiene script, user y document scope. Cambiar a `getDocumentLock()` sería marginalmente mejor (scope menor) pero en la práctica igual serializa todo el backend. Lo correcto sería un lock por clave `fecha+linea` implementado con `PropertiesService` o `CacheService` como mutex ad hoc, pero eso requiere análisis cuidadoso de los race conditions de TTL antes de hacerlo en producción. Se deja para una tarea dedicada.

Bonus: reintento automático a los 2 segundos si el POST falla; si el reintento también falla, se revierte la actualización optimista (el círculo vuelve a vacío), se limpia el estado de saving y aparece un toast de error rojo con "Error al guardar — verificá tu conexión".

**6. Parte F:**
Los dos botones nuevos están dentro de `liveRenderComplete()`, que solo se llama cuando `allComplete = d.jugadores.every(j => j.holesCargados === 18)` es verdadero (línea de `liveRender()`). Fuera de ese estado no aparecen.

- "🏁 Finalizar Ronda": llama `livePollStop()` y `pg('lb',null)` — cierra la pantalla de live scoring y lleva al Leaderboard sin modificar datos.
- "📋 Revisar Tarjetas": abre el floating modal con `liveRevisarTarjetas()` → lista los 4 jugadores con HCP, hoyos cargados y STB. Tocar un nombre abre `liveVerTarjetaJugador(mat)` → muestra la tarjeta completa con `renderTarjeta18HoyosEditable()`. Cada celda de score llama `closeFloatingModal(); liveOpenScoreModal(hoyo, mat)` — **reutiliza exactamente el mismo modal de teclado numérico** de la carga normal, sin código nuevo de edición.

**7. Parte G:**
Confirmado: `renderTarjeta18Hoyos()` ya tenía IDA/VUELTA con totales (columna "Tot" al final de cada tabla de 9 hoyos). El pedido era de visibilidad/contraste, no de cálculo.

Se usa en 3 lugares:
1. `showPlayerScorecardModal()` (línea ~6421) — modal de jugador en la tab Stableford del Live Scoring.
2. Perfil ECL en `pg-perfil` (línea ~7421) — tarjeta del mejor score ecléctico.
3. Tarjeta de la fecha en `pg-mit-tarjeta` (línea ~7553) — vista de tarjeta personal.

Los cambios CSS (`.perf-ecl-table thead th:not(.lbl)` con fondo navy, `.perf-ecl-hoyo` con texto blanco, `.perf-par-row td` con fondo `var(--g1)`) son globales y aplican igualmente en los 3 contextos — todos se ven mejor. La fila de Hándicap (que también usa `.perf-ecl-par`) no recibe `.perf-par-row` porque no está en la lista de filas destacadas; solo Par y Puntos STB llevan esa clase.

**8. Commits (hash · mensaje):**
- `78f0079` · tarea13-A: Remove duplicate home-fecha-card from LB; fix franja CTA
- `c676327` · tarea13-B: Fix live scoring tab strip contrast (white-on-white bug)
- `d11e65f` · tarea13-C: Hoyo de salida — circular hoyo navigation for shotgun starts
- `064326e` · tarea13-D: Bonus picker waits for all 4 players to have score on bonus hole
- `2409b69` · tarea13-E: Sequence guard, saving feedback, player auto-advance, retry
- `f6a348c` · tarea13-F: Add Finalizar Ronda and Revisar Tarjetas to complete screen
- `581a136` · tarea13-G: Scorecard table visual improvements

**9. Flujo completo:**
No se pudo probar en el ambiente de staging real (se requiere una fecha activa con línea y 4 jugadores vivos). Las partes se verificaron revisando el código generado: la guarda de secuencia (E.3) elimina la causa raíz del bug "vuelve a vacío" — el poll ya no sobreescribe `LIVE_LINEA_DATA` si hubo un write local mientras estaba en vuelo.

**10. Decisiones propias:**

- **E.3 — Qué overwrite ignorar:** el diseño original capturaba un timestamp de servidor. Preferí `LIVE_LOCAL_SEQ` (entero incremental en cliente) porque evita el problema de drift de relojes entre cliente y servidor. El POST siempre gana independientemente de la secuencia porque tiene la vista más fresca del backend.

- **E.1 — Delay de 300ms antes del siguiente modal:** elegido para que el usuario pueda ver el círculo del jugador anterior llenarse antes de que se abra el siguiente. Si resulta molesto se puede bajar a 0 sin consecuencias.

- **F — liveVerTarjetaJugador usa LIVE_LINEA_DATA en vez de LIVE_STB_DATA:** `showPlayerScorecardModal` requiere que `LIVE_STB_DATA` esté cargado (solo se carga si el usuario abrió la tab Stableford). Desde la vista "Revisar Tarjetas" en la pantalla de ronda completa, `LIVE_LINEA_DATA` siempre está disponible y tiene los scores y pares. Se armó `liveVerTarjetaJugador` + `renderTarjeta18HoyosEditable` por separado en vez de forzar la dependencia en `LIVE_STB_DATA`.

- **G — `.perf-par-row` no cubre la fila de Hándicap:** la fila de Hándicap también usa `.perf-ecl-par` para sus celdas, pero el enunciado pedía destacar Par y Puntos — no Hándicap. Si se quiere incluirla es una línea de JS.
