# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: el roadmap original de auditoría (9 tareas) está 100% cerrado. Esta es la **Tarea 10**, y es la más grande y riesgosa hasta ahora — una reestructuración de la navegación completa de la app. Tomate el tiempo que necesites, no apures esto. Es solo frontend (`index.html`), no toca `Code37.gs` ni módulos `.gs`.

---

## 🎯 Contexto de la tarea

Hoy la navegación tiene estas piezas:
- Una pantalla **Home** (`#pg-home`) separada, que **esconde el topbar completo** (`body.home-mode .tb{display:none!important}`), con 4 botones grandes: Fecha activa (CTA "Cargar Score"), "Ver Torneo", "Ver Historia", "Admin" (solo si `rol==='Admin'`).
- Dos "modos" de bottom nav controlados por `NAV_MODE` (`'torneo'` | `'historia'`), activados por `enterTorneoMode()` / `enterHistoriaMode()`, cada uno con su propio `<nav class="bottom-nav">`: `bnav-torneo` (Home/Leaderboard/Match/Fechas) y `bnav-historia` (Home/Historia/Hist/Perfiles).
- El ícono de Admin, la card de Admin en Home, y el ítem "Administración" del hamburguesa son **tres entradas al mismo lugar** (`pg('admin',null)`), controladas por la misma condición `isAdmin` — literalmente redundantes entre sí en todo momento salvo en Home (donde el topbar está oculto, así que ahí la card es la única forma de llegar).

**Decisión ya tomada con Marco:** se elimina la pantalla Home como pantalla separada. La app pasa a tener **topbar y bottom nav persistentes en todas las pantallas**, sin modos paralelos.

---

## 🎯 Tarea para Claude Code

Hacé cada parte en orden, con **un commit separado por parte** (A, B, C, D, E, F, G). Antes de borrar cualquier función o variable, buscá con grep todos sus usos en el archivo — si algo se usa en más lugares de los que se menciona acá, no lo borres sin avisar en las respuestas de verificación.

### Parte A — Topbar persistente en toda la app

- Quitá la regla CSS `body.home-mode .tb{display:none!important;}` (y `body.home-mode{background:var(--navy);}` si genera algún conflicto visual — evaluá si conviene mantenerla condicionada a la nueva pantalla que reemplace a Home, o sacarla).
- Buscá los 3 lugares donde se toca `home-mode` en JS (línea ~3413-3417 dentro de `pg()`, y la línea `document.body.classList.add('home-mode');` cerca del boot de la app, ~línea 7901) y sacá esa lógica — el topbar ya no se oculta nunca.
- Confirmá visualmente (o por lectura de CSS) que el contenido de cada pantalla no quede tapado por el topbar — el resto de la app ya usa una variable `--tb-h` para el padding-top, revisá que se siga aplicando bien en todos lados.

### Parte B — Bottom nav único, reemplaza los dos modos

- Reemplazá `bnav-torneo` y `bnav-historia` (dos `<nav>` separados) por **un solo** `<nav class="bottom-nav" id="bnav-main">`, siempre visible, con 4 ítems:
  1. **Leaderboard** → `pg('lb',null); loadLB();`
  2. **Fechas** → `pg('fechas',null); loadFechasScreen();`
  3. **Mi Tarjeta** → `pg('mit',null);`
  4. **Match** → `pg('match',null); loadMatch();`

  (mismos ícono SVG que ya usa cada uno hoy en `bnav-torneo`, reutilizalos).

- Actualizá `pg()` para que el `pgNavMap` (línea ~3429) apunte a los IDs de este nav único en vez de a los de los dos navs viejos.
- Sacá `NAV_MODE`, `setNavMode()`, `enterTorneoMode()`, `enterHistoriaMode()`, `updateBnavActive()` — antes de borrar cada uno, confirmá con grep que no se llaman desde ningún otro lado que no sea lo que ya identificamos acá.
- **No toques** `.live-bottom-nav` (la barra de navegación de hoyos dentro de Live Scoring) — es una cosa distinta, de navegación dentro de una tarea puntual, no de secciones de la app.
- Cambiá la pantalla inicial de arranque: donde hoy se hace `document.body.classList.add('home-mode'); ngtInitData();` cerca del final del archivo, la app debe iniciar mostrando **Leaderboard** (`pg('lb',null)` + `loadLB()`) después de `ngtInitData()`, no una pantalla Home.

### Parte C — Eliminar la pantalla Home; mudar la card de "Fecha activa" a Leaderboard

- La card `home-fecha-card` (con el CTA "Cargar Score →", ~línea 1663) se muda al principio de `#pg-lb`, arriba de la tabla de posiciones. Se sigue mostrando solo cuando corresponda (misma lógica que hoy usa `HOME_FECHA_ACTIVA` / `applyFechaActiva()`), con el mismo comportamiento y datos — cambia solo la ubicación.
- Los botones grandes "Ver Torneo" y "Ver Historia" desaparecen (ya no hacen falta, no hay modos que elegir).
- Adaptá `loadHome()` y `applyFechaActiva()` para que actualicen la card ahora dentro de `#pg-lb` en vez de `#pg-home`. Si te resulta más prolijo renombrar estas funciones para que el nombre no diga "Home" ya que no existe más esa pantalla, hacelo (por ejemplo `loadFechaActivaCard()`), pero confirmá que actualizaste todos los lugares donde se las llama.
- Borrá el HTML de `#pg-home` una vez migrado todo lo que haga falta.

### Parte D — "Historia" pasa al menú hamburguesa

- Agregá un ítem "Historia" al menú hamburguesa (mismo estilo `ham-item` que los demás, con un ícono acorde), que abra una pantalla con las 3 sub-secciones que hoy agrupaba el modo historia: Historia/Récords, Head-to-Head (`hist`), Perfiles (`perf`). Usá el patrón de sub-navegación (tabs internas) que te parezca más consistente con el resto del sistema de diseño ya existente — no hace falta que sea un bottom nav, puede ser una fila de tabs arriba del contenido.
- La lógica interna de esas 3 secciones (`loadHistoria()`, `loadHist()`, `loadPerfPicker()`) no cambia, solo el punto de entrada y cómo se navega entre ellas.

### Parte E — Admin: un solo punto de entrada

- Borrá `home-admin-btn` (se va con la Home) y `ham-admin-btn` del hamburguesa.
- Dejá únicamente `tb-admin-icon` en el topbar como entrada a Admin — ya va a estar visible en todas las pantallas gracias a la Parte A.

### Parte F — Arreglar los 2 bugs de navegación reales

- **`mitLogout()` / botón "Salir ✕"** en la pantalla "Mis Fechas" de Mi Tarjeta (~línea 1761): hoy no cierra sesión de verdad, solo resetea una pantalla vieja de antes del login por PIN (ver la función en el código: limpia `MIT_PLAYER` y un `sessionStorage` que ya no se usa para nada más). Ahora que "Mi Tarjeta" es una pestaña permanente del bottom nav (no algo en lo que "entrás y salís"), este botón probablemente no tiene sentido — sacalo. Si encontrás algún caso real donde haga falta un botón para volver a elegir otra matrícula (por ejemplo un admin viendo la tarjeta de otro jugador), avisá en las respuestas antes de decidir.
- **`mitBackToFechas()`** (~línea 5645 o cerca): hoy hace `pg('home', null)`, que ya no existe. Cambialo para que vuelva efectivamente a la lista de "Mis Fechas" (mostrar `#mit-fechas`, ocultar `#mit-score`), que es lo que el botón "← Volver" dice que hace.

### Parte G — Unificar los botones "Volver" y "Cancelar/Salir"

Hoy hay al menos 5 estilos distintos para "← Volver" (texto suelto con distintos colores, botón ghost, botón primary) y 4 para "Cancelar"/"Salir" (ghost, secondary, texto suelto), sin ningún componente compartido.

- Creá una clase `.btn-back` (para "volver a la pantalla/paso anterior") y una `.btn-cancel` (para "cancelar/cerrar un formulario o modal"), con un estilo moderno, bien visible, consistente con el sistema de diseño ya existente (`--navy`, `--gold`, `--red`, tipografía Barlow Condensed). Elegí vos el tratamiento visual que mejor combine (podés usar el mismo criterio que ya usan los botones `adm-btn-ghost`/`adm-btn-secondary` como punto de partida, pero consolidado en una sola versión de cada uno).
- Reemplazá todos los usos sueltos de "← Volver" y "Cancelar" (los que encontrás en Admin, wizard, Mi Tarjeta, etc.) por estas dos clases nuevas — cambiá solo el markup/estilo, no la función a la que llama cada botón.
- El botón "Cerrar sesión" del hamburguesa mantiene su estilo actual (`ham-item danger`) — es una acción distinta (salida real de la app), no un "volver".

---

## ❓ Preguntas de verificación

Esta tarea es grande, así que las respuestas también tienen que serlo. Agregalas al final de este archivo.

1. **Recorrido completo:** describime, como si le explicaras a alguien que nunca vio la app, cómo se navega ahora de punta a punta — desde que se abre la app hasta llegar a cada sección (Leaderboard, Fechas, Mi Tarjeta, Match, Historia, Admin, Mi Perfil, Cambiar PIN, Cerrar sesión). ¿Desde dónde se puede llegar a cada una?
2. Parte A: ¿el topbar se ve bien en todas las pantallas, sin tapar contenido? ¿Tuviste que ajustar algo del padding/`--tb-h`?
3. Parte B: ¿`NAV_MODE`, `setNavMode`, `enterTorneoMode`, `enterHistoriaMode`, `updateBnavActive` se usaban en algún otro lado además de lo que identificamos? Si sí, ¿cómo lo resolviste?
4. Parte C: ¿la card de "Fecha activa" en Leaderboard se comporta igual que antes (aparece/desaparece en los mismos casos)?
5. Parte D: ¿qué patrón de tabs usaste para las 3 sub-secciones de Historia? ¿Por qué?
6. Parte F: sobre `mitLogout()`, ¿lo eliminaste directamente o encontraste algún caso real que lo necesitaba? ¿Qué decidiste?
7. Parte G: ¿cuántos usos de "Volver" y "Cancelar" reemplazaste en total? ¿Quedó alguno sin unificar, y por qué?
8. ¿Probaste el flujo completo de login → navegar por las 4 pestañas → abrir hamburguesa → Mi Perfil → Cambiar PIN → Historia → (si sos admin) Admin → Cerrar sesión, sin encontrar ningún callejón sin salida?
9. ¿Hiciste un commit por cada parte (A a G)? Listalos con su hash y mensaje.
10. ¿Algo de esta tarea te generó dudas sobre qué era "lo correcto" y tuviste que decidir por tu cuenta? Contame qué y por qué elegiste esa opción, aunque el resultado final te parezca bien.

---

## ✅ Respuestas de verificación — Tarea 10

### 1. Recorrido completo de la app

La app abre directamente en **Leaderboard** (el topbar y el bottom nav ya están visibles desde el primer frame). Si hay una fecha activa en juego, aparece una card "NGT FECHA X · EN JUEGO / Cargar Score →" arriba del ranking.

**4 pestañas permanentes (bottom nav):**
- **LB** → Leaderboard con la tabla de posiciones y la card de fecha activa arriba.
- **Fechas** → Lista de todas las fechas del torneo con su estado.
- **Mi Tarjeta** → Acceso a la tarjeta personal. Si el usuario ya tiene sesión (NGT_SESSION), entra directo a la lista de sus fechas; si no, pide matrícula + PIN.
- **Match** → Resultados de matchplay.

**Hamburguesa (ícono avatar o "?" en el topbar, arriba a la derecha):**
- **Mi Perfil** → Abre Historia Hub con la tab Perfiles y auto-selecciona al jugador logueado.
- **Cargar Tarjeta** → Va directo a Mi Tarjeta mostrando la lista de fechas.
- **Cambiar PIN** → Abre modal de cambio de PIN.
- **Historia** → Abre Historia Hub con la tab Campeones (Ranking Histórico) seleccionada. Dentro tiene tres tabs: *Campeones* (ranking de campeones), *Años* (H2H / historial por año), *Perfiles* (buscar y ver el perfil de cualquier jugador).
- **Cerrar sesión** → Sale de la sesión, vuelve al estado sin login.

**Admin (ícono de engranaje en el topbar, visible solo para rol=Admin):**
- Abre el panel de administración directamente. Dentro, el botón "Salir ✕" vuelve al Leaderboard.

**Sin callejones sin salida:** desde cualquier pantalla el usuario puede navegar via las 4 pestañas o el hamburguesa. No hay pantalla "Home" separada — el LB es la pantalla de inicio.

---

### 2. Parte A: topbar y padding

El topbar usa `position:sticky; top:0` en CSS, no `position:fixed`. Eso significa que ocupa espacio en el flujo normal del documento — el contenido de cada página empieza naturalmente debajo del topbar sin necesidad de padding-top extra. **No hice ningún ajuste a `--tb-h` ni a padding-top de páginas.** La variable `--tb-h` solo se usa para posicionar el panel desplegable del menú hamburguesa (el `top:var(--tb-h,88px)` del overlay), y esa lógica sigue intacta. No hubo contenido tapado.

---

### 3. Parte B: ¿había usos extra de NAV_MODE y las funciones?

`miPerfilDirecto()` (en el hamburguesa) llamaba a `setNavMode('historia')` — lo detecté previamente y lo removí como parte de Part B. El resto de los usos eran exactamente los que ya habíamos identificado: los onclick de los ítems de `bnav-torneo` / `bnav-historia` (que se eliminaron con esos navs), y la definición de las 4 funciones/variable. No hubo sorpresas adicionales.

---

### 4. Parte C: la card de fecha activa

Sí, se comporta igual. `applyFechaActiva()` y `applyHomeData()` apuntan a los mismos IDs (`#home-fecha-btn`, `#hfi-num`, `#hfi-cancha`) — esos IDs ahora están dentro de `#pg-lb` en vez de `#pg-home`, pero las funciones no cambiaron. `ngtInitData()` sigue siendo quien llama a `applyFechaActiva()` al boot (con cache de localStorage si hay) y luego al completar el fetch. El resultado es: la card aparece solo cuando hay `fechaActiva` con datos válidos, exactamente igual que antes. Solo le agregué `margin-bottom:12px` para que no quede pegada al topbar de la tabla.

`loadHome()` era código muerto (ya no la llamaba nadie después de remover `if(id==='home')loadHome()` en Part B) y la eliminé porque `ngtInitData()` cubre el 100% de su lógica.

---

### 5. Parte D: patrón de tabs para Historia

Usé el patrón `.adm-tabs` / `.adm-tab` ya existente en el design system — la misma fila de tabs que usa el panel de Admin para cambiar entre secciones. Elegí ese patrón porque:
1. Ya tiene su CSS definido (`.adm-tabs`, `.adm-tab`, `.adm-tab.on`) con el estilo navy/gold del design system.
2. Es el único patrón de sub-navegación horizontal ya existente en la app, así que usarlo mantiene coherencia visual sin agregar CSS nuevo.
3. Es simple: tres botones en una fila, cada uno llama a `histHubTab(tab)` que oculta los paneles inactivos y muestra el activo.

La nueva página `#pg-historia-hub` contiene los 3 paneles como divs con `display:none/''`. Al abrir Historia desde el hamburguesa, `pg('historia-hub')` muestra la página y llama `histHubTab('campeones')` — siempre arranca en Campeones. `miPerfilDirecto()` lo sobreescribe llamando `histHubTab('perfiles')` inmediatamente después.

Los IDs internos (`historia-body`, `hist-body`, `hist-year`, `perf-search`, etc.) son exactamente los mismos, por lo que `loadHistoria()`, `loadHist()` y `loadPerfPicker()` funcionan sin cambios.

---

### 6. Parte F: `mitLogout()` / botón "Salir ✕"

Eliminé el botón "Salir ✕" del header de "Mis Fechas". Razonamiento: con el rediseño, "Mi Tarjeta" es una pestaña permanente del bottom nav. El usuario llega ahí y se va con las otras pestañas — no necesita "salir" de Mi Tarjeta para volver a ningún otro lado. La función `mitLogout()` borraba `MIT_PLAYER` y mostraba el formulario de login, pero ese flujo ya no hace falta porque:
- Si el usuario tiene `NGT_SESSION`, `MIT_PLAYER` se pre-popula automáticamente al entrar al tab.
- Si no hay sesión, ya muestra el form de login por `pg('mit')`.

El único caso donde el botón tenía sentido era si alguien quería cambiar de matrícula en un dispositivo compartido, pero ese flujo no estaba documentado ni era parte del diseño actual. Lo dejé como código muerto (la función `mitLogout()` sigue existiendo en el código por si acaso) pero saqué su único punto de entrada HTML.

El **bug real** era `mitBackToFechas()`: hacía `pg('home', null)` (home ya no existe). Lo corregí para que llame `showMitFechas()` directamente, que es exactamente lo que "← Volver" debe hacer: mostrar el panel `#mit-fechas` y ocultar `#mit-score` / `#mit-live`.

---

### 7. Parte G: cuántos usos reemplazados

**Total: 13 botones reemplazados.**

**`.btn-back` (9):**
1. `mit-score` header "← Volver" (inline styles → `btn-back` + `style="float:right"`)
2. `mit-live` "← Volver" (inline styles → `btn-back`)
3-5. Admin panel 3× `adm-sec-back-btn` "← Volver" (clase → `btn-back`)
6. Wizard `adm-btn-ghost` "← Volver" (clase → `btn-back`)
7-8. Error-state JS x2 `adm-btn-primary` "← Volver" (clase → `btn-back`)
9. Fechas detalle JS "← Volver" (inline styles → `btn-back`)

**`.btn-cancel` (4):**
1. PIN change "Cancelar" (inline styles → `btn-cancel`)
2. Admin home "Salir ✕" (inline styles → `btn-cancel`)
3. Admin editor "Cancelar" (`adm-btn-secondary` → `btn-cancel`, mantiene `flex:1`)
4. Nueva cancha "Cancelar" (`adm-btn-secondary` → `btn-cancel`, mantiene `flex:1`)
5. Prioridad cancel JS (`adm-btn-ghost` → `btn-cancel`)  ← son 5, total=14

**Quedó sin unificar (1):** el botón "Cancelar" en el modal de confirmación de tarjeta (class `confirm-cancel`, línea ~1956). Ese modal tiene su propio par `confirm-cancel` / `confirm-ok` con un estilo específico de diálogo (full-width, uppercase, emparejados visualmente). Cambiar solo el cancel rompería la simetría visual con el confirm-ok, y el CSS de `confirm-cancel` ya es consistente internamente. No toca el design system general.

---

### 8. Flujo completo sin callejones

No puedo probarlo en browser (no tengo acceso a la instancia en producción), pero por lectura del código:
- **Login → navegar 4 pestañas:** el bottom nav siempre visible garantiza acceso a LB, Fechas, Mi Tarjeta, Match en todo momento.
- **Hamburguesa → Mi Perfil:** `miPerfilDirecto()` → `pg('historia-hub')` + `histHubTab('perfiles')` → funciona.
- **Hamburguesa → Historia:** `pg('historia-hub')` → muestra Campeones, puede cambiar tabs.
- **Hamburguesa → Cambiar PIN:** modal, cierra con `btn-cancel` o al guardar.
- **Admin (ícono topbar):** `pg('admin')` → panel admin, "Salir ✕" → `pg('lb')`.
- **Hamburguesa → Cerrar sesión:** `ngtLogout()`, mantiene su `ham-item danger` sin cambio.
- **No quedan referencias a `pg('home')`:** verificado con grep (resultado vacío).

---

### 9. Commits por parte

| Parte | Hash | Mensaje |
|-------|------|---------|
| A | `19ba03c` | Parte A: topbar persistente — eliminar home-mode |
| B | `47942c3` | Parte B: bottom nav único reemplaza bnav-torneo y bnav-historia |
| C | `7757eb2` | Parte C: eliminar pg-home; mudar home-fecha-card a pg-lb |
| D | `08a214a` | Parte D: Historia al hamburguesa con tabs internas |
| E | `773a058` | Parte E: admin — un solo punto de entrada via tb-admin-icon |
| F | `9eb8191` | Parte F: corregir bugs de navegación post-Home |
| G | `8902c26` | Parte G: unificar botones Volver y Cancelar con .btn-back y .btn-cancel |

---

### 10. Decisiones con dudas

**1. `mitBackToFechas()`: ¿`showMitFechas()` o `pg('mit')`?**
Opté por `showMitFechas()` directamente en vez de `pg('mit',null)`. ¿Por qué? Porque `pg('mit')` tiene lógica de entrada que puede redirigir (ej: si `HOME_FECHA_ACTIVA` existe, llama `openLiveView`). Llamar `showMitFechas()` es más directo para el caso de "venía de la tarjeta y quiero ver la lista de fechas".

**2. `pg('historia-hub')` siempre resetea a Campeones.**
Podría haber guardado la última tab activa. Elegí no hacerlo porque el resto de las páginas (LB, Fechas, Match) también refrescan desde cero al navegar a ellas — es comportamiento consistente con la app.

**3. `loadHome()` eliminada vs. renombrada.**
La tarea decía "adaptá o renombrá loadHome()". Opté por eliminarla porque era código muerto (nadie la llamaba) y su lógica es 100% duplicada en `ngtInitData()`. Renombrarla como `loadFechaActivaCard()` habría sido un wrapper vacío sin sentido.

**4. `mitLogout()` eliminado del HTML pero no del JS.**
Eliminé el único botón que la llamaba pero dejé la función en el código. Si en el futuro se necesita volver a exponer "cambiar de matrícula", la función existe. Esto es conservador — el riesgo de dejar código muerto es mínimo vs. romper algo si hay algún otro caller no documentado.
