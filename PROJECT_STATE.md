# PROJECT_STATE.md — NGT

**Última actualización:** 2026-09-02
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 28 (Fase 2) confirmada — el Paso 2 de Crear Fecha ya no tiene edición manual de matches. Marco probó el flujo completo y reportó 4 cosas en la misma sesión de prueba — las agrupamos todas en la Tarea 29, son 3 partes independientes entre sí (se pueden hacer en cualquier orden, no dependen una de la otra). Además, hice una auditoría de seguridad del backend (revisé las 24 acciones que escriben o modifican datos) y encontré un punto real para reforzar — es la Tarea 30, agregada abajo. **Las Tareas 29 y 30 son totalmente independientes entre sí — hacé las dos en la misma sesión de Code, en cualquier orden.**

---

## 🎯 Tarea para Claude Code — Tarea 29

### Parte A — "Rearmar" y "Comenzar Partida" no dan ninguna señal mientras trabajan (y los errores quedan escondidos)

**Lo que reportó Marco:** al apretar "Rearmar" no pasa nada visible. Al apretar "Comenzar Partida" tampoco sabe si se está creando la fecha.

**Encontré la causa real de "Rearmar no pasa nada" (no es un bug al azar, es concreto) revisando el código:** cuando `wizEjecutarArmarLineas_` falla o el servidor devuelve un error — cosa que puede pasar, por ejemplo, si Apps Script está "frío" como vimos hace poco —, el mensaje de error se escribe siempre en el cartel `#adm-crear-msg`. El problema es que ese cartel vive físicamente en el Paso 1 (`#step-1`), que está oculto (`display:none`) mientras el admin está parado en el Paso 2 mirando las líneas armadas. Cuando "Rearmar" falla, el error existe y se escribe — pero en una parte de la pantalla que no se ve. Por eso parece que "no pasa nada": en realidad probablemente SÍ pasó algo (un error), solo que quedó invisible.

Esto también explica en parte lo de "Comenzar Partida": el mensaje "Creando fecha..." hoy es solo una línea de texto chica debajo del botón, fácil de no notar — el botón en sí no cambia ni se desactiva mientras espera al servidor.

**Fix — 3 cambios, todos en `index.html`:**

**A.1 — Mensaje de error visible según en qué paso estás.** En `wizEjecutarArmarLineas_`, agregá esta función chica justo antes (podés ponerla en cualquier lugar cercano, por ejemplo justo arriba de `wizEjecutarArmarLineas_`):

```js
function wizMsgTarget_(){
  var step2 = document.getElementById('step-2');
  return (step2 && step2.style.display !== 'none') ? 'adm-s2-msg' : 'adm-crear-msg';
}

function wizResetBotones_(){
  const b1 = document.getElementById('wiz-armar-btn');
  if(b1){ b1.disabled = false; b1.textContent = '⚡ Armar Líneas →'; }
  const b2 = document.getElementById('wiz-rearmar-btn');
  if(b2){ b2.disabled = false; b2.textContent = '↻ Rearmar'; }
}
```

Después, dentro de `wizEjecutarArmarLineas_`, reemplazá el bloque:

```js
    if(!r || !r.ok){
      const msg = document.getElementById('adm-crear-msg');
      msg.className = 'adm-msg err';
      msg.textContent = 'Error al armar líneas: ' + (r && r.error ? r.error : 'desconocido');
      msg.style.display = 'block';
      return;
    }
```

por:

```js
    if(!r || !r.ok){
      wizResetBotones_();
      const msg = document.getElementById(wizMsgTarget_());
      msg.className = 'adm-msg err';
      msg.textContent = 'Error al armar líneas: ' + (r && r.error ? r.error : 'desconocido');
      msg.style.display = 'block';
      return;
    }
```

Y el bloque `.catch` de esa misma función:

```js
  }).catch(e => {
    if(btn){ btn.disabled = false; btn.textContent = '⚡ Armar Líneas →'; }
    const msg = document.getElementById('adm-crear-msg');
    msg.className = 'adm-msg err'; msg.textContent = 'Error de red: ' + e.message; msg.style.display = 'block';
  });
```

por:

```js
  }).catch(e => {
    wizResetBotones_();
    const msg = document.getElementById(wizMsgTarget_());
    msg.className = 'adm-msg err'; msg.textContent = 'Error de red: ' + e.message; msg.style.display = 'block';
  });
```

**A.2 — El botón "Rearmar" muestra que está trabajando.** En el HTML que genera el botón de Rearmar (dentro de `wizEjecutarArmarLineas_`, la línea que arma el `html` del preview), agregale un `id`:

```js
        '<button onclick="wizRearmarLineas_()" style="padding:3px 10px;font-size:11px;border-radius:3px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;">↻ Rearmar</button>' +
```
→
```js
        '<button id="wiz-rearmar-btn" onclick="wizRearmarLineas_()" style="padding:3px 10px;font-size:11px;border-radius:3px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;">↻ Rearmar</button>' +
```

Y en `wizRearmarLineas_()`, poné el botón en estado "trabajando" antes de pedirle al servidor la nueva combinación:

```js
function wizRearmarLineas_(){
  if(!WIZ_LAST_ARMAR_PARAMS) return;
  const { jugadoresConHcp, prioridades, jugsInFecha, canchaName, data } = WIZ_LAST_ARMAR_PARAMS;
  const btn = document.getElementById('wiz-rearmar-btn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Rearmando...'; }
  wizEjecutarArmarLineas_(jugadoresConHcp, prioridades, jugsInFecha, canchaName, data, Date.now());
}
```

(Si todo sale bien, el botón se reemplaza solo con uno nuevo ya habilitado cuando se redibuja la tarjeta — no hace falta reactivarlo a mano en el caso exitoso. Si falla, `wizResetBotones_()` de la Parte A.1 ya lo reactiva.)

**A.3 — El botón "Comenzar Partida" muestra que está trabajando.** Agregale un `id` al botón en el HTML del Paso 2:

```html
<button class="adm-btn-primary" onclick="wizCrearTodo()">🏌 Comenzar Partida</button>
```
→
```html
<button class="adm-btn-primary" id="wiz-crear-btn" onclick="wizCrearTodo()">🏌 Comenzar Partida</button>
```

En `wizCrearTodo()`, justo después de la línea `msg.style.display = 'none';` (al principio de la función), agregá:

```js
  const crearBtn = document.getElementById('wiz-crear-btn');
  if(crearBtn){ crearBtn.disabled = true; crearBtn.textContent = '⏳ Creando fecha...'; }
```

Y agregá esta misma línea (reactivar el botón) al principio de cada uno de los 3 bloques de error que ya existen dentro de `wizCrearTodo()` (el `if(!r.ok){...}` de crear fecha, el `if(!rm.ok){...}` de cargar matches, y el `.catch` de cargar matches) y también en el `.catch` de crear fecha:

```js
  if(crearBtn){ crearBtn.disabled = false; crearBtn.textContent = '🏌 Comenzar Partida'; }
```

(En el caso exitoso no hace falta reactivarlo — `finalizarWizard` resetea todo el wizard un segundo y medio después.)

---

### Parte B — Aviso de Best Approach / Long Drive al llegar a ese hoyo, en Live Scoring

**Lo que pidió Marco:** si por ejemplo el Best Approach se juega en el hoyo 3, al terminar de cargar los scores del hoyo 2 y pasar al 3, tiene que aparecer un aviso de que ahí se juega ese bonus — antes de que carguen los scores de ese hoyo.

**Backend — `07_LiveScoring.gs`:** la función `buildLineaSnapshot_` arma todo lo que ve el frontend en cada hoyo, pero hoy no le manda en qué hoyos están el Best Approach y el Long Drive (esa info existe en `meta.bonusHoyos`, se usa internamente pero no se comparte). Buscá, cerca del final de la función, el `return` que arma el objeto final:

```js
  const canchaNombre = meta.canchaName || lookupCanchaName_(canchaId) || '';
  return {
    fecha:      fStr,
    lineaNum:   lineaIdx + 1,
    horario:    meta.horario || '',
    cancha:     { id: canchaId, nombre: canchaNombre, colorTee: meta.colorTee || 'BLANCAS' },
    hoyoSalida: meta.hoyoSalida || 1,
    pares:         cpPares,
    indices:       cpIndices,
    totalLineas:   meta.lineas ? meta.lineas.length : 1,
    updatedAt:     Date.now(),
    jugadores:     jugadores,
    matches:       matches,
    bonusPendiente: null,
  };
```

Agregale el campo `bonusHoyos`:

```js
  const canchaNombre = meta.canchaName || lookupCanchaName_(canchaId) || '';
  return {
    fecha:      fStr,
    lineaNum:   lineaIdx + 1,
    horario:    meta.horario || '',
    cancha:     { id: canchaId, nombre: canchaNombre, colorTee: meta.colorTee || 'BLANCAS' },
    hoyoSalida: meta.hoyoSalida || 1,
    pares:         cpPares,
    indices:       cpIndices,
    totalLineas:   meta.lineas ? meta.lineas.length : 1,
    updatedAt:     Date.now(),
    jugadores:     jugadores,
    matches:       matches,
    bonusPendiente: null,
    bonusHoyos:    meta.bonusHoyos || {},
  };
```

**Frontend — `index.html`:**

1. Agregá un contenedor nuevo para el aviso, justo antes de `<div id="live-hoyo-view">` (buscá esta línea, está dentro de `<div id="live-pane-tarjeta">`):

```html
      <div id="live-pane-tarjeta">
        <div id="live-hoyo-view">
```

Cambialo a:

```html
      <div id="live-pane-tarjeta">
        <div id="live-bonus-banner" style="display:none;"></div>
        <div id="live-hoyo-view">
```

2. Agregá el CSS para ese aviso (ponelo cerca de las otras clases `.live-*`, por ejemplo cerca de `.live-hole-wrap`):

```css
#live-bonus-banner{background:var(--gold);color:var(--navy);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:center;padding:9px 12px;border-radius:6px;margin-bottom:8px;}
```

3. En `liveRenderHoyoActual()`, buscá estas 2 líneas (al principio de la función):

```js
  document.getElementById('live-hoyo-label').textContent = 'Hoyo ' + LIVE_HOYO;
  document.getElementById('live-par-label').textContent = (par ? '· Par ' + par : '') + (hoyoIdx ? ' · HCP ' + hoyoIdx : '');
```

Y agregá justo debajo:

```js
  var bonusHoyos = d.bonusHoyos || {};
  var banner = document.getElementById('live-bonus-banner');
  if(banner){
    var avisos = [];
    if(bonusHoyos.ba === LIVE_HOYO) avisos.push('🎯 Best Approach en este hoyo');
    if(bonusHoyos.ld === LIVE_HOYO) avisos.push('🏌 Long Drive en este hoyo');
    if(avisos.length){
      banner.textContent = avisos.join(' · ');
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }
```

(Como `liveRenderHoyoActual()` se llama automáticamente cada vez que cambia `LIVE_HOYO` — al avanzar de hoyo solo o manualmente —, el aviso va a aparecer y desaparecer solo, sin que haya que tocar nada más.)

---

### Parte C — Cambiar la franja de "fecha activa" por un botón flotante

**Lo que pidió Marco:** hoy hay una franja angosta que ocupa todo el ancho de la pantalla, pegada arriba del menú inferior, avisando que hay una fecha en juego. Pide algo más visible — un botón flotante.

No hace falta tocar el HTML ni la lógica que prende/apaga este aviso (`applyFechaActiva`, `dataset.active`, `pg()`) — todo eso queda exactamente igual. Es un cambio 100% de estilo (CSS) más un ajuste chico en `setFooterHeight()`.

**C.1 — CSS.** Reemplazá estas 2 líneas:

```css
#fecha-activa-strip{position:fixed;bottom:66px;left:0;right:0;z-index:195;background:#0d1f36;border-top:2px solid var(--red);display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:40px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#fecha-activa-strip:active{background:#162840;}
```

por:

```css
#fecha-activa-strip{position:fixed;right:14px;bottom:78px;z-index:195;background:var(--red);border-radius:999px;display:flex;align-items:center;gap:8px;padding:10px 16px 10px 12px;box-shadow:0 4px 14px rgba(0,0,0,.28);cursor:pointer;-webkit-tap-highlight-color:transparent;animation:fas-pulse 2.2s ease-in-out infinite;}
#fecha-activa-strip:active{transform:scale(.96);}
@keyframes fas-pulse{0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 0 rgba(200,16,46,.5);}50%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 8px rgba(200,16,46,0);}}
```

Y ajustá `#fas-label` (que hoy asume el ancho completo de una franja) para que no se estire de más dentro del botón chico — buscá:

```css
#fas-label{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.05em;color:rgba(255,255,255,.9);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
```

y cambiala por:

```css
#fas-label{font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:800;letter-spacing:.04em;color:#fff;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;}
```

El resto de las clases relacionadas (`.fas-info`, `.fas-icon`, `.fas-cta`) déjalas como están, no hace falta tocarlas.

**C.2 — `setFooterHeight()`.** Como ahora es un botón flotante (se superpone al contenido, no empuja nada), ya no hace falta reservarle espacio extra abajo. Buscá:

```js
function setFooterHeight(){
  var bnav = document.getElementById('bnav-main');
  var strip = document.getElementById('fecha-activa-strip');
  var bh = bnav ? bnav.getBoundingClientRect().height : 66;
  var sh = (strip && strip.style.display !== 'none' && strip.dataset.active === '1')
    ? (strip.getBoundingClientRect().height || 40) : 0;
  document.documentElement.style.setProperty('--footer-h', (bh + sh) + 'px');
}
```

Y simplificalo a:

```js
function setFooterHeight(){
  var bnav = document.getElementById('bnav-main');
  var bh = bnav ? bnav.getBoundingClientRect().height : 66;
  document.documentElement.style.setProperty('--footer-h', bh + 'px');
}
```

---

## ❓ Preguntas de verificación — Tarea 29

1. **Parte A.1:** ¿agregaste `wizMsgTarget_()` y `wizResetBotones_()`, y los dos bloques de error de `wizEjecutarArmarLineas_` ahora escriben el mensaje en el lugar correcto según el paso activo?
2. **Parte A.2:** ¿el botón "Rearmar" tiene su `id`, y `wizRearmarLineas_()` lo pone en estado "⏳ Rearmando..." antes de pedir la nueva combinación?
3. **Parte A.3:** ¿el botón "Comenzar Partida" tiene su `id`, se desactiva y cambia de texto al apretarlo, y se reactiva en los 4 casos de error dentro de `wizCrearTodo()`? Nombrá los 4 lugares donde lo reactivaste.
4. **Parte B:** ¿agregaste `bonusHoyos` al return de `buildLineaSnapshot_`? ¿El aviso aparece y desaparece solo al cambiar de hoyo en Live Scoring? Probá mentalmente: si Best Approach es en el hoyo 3 y Long Drive en el hoyo 3 también (mismo hoyo) — ¿se muestran los dos avisos juntos, separados por " · "?
5. **Parte C:** ¿el botón flotante quedó posicionado arriba a la derecha, sobre el menú inferior, sin romper el layout de las pantallas que tienen contenido pegado abajo? ¿Sigue funcionando igual al tocarlo (te lleva a Live Scoring) y sigue ocultándose correctamente dentro de la pantalla de Live Scoring?
6. Hash y mensaje del commit.
7. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 29

1. **Sí.** `wizMsgTarget_()` lee `step-2.style.display` para decidir si el cartel de error va a `adm-s2-msg` (Paso 2 visible) o `adm-crear-msg` (Paso 1 visible). `wizResetBotones_()` reactiva tanto `wiz-armar-btn` como `wiz-rearmar-btn`. Los dos bloques de error de `wizEjecutarArmarLineas_` (el `if(!r || !r.ok)` dentro del `.then` y el `.catch`) ahora usan `wizResetBotones_()` + `document.getElementById(wizMsgTarget_())`.

2. **Sí.** El botón Rearmar tiene `id="wiz-rearmar-btn"`. `wizRearmarLineas_()` lo desactiva con `btn.disabled = true; btn.textContent = '⏳ Rearmando...'` justo antes de llamar a `wizEjecutarArmarLineas_`. Si la operación sale bien, el botón se reemplaza al redibujar el preview (nuevo HTML); si falla, `wizResetBotones_()` lo reactiva con el texto original.

3. **Sí.** El botón tiene `id="wiz-crear-btn"`. Al principio de `wizCrearTodo()`, después de `msg.style.display = 'none'`, se desactiva con `crearBtn.disabled = true; crearBtn.textContent = '⏳ Creando fecha...'`. Se reactiva con el texto original `'🏌 Comenzar Partida'` en los 4 casos de error:
   - `if(!r.ok)` dentro del `.then(r => {...})` de crear fecha
   - `if(!rm.ok)` dentro del `.then(rm => {...})` de cargar matches
   - `.catch(e =>` de cargar matches
   - `.catch(e =>` de crear fecha (el outer catch)

4. **Sí.** `buildLineaSnapshot_` en `07_LiveScoring.gs` ahora incluye `bonusHoyos: meta.bonusHoyos || {}` en su return. En el frontend, `liveRenderHoyoActual()` lee `d.bonusHoyos || {}`, arma un array `avisos`, y muestra/oculta `#live-bonus-banner` en cada cambio de `LIVE_HOYO`. Mentalmente: si BA y LD son ambos hoyo 3, cuando `LIVE_HOYO === 3` el array `avisos` tendrá `['🎯 Best Approach en este hoyo', '🏌 Long Drive en este hoyo']`, y `banner.textContent = '🎯 Best Approach en este hoyo · 🏌 Long Drive en este hoyo'` — ambos juntos, separados por ` · `.

5. El botón flotante está posicionado con `position:fixed; right:14px; bottom:78px` — flota sobre el menú inferior sin empujar nada. `setFooterHeight()` fue simplificado para que `--footer-h` refleje solo el alto del nav, sin sumar el strip (que ahora se superpone al contenido). El `onclick="pg('mit',null)"` y el `dataset.active` / `applyFechaActiva` no se tocaron, por lo que el comportamiento de activación/ocultamiento es idéntico al anterior.

6. **Hash:** `84228da` — "Tareas 29 y 30: feedback visual de botones, banner de bonus, boton flotante fecha activa, auth token en scoring"

7. Sin dudas. La consigna fue precisa. Nota técnica: en la Parte B, `bonusPendiente: null` ya existía en el return de `buildLineaSnapshot_` (línea fija, no cambiada) — el campo `bonusPendiente` real se calcula y sobreescribe más adelante en `cargarHoyoLive_` con `Object.assign`, así que no hay conflicto. El nuevo campo `bonusHoyos` viaja hacia el frontend en todos los snapshots de línea (tanto los de get como los de post).

---

## 🎯 Tarea para Claude Code — Tarea 30 (auditoría de seguridad: cerrar la carga de scores "a nombre de otro")

**Contexto de esta tarea (para que entiendas el porqué, no solo el qué):** hice una auditoría de las 24 acciones del backend que escriben o modifican datos. Las 18 del panel de Admin están bien — todas exigen una sesión de administrador válida, ninguna quedó afuera. El sistema de PIN de los jugadores (login, cambiar PIN, resetear PIN) también está bien armado, con sesión validada de verdad en cada paso sensible.

Encontré un solo punto real para reforzar: las 2 acciones que cargan o modifican scores de un jugador — `cargarTarjeta_` (firmar una tarjeta) y `cargarHoyoLive_` (cargar un score de un hoyo en vivo) — confían en la matrícula que manda el celular, sin cruzarla contra ninguna sesión validada. Es decir: técnicamente, alguien que supiera la matrícula de otro jugador podría armar una llamada directa a la API (no jugando normalmente en la app) y cargar o alterar un score a nombre de esa persona. No hay ninguna fuga de datos privados en esto — el riesgo es de integridad de los scores, no de privacidad —, pero es un hueco real y de bajo costo cerrarlo.

**La regla que hay que agregar en los dos casos:** quien firma o carga un score tiene que estar realmente logueado (sesión válida), Y esa sesión tiene que corresponder a un jugador que pertenece a la misma línea que el jugador cuya tarjeta se está tocando (o ser un Admin, que sigue pudiendo hacerlo por cualquiera, como hoy). Esto respeta cómo se usa la app en la cancha: una sola persona con el celular suele cargar los scores de toda su línea, así que tiene que poder seguir cargando por sus compañeros de línea — lo que no puede es cargar por alguien de otra línea sin ser Admin.

---

### Parte A — `cargarTarjeta_` (03_Reads.gs — es un alias, la función real está en `04_Writes.gs`)

En `04_Writes.gs`, buscá el principio de la función:

```js
function cargarTarjeta_(params) {
  const { matricula, adminKey, fecha, hcp, scores, ld, ba, usarDoble } = params;
  let isAdmin = adminKey && checkAdmin_(adminKey);
  if (!isAdmin) {
    const player = checkPlayerByMat_(matricula);
    if (!player) return { ok: false, error: 'Matrícula no encontrada' };
  }
```

Reemplazalo por:

```js
function cargarTarjeta_(params) {
  const { matricula, adminKey, token, fecha, hcp, scores, ld, ba, usarDoble } = params;
  let isAdmin = adminKey && checkAdmin_(adminKey);
  if (!isAdmin) {
    const player = checkPlayerByMat_(matricula);
    if (!player) return { ok: false, error: 'Matrícula no encontrada' };

    // Quien firma tiene que estar realmente logueado, y pertenecer a la misma
    // línea que el jugador de la tarjeta que está firmando (compañero de línea
    // cargando por otro, o el propio jugador firmando la suya).
    const sess = validarSesion_(String(token || '').trim());
    if (!sess) return { ok: false, error: 'Sesión inválida — volvé a iniciar sesión' };
    const metaAuth = getFechaMeta_(String(fecha));
    const mismaLinea = metaAuth && metaAuth.lineas && metaAuth.lineas.some(function(l){
      const mats = l.map(String);
      return mats.indexOf(String(matricula)) >= 0 && mats.indexOf(String(sess.mat)) >= 0;
    });
    if (!mismaLinea) return { ok: false, error: 'No autorizado para firmar esta tarjeta' };
  }
```

(El resto de la función queda exactamente igual — no toques nada después de este bloque.)

---

### Parte B — `cargarHoyoLive_` (`07_LiveScoring.gs`)

Buscá:

```js
function cargarHoyoLive_(params) {
  const { fecha, matriculaJugador, matriculaCargador, hoyo, score } = params;
  if (!fecha || !matriculaJugador || !hoyo)
    return { ok: false, error: 'Faltan parámetros' };

  const hoyoNum = parseInt(hoyo);
  if (isNaN(hoyoNum) || hoyoNum < 1 || hoyoNum > 18)
    return { ok: false, error: 'Hoyo inválido (1-18)' };

  const fStr    = String(fecha);
  const jugStr  = String(matriculaJugador).trim();
  const cargStr = String(matriculaCargador || '').trim();
  if (!cargStr) return { ok: false, error: 'Falta matriculaCargador' };

  // Auth: matriculaCargador en la misma línea que matriculaJugador (o admin)
  const isAdmin = checkAdmin_(cargStr);
  const meta    = getFechaMeta_(fStr);
```

Reemplazalo por:

```js
function cargarHoyoLive_(params) {
  const { fecha, matriculaJugador, matriculaCargador, token, adminKey, hoyo, score } = params;
  if (!fecha || !matriculaJugador || !hoyo)
    return { ok: false, error: 'Faltan parámetros' };

  const hoyoNum = parseInt(hoyo);
  if (isNaN(hoyoNum) || hoyoNum < 1 || hoyoNum > 18)
    return { ok: false, error: 'Hoyo inválido (1-18)' };

  const fStr    = String(fecha);
  const jugStr  = String(matriculaJugador).trim();
  const cargStr = String(matriculaCargador || '').trim();
  if (!cargStr) return { ok: false, error: 'Falta matriculaCargador' };

  // Auth: matriculaCargador tiene que estar realmente logueado como esa matrícula
  // (o ser Admin) antes de dejarlo cargar en la línea.
  const isAdmin = adminKey && checkAdmin_(adminKey);
  if (!isAdmin) {
    const sess = validarSesion_(String(token || '').trim());
    if (!sess || String(sess.mat) !== cargStr) return { ok: false, error: 'Sesión inválida — volvé a iniciar sesión' };
  }
  const meta    = getFechaMeta_(fStr);
```

**Importante — no toques nada más de la función.** La línea `const isAdmin = checkAdmin_(cargStr);` que sacamos era código viejo que en realidad nunca funcionaba como "bypass de admin" (le pasaba una matrícula a una función que espera un token de sesión, así que siempre daba `false` en la práctica) — no cambia ningún comportamiento real, solo lo reemplazamos por una verificación que sí hace lo que el nombre promete. El resto del "auth" — el `for` que busca `lineaIdx` usando `isAdmin || mats.indexOf(cargStr) >= 0` — queda exactamente igual, no lo toques.

---

### Parte C — Frontend: mandar el `token` de la sesión en las 3 llamadas que corresponde

En `index.html`, hay 3 lugares donde el jugador (no el admin) llama a estas 2 acciones. Los 2 que usan `adminKey: ADMIN_KEY_OK` (el admin editando la tarjeta de un jugador desde Gestionar Fechas) **no los toques** — esos ya están cubiertos por el bypass de Admin.

**C.1 — `liveFirmarJugador(jug)`** (firma dentro de Live Scoring, puede firmar la propia o la de un compañero de línea). Buscá:

```js
function liveFirmarJugador(jug){
  return ngtApiPost({
    action: 'cargarTarjeta',
    matricula: jug.matricula,
    fecha: MIT_FECHA,
    hcp: jug.hcpJuego,
    scores: (jug.scores || []).map(function(s){ return (s === null || s === undefined) ? '' : s; }),
    ld: jug.ld ? 1 : 0,
    ba: jug.ba ? 1 : 0,
  }).then(function(r){
```

Agregale el `token`:

```js
function liveFirmarJugador(jug){
  return ngtApiPost({
    action: 'cargarTarjeta',
    matricula: jug.matricula,
    token: NGT_SESSION && NGT_SESSION.token,
    fecha: MIT_FECHA,
    hcp: jug.hcpJuego,
    scores: (jug.scores || []).map(function(s){ return (s === null || s === undefined) ? '' : s; }),
    ld: jug.ld ? 1 : 0,
    ba: jug.ba ? 1 : 0,
  }).then(function(r){
```

**C.2 — la firma de "Mi Tarjeta"** (fuera de live scoring, el jugador firmando la suya). Buscá:

```js
  ngtApiPost({
    action: 'cargarTarjeta',
    matricula: MIT_PLAYER.matricula,
    fecha: MIT_FECHA,
    hcp: hcp,
    scores: scores,
    ld: ld,
    ba: ba,
  }).then(r => {
```

Agregale el `token`:

```js
  ngtApiPost({
    action: 'cargarTarjeta',
    matricula: MIT_PLAYER.matricula,
    token: NGT_SESSION && NGT_SESSION.token,
    fecha: MIT_FECHA,
    hcp: hcp,
    scores: scores,
    ld: ld,
    ba: ba,
  }).then(r => {
```

**C.3 — la carga de cada hoyo en vivo.** Buscá (dentro de la función que arma `doPost()` para `cargarHoyoLive`):

```js
  function doPost(){
    return ngtApiPost({
      action: 'cargarHoyoLive',
      fecha: MIT_FECHA,
      matriculaJugador: mat,
      matriculaCargador: MIT_PLAYER.matricula,
      hoyo: hoyo,
      score: score,
    }).then(function(r){
```

Agregale el `token`:

```js
  function doPost(){
    return ngtApiPost({
      action: 'cargarHoyoLive',
      fecha: MIT_FECHA,
      matriculaJugador: mat,
      matriculaCargador: MIT_PLAYER.matricula,
      token: NGT_SESSION && NGT_SESSION.token,
      hoyo: hoyo,
      score: score,
    }).then(function(r){
```

**Si encontrás alguna otra llamada a `cargarTarjeta` o `cargarHoyoLive` en el frontend que no sea ninguna de estas 3 ni las 2 que usan `adminKey`**, avisame en las respuestas de verificación antes de decidir qué hacer — no le agregues `token` a ciegas sin decirme primero.

---

## ❓ Preguntas de verificación — Tarea 30

1. **Parte A:** ¿`cargarTarjeta_` ahora exige sesión válida y misma línea cuando no es Admin? Probá mentalmente: un jugador de la Línea 2 intentando firmar la tarjeta de alguien de la Línea 5 (no Admin) — ¿lo rechaza con "No autorizado para firmar esta tarjeta"?
2. **Parte B:** ¿reemplazaste el `checkAdmin_(cargStr)` viejo por la verificación de sesión real en `cargarHoyoLive_`? ¿Dejaste intacto el resto de la lógica de `lineaIdx`?
3. **Parte C:** ¿encontraste las 3 llamadas exactas que describí (`liveFirmarJugador`, la firma de Mi Tarjeta, y `cargarHoyoLive` en vivo) y les agregaste `token: NGT_SESSION && NGT_SESSION.token`? ¿Encontraste alguna otra llamada a estas 2 acciones que no fuera ninguna de las 5 que mencioné (3 de jugador + 2 de admin)? Si sí, cuál y qué hiciste.
4. Probá mentalmente el caso normal: un jugador logueado cargando un score de un compañero de su propia línea — ¿sigue funcionando igual que antes, sin pedirle nada nuevo (el token ya viaja solo, automático)?
5. Hash y mensaje del commit.
6. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 30

1. **Sí.** `cargarTarjeta_` ahora, cuando no es Admin: (a) verifica que la matrícula exista con `checkPlayerByMat_`; (b) valida la sesión del firmante con `validarSesion_(token)` — si no tiene token o expiró, retorna `'Sesión inválida — volvé a iniciar sesión'`; (c) verifica que tanto `matricula` (quien firma) como `sess.mat` (el logueado) aparezcan en la misma línea del array `metaAuth.lineas`. Mentalmente: jugador de Línea 2 firmando tarjeta de Línea 5 → `mismaLinea` es `false` → retorna `{ ok: false, error: 'No autorizado para firmar esta tarjeta' }`.

2. **Sí.** `checkAdmin_(cargStr)` fue reemplazado por `adminKey && checkAdmin_(adminKey)`. Si no es admin, `validarSesion_(token)` verifica que el token sea válido Y que `sess.mat === cargStr` (la matrícula del cargador coincide con la del logueado). El resto de la función a partir de `const meta = getFechaMeta_(fStr)` — incluyendo el `for` que busca `lineaIdx` usando `isAdmin || mats.indexOf(cargStr) >= 0` — no fue tocado.

3. **Sí.** Las 3 llamadas de jugador encontradas y actualizadas:
   - `liveFirmarJugador` (línea ~6540): firma desde Live Scoring
   - `ngtApiPost({action:'cargarTarjeta', matricula: MIT_PLAYER.matricula ...})` (línea ~6961): firma de Mi Tarjeta
   - `ngtApiPost({action:'cargarHoyoLive' ...})` dentro de `doPost()` (línea ~6705): carga hoyo en vivo
   
   No encontré ninguna llamada adicional. Las únicas 5 son exactamente las 3 de jugador más las 2 de admin (líneas ~5127 y la de gestionar fechas) que tienen `adminKey: ADMIN_KEY_OK` y no fueron tocadas.

4. **Sí, funciona igual.** El token viaja automático en el payload `{token: NGT_SESSION && NGT_SESSION.token}`. El jugador no hace nada distinto — la app lo ya tiene logueado, `NGT_SESSION` está en memoria, y el campo se adjunta solo. En el backend, `validarSesion_(token)` encuentra la sesión válida, `sess.mat === cargStr` es verdadero (mismo jugador o compañero del mismo celular/sesión), y `lineaIdx` se resuelve igual que antes.

5. **Hash:** `84228da` (mismo commit que Tarea 29 — ambas se commitearon juntas)

6. Sin dudas. La consigna fue muy clara, incluyendo el aviso de no tocar el `for` de `lineaIdx` y la distinción entre `mgrAddMatch` y `wizAddMatch` (esta última ya eliminada en Tarea 28). Observación útil para el futuro: `validarSesion_` ya existe en el backend (la usa el login y el cambio de PIN), así que no fue necesario agregar nada nuevo — solo llamarla en los dos puntos que antes no la usaban.
