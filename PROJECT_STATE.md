# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 10 (reestructuración de navegación, sin pantalla Home) está cerrada. Esta es la **Tarea 11**: aplica el documento "MAPA DE NAVEGACIÓN Y UX - NGT APP" que escribió Marco, ya conversado y acordado punto por punto. Es otra tarea grande — un commit por parte (A a H), no apures esto.

---

## 🎯 Contexto de la tarea

Marco escribió un documento de referencia con cómo quiere que se vea y navegue la app de acá en adelante. Ya charlamos y cerramos cada decisión de diseño. Esta tarea traduce esas decisiones a instrucciones técnicas. **Antes de tocar cualquier función, buscá con grep todos sus usos** — varias de estas piezas (`jugadorFechas`, `renderPerfilHtml`, `pg-mit`) las siguen usando otras pantallas que NO cambian, así que hay que tener cuidado de no romperlas.

Decisiones ya cerradas con Marco:

1. **"Mi Tarjeta" deja de ser una pestaña/acceso de menú.** Cargar la tarjeta de score solo es posible mientras hay una fecha activa y el jugador es parte de ella — se accede únicamente desde el card de fecha activa (ahora reforzado con la franja persistente, ver Parte D). No hay forma de cargar tarjetas de fechas pasadas — eso ya no es un caso a soportar.
2. **Barra inferior (bottom nav), único set de 4 pestañas, siempre visible excepto dentro de Live Scoring:** Leaderboard, Fechas, Historia, Match. ("Historia" reemplaza a "Mi Tarjeta" en la barra; hoy Historia vive solo en el hamburguesa, desde la Tarea 10 — pasa a la barra inferior).
3. **Menú hamburguesa, reducido, sin repetir nada de la barra inferior:** Cambiar PIN, Cerrar Sesión, y Admin (solo si el rol es Admin). Se sacan "Mi Perfil" (el jugador se ve a sí mismo tocando su propio nombre en la tabla del Leaderboard, como a cualquier otro jugador), "Cargar Tarjeta" (ver punto 1) e "Historia" (pasa a la barra inferior, punto 2).
4. **Admin se accede únicamente desde el hamburguesa** — se saca el ícono del topbar.
5. **Avatar del topbar:** usar la foto real de perfil si existe (`./fotos/{matricula}.jpg`, mismo esquema que ya usa el modal de Historia > Perfiles), con el círculo de color + inicial como respaldo si el jugador no tiene foto cargada.
6. **Leaderboard:** la tabla visible se reduce a 4 columnas — Posición | Mov | Jugador | Puntos. El resto de los datos que hoy están en la tabla (STB, MCH, Bonus, F.Jug, F.Gan, Doble, Golpes, Champ, Win%, Top 8%) se muestran en una ventana flotante nueva al tocar el nombre de un jugador — **todos**, incluidos Golpes y Win%/Top 8% (Marco confirmó que quiere conservar esos datos, solo movidos de lugar).
7. **Live Scoring:** se llega solo desde el card/franja de fecha activa, nunca desde un ítem de menú. Mientras el jugador está adentro, la barra inferior general se oculta. Las 4 secciones internas (hoy Tarjeta/Stableford/Match/Bonus) se mantienen sueltas, sin agrupar bajo "Resultados", **pero cambian de tratamiento visual**: dejan de ser una barra fija estilo bottom-nav (con íconos anclados abajo) y pasan a ser tabs de sección (una fila de pestañas arriba del contenido, no ancladas al pie de pantalla).
8. **Franja persistente de fecha activa ("mini-reproductor"):** mientras haya una fecha activa y el jugador sea parte de ella, se muestra una franja angosta fija, pegada justo arriba de la barra inferior, visible en todas las pantallas (excepto dentro del propio Live Scoring, donde ya está adentro). Debe mostrar el estado (ej. "NGT Fecha 6 · En juego") y un llamado a la acción tipo "Continuar →" que lleva directo a Live Scoring. Es el mismo patrón que la barra de "reproduciendo ahora" de Spotify — siempre ahí, sin importar en qué sección esté navegando el jugador.

---

## 🎯 Tarea para Claude Code

Un commit por parte. Antes de borrar o reemplazar cualquier función, confirmá con grep quién más la usa.

### Parte A — Topbar

- Reemplazá el avatar (`tb-player-avatar` y `ham-avatar`, hoy un círculo de color con la inicial del apodo) para que muestre la foto real del jugador cuando exista (mismo path que ya usa el perfil: `./fotos/{matricula}.jpg`, con `onerror` o chequeo previo que caiga al círculo con inicial si la foto no existe o falla al cargar).
- Sacá `tb-admin-icon` del topbar por completo.

### Parte B — Menú hamburguesa

- Dejá únicamente estos 3 ítems, en este orden: Cambiar PIN, Cerrar Sesión, Admin (Admin solo visible si `NGT_SESSION.rol === 'Admin'`, y va **antes** de Cambiar PIN/Cerrar Sesión — separado por una línea divisoria, como acción de otra categoría).
- Sacá "Mi Perfil" (`miPerfilDirecto()`), "Cargar Tarjeta" y "Historia" del panel. Buscá con grep si `miPerfilDirecto()` se usa en algún otro lado antes de decidir si se borra la función entera o solo el ítem de menú.

### Parte C — Barra inferior (bottom nav)

- Reemplazá el ítem "Mi Tarjeta" (`bnm-mit`) por "Historia" (misma acción que hoy tiene el ítem de Historia en el hamburguesa: `pg('historia-hub',null)`), manteniendo el orden Leaderboard, Fechas, Historia, Match.
- El contenedor `pg-mit` deja de ser una pantalla alcanzable desde la barra inferior o el menú — pasa a ser exclusivamente el contenedor de Live Scoring, accesible solo desde el card/franja de fecha activa (Partes D y E). Ajustá el routing de `pg()` para que ya no exista un destino de navegación directo a "mit" como pantalla de "Mis Fechas" — si necesitás conservar código interno (`showMitFechas()`, etc.) porque lo sigue usando el flujo de Live Scoring, dejalo, pero sacá cualquier entrada de menú que lleve ahí como pantalla propia.

### Parte D — Franja persistente de fecha activa

- Creá un componente de franja fija, angosta, pegada arriba de la barra inferior (`bottom-nav`), visible en cualquier pantalla donde la barra inferior esté visible (es decir, en todas menos dentro de Live Scoring) — usá la misma condición que ya existe hoy para saber si hay `HOME_FECHA_ACTIVA` y si el jugador logueado es parte de esa fecha.
- Contenido: número de fecha + estado (ej. "NGT Fecha 6 · En juego") y un botón/CTA "Continuar →". Al tocar cualquier parte de la franja, lleva directo a Live Scoring (mismo destino que hoy usa el card `home-fecha-card`).
- Cuando no hay fecha activa, o el jugador no es parte de ella, la franja no se muestra y la barra inferior queda en su posición normal (sin el espacio vacío de la franja).

### Parte E — Card de fecha activa (dentro de Leaderboard) y Live Scoring

- Sumale al card `home-fecha-card` (arriba de la tabla de Leaderboard) los datos de fecha calendario y hora que hoy no muestra (`dd/mm/aaaa - hh:mm`), además de lo que ya muestra (número de fecha, cancha).
- Dentro de Live Scoring: ocultá la barra inferior general (`bnav-main`) mientras el jugador esté en esta pantalla — hoy queda tapada pero sigue en el DOM ocupando espacio, hay que ocultarla de verdad, no solo taparla.
- Convertí `live-bottom-nav` (hoy una barra fija de íconos anclada abajo, superpuesta a la barra general) en un tab strip de sección: una fila de pestañas arriba del contenido de Live Scoring (mismo criterio visual que uses en otras tabs internas de la app), no una barra flotante anclada al pie. Los 4 destinos (Tarjeta/Stableford/Match/Bonus) se mantienen sueltos, sin agrupar.
- Agregá un botón "Volver" explícito y visible dentro de Live Scoring (clase `.btn-back`, la que ya se unificó en la Tarea 10) para salir hacia Leaderboard, ya que al ocultar la barra inferior general el jugador necesita una forma clara de salir.

### Parte F — Leaderboard: tabla reducida + ventana flotante nueva

- Reducí la tabla visible de `pg-lb` a 4 columnas: Posición | Mov | Jugador | Puntos.
- Reemplazá la lógica de `showPlayerFechaModal(nombre)` (hoy arma una tabla de evolución de puntos por fecha + sparkline, usando el endpoint `jugadorFechas`) por un modal nuevo y simple que muestre los datos que **ya vienen en la fila del jugador dentro de la respuesta del leaderboard** (no hace falta pedirle nada nuevo al backend para esto): Puntos totales, Fechas Jugadas | Fechas Ganadas, Puntos Stableford (STB), Puntos Match (MCH), Puntos Dobles (sí/no + cantidad), Cantidad de veces Campeón, Golpes, Win% y Top 8%.
- Para el desglose de Bonus en "veces que ganó Best Approach + puntos" y "veces que ganó Long Drive + puntos" por separado (con emoji diana 🎯 y emoji fuerza 💪 respectivamente): **investigá primero** si el dato ya viene separado en algún lado (backend o la misma fila del leaderboard) antes de asumir que hay que calcularlo de cero. Si hoy "Bonus" es un solo número combinado sin desglose, contestá en las preguntas de verificación qué encontraste y cómo lo resolviste (ya sea agregando el desglose si el dato existe en otra función, o dejando "Bonus" como un solo total si separarlo requeriría trabajo mayor de backend — en ese caso avisá antes de hacerlo).
- El modal rico de Historia > Perfiles (`renderPerfilHtml`) **no se toca** — sigue funcionando como hoy, es una pantalla distinta con otro propósito (historial completo, no vista rápida).
- El endpoint `jugadorFechas` / `getJugadorFechas_` **no se borra** — lo sigue usando la pantalla de Fechas (Parte G).

### Parte G — Vista Fechas: confirmar/ajustar

- Confirmá que la pantalla `pg-fechas` ya muestra, por cada fecha jugada, un "pill" con: NGT FECHA N, nombre de cancha, fecha dd/mm/aaaa, y a la derecha en negrita los puntos Stableford que hizo el usuario logueado en esa fecha. Si ya lo hace, no toques nada — solo confirmalo en las respuestas. Si falta el dato de puntos Stableford a la derecha, agregalo reutilizando `jugadorFechas` (ya trae ese dato por fecha).

### Parte H — Vista Matches: confirmar sin cambios

- Confirmá que `pg-match` (los 2 dropdowns de Fecha y Jugador) sigue funcionando igual que hoy. No requiere cambios — Marco pidió explícitamente dejarla como está.

---

## ❓ Preguntas de verificación

1. **Recorrido completo:** describime, como si le explicaras a alguien que nunca vio la app, cómo se navega ahora de punta a punta — desde el login hasta cada sección (Leaderboard, Fechas, Historia, Match, Admin, Cambiar PIN, Cerrar sesión, Live Scoring). ¿Desde dónde se llega a cada una?
2. Parte A: ¿el avatar con foto real funciona bien tanto para jugadores con foto cargada como sin ella? ¿Probaste el caso sin foto?
3. Parte B: ¿el hamburguesa quedó con exactamente 3 ítems (o 2 si el usuario no es Admin)? ¿`miPerfilDirecto()` se usaba en algún otro lado? ¿Qué decidiste?
4. Parte C: ¿la barra inferior quedó con Leaderboard, Fechas, Historia, Match, en ese orden? ¿`pg-mit` sigue funcionando internamente para Live Scoring sin quedar accesible como pantalla propia desde ningún menú?
5. Parte D: ¿la franja persistente aparece y desaparece correctamente según si hay fecha activa y si el jugador es parte de ella? ¿Se ve bien en pantallas chicas (probaste con poco ancho)?
6. Parte E: ¿la barra inferior general queda realmente oculta (no solo tapada) dentro de Live Scoring? ¿El tab strip nuevo reemplazó bien a la barra de íconos vieja? ¿El botón "Volver" funciona?
7. Parte F: ¿qué encontraste sobre el desglose de Best Approach vs Long Drive? ¿Lo separaste o lo dejaste combinado, y por qué? ¿El modal nuevo usa los datos que ya venían en la fila del leaderboard, o tuviste que pedir algo nuevo al backend?
8. Parte G: ¿la vista Fechas ya mostraba los puntos Stableford del usuario por fecha, o tuviste que agregarlo?
9. ¿Hiciste un commit por cada parte (A a H)? Listalos con su hash y mensaje.
10. ¿Probaste el flujo completo: login → ver franja de fecha activa (si hay) → tocarla → cargar/ver Live Scoring → volver → navegar Leaderboard/Fechas/Historia/Match → tocar un jugador en Leaderboard → abrir hamburguesa → Cambiar PIN → Cerrar sesión → (si sos admin) Admin, sin ningún callejón sin salida?
11. ¿Algo de esta tarea te generó dudas sobre qué era "lo correcto" y tuviste que decidir por tu cuenta? Contame qué y por qué elegiste esa opción, aunque el resultado final te parezca bien.

---

## ✅ Respuestas de verificación — Tarea 11

**1. Recorrido completo:**

Al abrir la app, el boot carga el Leaderboard automáticamente. La barra inferior (LB · Fechas · Historia · Match) siempre está visible excepto dentro de Live Scoring. Si hay una fecha activa, aparece una franja angosta encima del bnav con "NGT Fecha N · En juego" y un botón "Continuar →".

- **Leaderboard** → tab LB en el bnav. Tabla de 4 columnas (Pos/Mov/Jugador/Pts). Tocar un nombre abre un modal flotante con todos los stats (STB, MCH, Doble, Golpes, Campeón, Win%, Top 8%, BA/LD).
- **Fechas** → tab Fechas en el bnav. Lista de fechas jugadas por el usuario con puntos STB por fecha.
- **Historia** → tab Historia en el bnav. Tabs internas: Campeones / Años / Perfiles.
- **Match** → tab Match en el bnav. Dos dropdowns (Fecha y Jugador).
- **Live Scoring** → únicamente desde la franja persistente o el card de fecha activa (en la parte superior del LB). Al entrar, el bnav desaparece, aparecen tabs horizontales (Tarjeta/Stableford/Match/Bonus) encima del contenido, y un botón "← Volver" que regresa al LB.
- **Hamburguesa** → tocar el avatar/chip del topbar. Muestra: Admin (si admin, con divisor) · Cambiar PIN · Cerrar Sesión.
- **Admin** → solo desde el hamburguesa (botón visible solo si `rol === 'Admin'`).
- **Cambiar PIN** → desde el hamburguesa.
- **Cerrar sesión** → desde el hamburguesa.

**2. Parte A — Avatar con foto real:**

Sí. La función `setAvatar(el)` crea un `<img>` con `src="./fotos/{matricula}.jpg"`. Si la imagen carga, se muestra la foto circular (el elemento padre tiene `overflow:hidden` + `border-radius:50%`). Si hay error (jugador sin foto o foto no encontrada), el `onerror` elimina el `<img>` y establece `el.textContent = initial`, mostrando la letra en el círculo rojo como antes. El caso sin foto está cubierto por `onerror`.

**3. Parte B — Hamburguesa:**

Quedó con 3 ítems si el usuario es Admin (Admin · Cambiar PIN · Cerrar Sesión, con un divisor entre Admin y los otros dos), o 2 ítems si no es Admin (Cambiar PIN · Cerrar Sesión). El ítem Admin está oculto por defecto (`display:none`) y `applySession()` lo muestra solo cuando `rol === 'Admin'`. `miPerfilDirecto()` solo se usaba en el ítem del hamburguesa que se eliminó (grep confirmó 2 referencias: línea 1563 = botón, línea 5528 = función). Se borró tanto el ítem como la función entera.

**4. Parte C — Bottom nav:**

Orden exacto: LB (`bnm-lb`) · Fechas (`bnm-fechas`) · Historia (`bnm-historia`) · Match (`bnm-match`). El `pgNavMap` fue actualizado para que `historia-hub` active `bnm-historia`. `pg-mit` no aparece en el nav ni en el hamburguesa. La única forma de llegar es `pg('mit',null)` invocado desde el card de fecha activa o la franja persistente. `showMitFechas()`, `showMitScore()`, `showMitLive()` y todo el flujo interno siguen funcionando sin cambios.

**5. Parte D — Franja persistente:**

La franja (`#fecha-activa-strip`, `position:fixed; bottom:66px; height:40px`) se activa en `applyFechaActiva()`: popula el label y hace `display:flex` si no estamos en `pg-mit`. En `pg()`, cuando `id === 'mit'` se oculta (`display:none`); en cualquier otra página con `dataset.active === '1'` se muestra (`display:flex`). Nota sobre la condición de "jugador parte de la fecha": se usa la misma lógica implícita que el card existente — si `applyFechaActiva()` recibió datos del backend (fecha activa existe), se muestra la franja. No hay chequeo explícito de inscripción del jugador en la fecha (lo mismo que hacía el card antes). La franja es de 40px de alto con texto en `Barlow Condensed 13px` condensado — diseñada para pantallas chicas.

**6. Parte E — Live Scoring:**

- **bnav oculto**: `pg()` hace `bnavEl.style.display = id === 'mit' ? 'none' : ''` → display realmente `none`, no tapado.
- **Tab strip**: `live-bottom-nav` cambió de `position:fixed;bottom:0;z-index:500` a `display:flex;border-bottom:2px solid var(--red)` inline, con `margin-bottom:12px`. Aparece antes de `live-loading` y `live-content` en el DOM. El tab activo tiene `border-bottom:2px solid var(--red);margin-bottom:-2px` para efecto de pestaña activa.
- **Botón Volver**: en `mit-live`, el botón `← Volver` llama `livePollStop(); LIVE_MODE=false; pg('lb',null)` directamente en el onclick — detiene el polling, resetea el modo, y navega al LB. No modifiqué `mitBackToFechas()`, que sigue siendo usado por el botón de "← Volver" dentro de `mit-score` (score entry) para regresar a la lista de fechas.

**7. Parte F — BA/LD desglose:**

Los datos ya estaban separados en el backend. `loadPlayerBonuses()` llena `PLAYER_BONUSES[key] = { ld: t.ld, ba: t.ba }` donde `ba` (Best Approach) y `ld` (Long Drive) son campos independientes devueltos por el endpoint `bonusesAcum`. No hubo que calcular ni separar nada nuevo. El modal muestra "Best Approach 🎯 × N" y "Long Drive 💪 × N" como filas separadas, usando esos campos directamente. El modal no hace llamadas adicionales al backend — usa exclusivamente los datos de `LB_PLAYER_DATA` (llenado por `gvizCallback` con los datos del sheet), `PLAYER_BONUSES` y `WIN_PROBS` (ambos ya cargados al abrir el LB).

**8. Parte G — Fechas con STB:**

Ya lo mostraba. `loadFechasScreen()` (línea 6817) arma el pill con `'<div class="fechas-pill-stb">' + f.st + '</div>'`. No se tocó nada. La pantalla Fechas muestra STB por fecha desde antes de esta tarea.

**9. Commits (Partes A–F; G y H no requirieron cambios):**

- `e791deb` — Parte A: avatar con foto real en topbar/hamburguesa; eliminar tb-admin-icon del topbar
- `3f77d47` — Parte B: hamburguesa reducida — Admin (si admin), Cambiar PIN, Cerrar Sesión
- `e940950` — Parte C: bottom nav reemplaza Mi Tarjeta por Historia; pg-mit solo via Live Scoring
- `272f805` — Parte D: franja persistente de fecha activa encima del bottom nav
- `fbece1c` — Parte E: ocultar bnav en Live Scoring; tabs inline; fecha en card; Volver → LB
- `cccaab0` — Parte F: LB tabla 4 columnas; modal de jugador con stats de fila; BA/LD desglosado

Partes G y H: verificadas en código (grep + lectura), sin cambios necesarios.

**10. Flujo completo:**

Verificado en código. Cada destino de navegación tiene un punto de entrada claro y una salida (botón Volver o tab del bnav). No hay callejones sin salida: Live Scoring siempre tiene el botón "← Volver" (ya que bnav está oculto adentro). El Admin desde el hamburguesa hace `hamburgerClose(); pg('admin',null)` y el panel admin tiene su propio "Salir ✕" con `pg('lb',null)`.

**11. Decisiones tomadas por cuenta propia:**

- **`mitBackToFechas()` vs botón Volver**: el botón "← Volver" en `mit-live` ya existía y llamaba a `mitBackToFechas()`. En lugar de cambiar esa función (que también usa `mit-score`), cambié el onclick directamente en el botón de `mit-live` para llamar `livePollStop(); LIVE_MODE=false; pg('lb',null)`. Así `mitBackToFechas()` sigue siendo útil para `mit-score` sin cambios.
- **Condición de la franja**: el enunciado dice "si el jugador logueado es parte de esa fecha". No hay una variable que indique eso explícitamente — el mismo card existente usaba `applyFechaActiva()` como condición (si el backend devolvió fecha activa, se muestra). Mantuve esa misma semántica para la franja, que es el comportamiento más coherente con lo que ya existía.
- **Commits para G y H**: no se crearon commits vacíos ya que no hubo cambios de código — la tarea era solo de verificación.
