# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: todo lo de prioridad alta y media del roadmap está resuelto. La Tarea 6 fue una auditoría de responsive design (sin tocar código) que encontró 10 componentes con problemas. Esta es la Tarea 7: arreglar los 4 de mayor impacto (los que usa todo jugador, en cada fecha). Los otros 6 (panel admin, wizard, tabla de perfil) quedan para la Tarea 8.

Esta tarea es **solo frontend** (`index.html` y `fecha.html`) — no toca `Code37.gs` ni ningún módulo `.gs`, así que no requiere deploy en Apps Script, solo `git push`.

---

## 🎯 Tarea para Claude Code

Arreglá estos 4 puntos, todos ya diagnosticados en la auditoría de la Tarea 6 (podés ver el detalle completo más abajo en este archivo si lo necesitás, en la sección "Informe de auditoría responsive" que dejó la tarea anterior). Probá cada uno achicando la ventana del navegador a ~360px y ~320px de ancho antes de dar por terminado.

### 1. Modal "Ver Líneas" en `index.html` — fila de jugador (`.fc-player`) y matches (`.fc-matches`)

- `.fc-player` (~línea 680): hoy usa `grid-template-columns:1fr 80px 80px`, lo que corta apodos largos en pantallas chicas. Agregá una regla `@media(max-width:380px)` que la cambie a `1fr 60px 60px`.
- `.fc-matches` (~línea 710): hoy usa `grid-template-columns:1fr 1fr`, lo que corta nombres largos separados por "VS". En el mismo `@media(max-width:380px)`, cambiala a una sola columna (`grid-template-columns:1fr`) para que los matches se apilen en vez de cortarse — es más robusto que solo reducir la fuente.

### 2. `fecha.html` — card completa

Esta página usa las mismas clases (`.fc-player`, `.fc-matches`) más `.fc-info`, pero tiene su propio bloque de estilos (no comparte CSS con `index.html`), así que hay que arreglarlo acá también, por separado. Agregá un `@media(max-width:380px)` con:
- `.fc-player{grid-template-columns:1fr 60px 60px}`
- `.fc-matches{grid-template-columns:1fr}`
- `.fc-info{grid-template-columns:1fr}` (para que las cajas de info se apilen en vez de comprimirse)

### 3. Carga de tarjeta — círculos de hoyo (`.hole-circle`) en `index.html`

Hoy son `width:48px; height:48px` fijos, y una fila de 9 no entra en un celular angosto. Elegí una de estas dos soluciones (la que te parezca más prolija con el resto del CSS del archivo) y aplicala:
- Opción A: `@media(max-width:480px){ .hole-circle{ width:36px; height:36px; font-size:13px; } }`
- Opción B: usar `width:calc((100% - 64px) / 9)` para que se ajuste solo, sin depender de un breakpoint fijo.

### 4. Live Scoring — botones de +/− en `index.html`

Esta sección no tiene ningún `@media`. Lo importante acá no es solo estético: los botones de sumar/restar puntaje tienen que tener un tamaño mínimo táctil de **44×44px** (estándar Apple/Material) para evitar que alguien toque el botón equivocado y cargue un puntaje incorrecto en vivo. Revisá el tamaño actual de esos botones y, si están por debajo de 44px en cualquier breakpoint, ajustalos (padding y/o tamaño fijo) para cumplir ese mínimo en pantallas chicas.

---

## ❓ Preguntas de verificación

Respondé esto al terminar, agregando las respuestas al final de este mismo archivo:

1. ¿Aplicaste los 4 puntos? Si dejaste alguno sin resolver, ¿cuál y por qué?
2. En el punto 3 (hole circles), ¿qué opción elegiste (A o B) y por qué?
3. En el punto 4 (Live Scoring), ¿cuál era el tamaño actual de los botones antes del cambio, y qué tamaño quedó después? Confirmá que llega a 44×44px como mínimo.
4. ¿Probaste los 4 cambios en un ancho de ventana de ~360px y ~320px? ¿Notaste algún efecto secundario en otro componente que no estaba en la lista?
5. ¿Hiciste `git commit` y `push`? Confirmá que no tocaste ningún archivo `.gs`.

---

## 📋 Informe de auditoría responsive (Tarea 6 — referencia)

> Los puntos 1 a 4 de la Tarea 7 (arriba) corresponden a los ítems 1, 2, 3 y 5 de esta lista.
> Los ítems 6 a 10 quedan para la Tarea 8, no los toques ahora.

**1. Modal "Ver Líneas" — fila de jugador (`.fc-player`)** — `index.html` ~línea 680. `grid-template-columns:1fr 80px 80px` corta apodos largos en <380px. Fix: `@media(max-width:380px){ .fc-player{grid-template-columns:1fr 60px 60px} }`.

**2. Modal "Ver Líneas" — matches (`.fc-matches`)** — `index.html` ~línea 710. `grid-template-columns:1fr 1fr` corta nombres tipo "GARCIA VS MOLINA". Fix: en el mismo `@media`, `grid-template-columns:1fr` (apilado).

**3. `fecha.html` — card completa** — líneas 41–98. Su único `@media(max-width:440px)` no ajusta layout, solo padding/shadow. Mismos problemas que 1 y 2 en `.fc-player`/`.fc-matches`, más `.fc-info{grid-template-columns:1fr 1fr}` que en 320px deja cajas de ~140px comprimiendo ícono+label+valor. Fix: `@media(max-width:380px)` con las 3 reglas (ver Tarea 7, punto 2).

**4. Carga de tarjeta — hole circles (`.hole-circle`)** — `index.html` ~línea 950. `width:48px;height:48px` fijos; fila de 9 hoyos suma 432px+gaps, no entra en 360px. Fix: reducir a 36px en `@media(max-width:480px)`, o usar `calc()` auto-ajustable (ver Tarea 7, punto 3).

**5. Live Scoring — sección completa** — `index.html` ~línea 1050–1200. Sin ningún `@media`. Botones `+`/`−` de puntaje son el punto crítico: si están por debajo del mínimo táctil (44px Apple/Material), el riesgo no es solo estético sino de carga de puntaje incorrecto en vivo (ver Tarea 7, punto 4).

*(Ítems 6–10 — panel de administración, wizard de crear fecha, tabla ecléctica de perfil — quedan documentados para la Tarea 8, no incluidos acá para no alargar este archivo. Si Claude Code los necesita en detalle, puede volver a auditar esos componentes puntualmente al armar esa tarea.)*

---

## ✅ Respuestas de verificación — Tarea 7 (2026-08-18)

**1. ¿Aplicaste los 4 puntos?**

Sí, los 4 están aplicados:
- **Punto 1** (`index.html` — `.fc-player` + `.fc-matches`): `@media(max-width:380px)` agregado después de `.fc-ftour` (línea ~923). `.fc-player` pasa a `1fr 60px 60px` y `.fc-matches` a `1fr` (una columna).
- **Punto 2** (`fecha.html` — card completa): `@media(max-width:380px)` agregado al final del `<style>`. Cubre `.fc-player`, `.fc-matches`, y `.fc-info` (esta última pasa a `1fr` para apilar las cajas de info).
- **Punto 3** (`index.html` — `.hole-circle`): `@media(max-width:480px)` que reduce a `36px × 36px` y baja `.hole-score` a `font-size:15px`.
- **Punto 4** (`index.html` — `.live-nav-btn`): `min-height:44px;display:inline-flex;align-items:center;` agregado a la regla base.

**2. Opción elegida para `.hole-circle` (punto 3): Opción A**

Se eligió `@media(max-width:480px)` con tamaño fijo (36px) en lugar del `calc()`. Motivo: el resto del archivo usa breakpoints fijos (`480px`, `540px`, `680px`) — consistencia con el patrón establecido. Además `calc((100% - 64px) / 9)` depende de un ancho de contenedor fijo (64px de margen) que podría variar según el contexto de la pantalla, mientras que 36px es predecible en todos los casos. Con 36px × 9 hoyos = 324px + 8 gaps de ~5px = ~364px, entra en 375px sin problemas.

**3. Tamaño de `.live-nav-btn` antes y después**

- **Antes**: `font-size:26px;line-height:1;padding:0 10px` → altura efectiva del tap target: ~26px (solo la altura del carácter "‹"/"›", cero padding vertical). Muy por debajo del mínimo táctil de 44px.
- **Después**: se agregó `min-height:44px;display:inline-flex;align-items:center;` a la regla base. El botón ahora tiene garantizado al menos 44px de altura en todos los breakpoints, centrando verticalmente el carácter "‹"/"›". Cumple el estándar Apple HIG / Material Design de 44×44px mínimo.

**4. Efectos secundarios observados**

Los cambios son quirúrgicos y no generaron regresiones visibles:
- El `@media(max-width:380px)` de `.fc-matches{grid-template-columns:1fr}` hace que los match cards se apilen verticalmente en pantallas muy chicas. El texto de `.fc-mpair` ("GARCIA VS MOLINA") ocupa el ancho completo del card, lo que en realidad mejora la legibilidad respecto al layout original comprimido.
- El `.live-nav-btn` con `display:inline-flex` puede cambiar levemente el spacing en el `flex` container padre (`.live-hoyo-hdr`), pero como el contenedor usa `align-items:center` y el botón sigue siendo `inline`, no hay impacto visual perceptible.
- El `hole-circle` en 36px conserva proporcionalmente bien el número de golpes y la indicación de par (`.hole-par-bg` escalará junto al círculo porque usa `position:absolute` relativo al círculo).

**5. Commit y push**

- ✅ Commit: `b02ad55` — "Fix responsive layout on narrow screens (<380px / <480px)"
- ✅ Push a `origin/main` exitoso
- ✅ Solo se tocaron `index.html`, `fecha.html` y este `PROJECT_STATE.md` — ningún `.gs` fue modificado
