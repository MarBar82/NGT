# PROJECT_STATE.md — NGT

**Última actualización:** 2026-09-03
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 29 y 30 confirmadas. Ahora van 3 tareas juntas, **totalmente independientes entre sí** (Code las puede hacer en cualquier orden, en la misma sesión):

- **Tarea 31** — Fase 3 del rediseño del panel de admin: dividir el Paso 1 de "Crear Fecha" en dos pasos separados, Cancha y Jugadores. Ya la conocés, la charlamos antes.
- **Tarea 32** — Bug reportado: al borrar la fecha activa, el botón flotante de "FECHA en juego" no desaparece. Encontré la causa exacta revisando el código.
- **Tarea 33** — Bug reportado: el aviso de "acá se juega el bonus" (Long Drive / Best Approach) no se ve cuando el jugador llega al hoyo — solo aparece la pregunta después de cargar el score de ese hoyo. Encontré por qué: el aviso técnicamente existe en el código, pero queda tapado por la ventana donde se anota el score.

**Tarea 32 requiere que hagas el deploy manual en el editor de Apps Script** (es un cambio de backend, `.gs`). **Tarea 33 es puro frontend** (`index.html`), se publica sola en GitHub Pages apenas Code hace el commit — no requiere que hagas nada manual vos.

---

## 🎯 Tarea para Claude Code — Tarea 31 (Fase 3 del rediseño de admin)

### Qué cambia

Hoy "Crear Fecha" tiene 2 pasos: **Paso 1 "Datos"** (todo junto: número de fecha, cancha, color de salidas, horario, green fee, hoyo de salida, hoyos de bonus, Y la lista de jugadores) → **Paso 2 "Matches"** (líneas armadas).

Pasa a tener 3 pasos:
- **Paso 1 "Cancha"** — número de fecha, cancha, color de salidas, horario, green fee, hoyo de salida, hoyos de bonus. Botón "Siguiente →".
- **Paso 2 "Jugadores"** — la lista de jugadores para marcar quién juega. Botón "← Volver" y "⚡ Armar Líneas →" (el mismo botón de siempre, sin cambios de comportamiento).
- **Paso 3 "Líneas"** — sin cambios, es el Paso 2 actual renombrado.

Ningún dato ni validación de fondo cambia — es puramente una reorganización visual de los mismos campos. La función que valida y arma la fecha (`wizValidarPaso1_`) no se toca, porque ya lee cada campo por su `id` sin importar si está visible o no.

### Cambio 1 — HTML: dividir el Paso 1 en dos sub-paneles + indicador de 3 pasos

Buscá este bloque completo (el indicador de pasos + todo el `<div class="adm-card" id="step-1">`):

```html
      <!-- Paso indicator -->
      <div class="adm-steps">
        <div class="adm-step on" id="step-ind-1"><span class="adm-step-num">1</span><span class="adm-step-lbl">Datos</span></div>
        <div class="adm-step-bar"></div>
        <div class="adm-step" id="step-ind-2"><span class="adm-step-num">2</span><span class="adm-step-lbl">Matches</span></div>
      </div>

      <!-- PASO 1: datos -->
      <div class="adm-card" id="step-1">
        <div class="adm-card-hdr">📅 Paso 1 · Datos de la Fecha</div>
        <div class="adm-card-body">

          <div class="adm-row">
            <div class="adm-field">
              <label class="adm-label">Número de Fecha</label>
              <input type="number" id="adm-fecha" class="adm-input" placeholder="3" min="1">
            </div>
            <div class="adm-field">
              <label class="adm-label">Cancha</label>
              <select id="adm-cancha" class="adm-input" onchange="loadColoresCancha()">
                <option value="">Cargando...</option>
              </select>
            </div>
          </div>

          <div class="adm-row">
            <div class="adm-field">
              <label class="adm-label">Color de Salidas</label>
              <select id="adm-color-tee" class="adm-input">
                <option value="BLANCAS">Blancas (default)</option>
              </select>
              <div class="adm-hint" id="adm-color-hint" style="font-size:10px;color:var(--g4);margin-top:3px;letter-spacing:.04em;">Seleccioná una cancha primero</div>
            </div>
          </div>

          <label class="adm-label">Jugadores que disputan la fecha</label>
          <div id="adm-jugadores-list" class="adm-jugs">Cargando...</div>

          <div class="adm-row" style="margin-top:14px;">
            <div class="adm-field">
              <label class="adm-label">Horario de salida</label>
              <input type="time" id="adm-horario" class="adm-input" value="09:40">
            </div>
            <div class="adm-field">
              <label class="adm-label">Green Fee</label>
              <input type="text" id="adm-greenfee" class="adm-input" placeholder="$ 0.000">
            </div>
          </div>
          <div class="adm-row">
            <div class="adm-field">
              <label class="adm-label">Hoyo de salida</label>
              <select id="adm-hoyo-salida" class="adm-input">
                <option value="1">Hoyo 1</option>
                <option value="10">Hoyo 10</option>
              </select>
            </div>
          </div>

          <div class="adm-row">
            <div class="adm-field">
              <label class="adm-label">Hoyo Best Approach <span style="font-size:10px;opacity:.6;">(par 3)</span></label>
              <select id="adm-bonus-ba" class="adm-input" disabled>
                <option value="">— Seleccioná cancha primero —</option>
              </select>
            </div>
            <div class="adm-field">
              <label class="adm-label">Hoyo Long Drive <span style="font-size:10px;opacity:.6;">(par 4/5)</span></label>
              <select id="adm-bonus-ld" class="adm-input" disabled>
                <option value="">— Seleccioná cancha primero —</option>
              </select>
            </div>
          </div>

          <button class="adm-btn-primary" id="wiz-armar-btn" onclick="wizArmarLineas()" style="margin-top:18px;">⚡ Armar Líneas →</button>
          <div id="adm-crear-msg" class="adm-msg" style="display:none;"></div>
        </div>
      </div>
```

Reemplazalo por esto (fijate que todos los campos son los mismos, con el mismo `id`, solo reorganizados en dos sub-paneles):

```html
      <!-- Paso indicator -->
      <div class="adm-steps">
        <div class="adm-step on" id="step-ind-1"><span class="adm-step-num">1</span><span class="adm-step-lbl">Cancha</span></div>
        <div class="adm-step-bar"></div>
        <div class="adm-step" id="step-ind-1b"><span class="adm-step-num">2</span><span class="adm-step-lbl">Jugadores</span></div>
        <div class="adm-step-bar"></div>
        <div class="adm-step" id="step-ind-2"><span class="adm-step-num">3</span><span class="adm-step-lbl">Líneas</span></div>
      </div>

      <!-- PASO 1: datos (dividido en 1a Cancha / 1b Jugadores) -->
      <div class="adm-card" id="step-1">

        <!-- PASO 1a: Cancha -->
        <div id="step-1a">
          <div class="adm-card-hdr">📅 Paso 1 · Cancha</div>
          <div class="adm-card-body">

            <div class="adm-row">
              <div class="adm-field">
                <label class="adm-label">Número de Fecha</label>
                <input type="number" id="adm-fecha" class="adm-input" placeholder="3" min="1">
              </div>
              <div class="adm-field">
                <label class="adm-label">Cancha</label>
                <select id="adm-cancha" class="adm-input" onchange="loadColoresCancha()">
                  <option value="">Cargando...</option>
                </select>
              </div>
            </div>

            <div class="adm-row">
              <div class="adm-field">
                <label class="adm-label">Color de Salidas</label>
                <select id="adm-color-tee" class="adm-input">
                  <option value="BLANCAS">Blancas (default)</option>
                </select>
                <div class="adm-hint" id="adm-color-hint" style="font-size:10px;color:var(--g4);margin-top:3px;letter-spacing:.04em;">Seleccioná una cancha primero</div>
              </div>
            </div>

            <div class="adm-row" style="margin-top:14px;">
              <div class="adm-field">
                <label class="adm-label">Horario de salida</label>
                <input type="time" id="adm-horario" class="adm-input" value="09:40">
              </div>
              <div class="adm-field">
                <label class="adm-label">Green Fee</label>
                <input type="text" id="adm-greenfee" class="adm-input" placeholder="$ 0.000">
              </div>
            </div>
            <div class="adm-row">
              <div class="adm-field">
                <label class="adm-label">Hoyo de salida</label>
                <select id="adm-hoyo-salida" class="adm-input">
                  <option value="1">Hoyo 1</option>
                  <option value="10">Hoyo 10</option>
                </select>
              </div>
            </div>

            <div class="adm-row">
              <div class="adm-field">
                <label class="adm-label">Hoyo Best Approach <span style="font-size:10px;opacity:.6;">(par 3)</span></label>
                <select id="adm-bonus-ba" class="adm-input" disabled>
                  <option value="">— Seleccioná cancha primero —</option>
                </select>
              </div>
              <div class="adm-field">
                <label class="adm-label">Hoyo Long Drive <span style="font-size:10px;opacity:.6;">(par 4/5)</span></label>
                <select id="adm-bonus-ld" class="adm-input" disabled>
                  <option value="">— Seleccioná cancha primero —</option>
                </select>
              </div>
            </div>

            <button class="adm-btn-primary" id="wiz-siguiente-btn" onclick="wizPaso1aNext()" style="margin-top:18px;">Siguiente →</button>
            <div id="adm-crear-msg-cancha" class="adm-msg" style="display:none;"></div>
          </div>
        </div>

        <!-- PASO 1b: Jugadores -->
        <div id="step-1b" style="display:none;">
          <div class="adm-card-hdr">👥 Paso 2 · Jugadores</div>
          <div class="adm-card-body">

            <label class="adm-label">Jugadores que disputan la fecha</label>
            <div id="adm-jugadores-list" class="adm-jugs">Cargando...</div>

            <div class="adm-btn-row" style="margin-top:18px;">
              <button class="btn-back" onclick="wizPaso1aBack()">← Volver</button>
              <button class="adm-btn-primary" id="wiz-armar-btn" onclick="wizArmarLineas()">⚡ Armar Líneas →</button>
            </div>
            <div id="adm-crear-msg" class="adm-msg" style="display:none;"></div>
          </div>
        </div>

      </div>
```

**Importante:** el `<div class="adm-card" id="step-2" ...>` (Paso 2 · Líneas y Matches) que viene justo después **no se toca** — queda exactamente igual, solo que ahora visualmente es el "Paso 3" gracias al indicador de arriba.

### Cambio 2 — JS: dos funciones nuevas de navegación

Buscá la función `wizPaso1Back()`:

```js
function wizPaso1Back(){
  document.getElementById('step-1').style.display = 'block';
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-ind-1').classList.add('on');
  document.getElementById('step-ind-2').classList.remove('on');
}
```

Reemplazala por esto (que además agrega las dos funciones nuevas `wizPaso1aNext()` y `wizPaso1aBack()`, y una función de reseteo completo que se usa en el Cambio 4):

```js
function wizPaso1Back(){
  document.getElementById('step-1').style.display = 'block';
  document.getElementById('step-1a').style.display = 'none';
  document.getElementById('step-1b').style.display = 'block';
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-ind-1b').classList.add('on');
  document.getElementById('step-ind-2').classList.remove('on');
}

function wizPaso1aNext(){
  const fechaEl = document.getElementById('adm-fecha');
  const canchaEl = document.getElementById('adm-cancha');
  const fecha = fechaEl ? fechaEl.value.trim() : '';
  const canchaId = canchaEl ? canchaEl.value.trim() : '';
  const msg = document.getElementById('adm-crear-msg-cancha');
  msg.style.display = 'none';
  if(!fecha){
    msg.className = 'adm-msg err'; msg.textContent = 'Falta el número de fecha'; msg.style.display = 'block'; return;
  }
  if(!canchaId){
    msg.className = 'adm-msg err'; msg.textContent = 'Falta seleccionar cancha'; msg.style.display = 'block'; return;
  }
  document.getElementById('step-1a').style.display = 'none';
  document.getElementById('step-1b').style.display = 'block';
  document.getElementById('step-ind-1').classList.remove('on');
  document.getElementById('step-ind-1b').classList.add('on');
}

function wizPaso1aBack(){
  document.getElementById('step-1b').style.display = 'none';
  document.getElementById('step-1a').style.display = 'block';
  document.getElementById('step-ind-1b').classList.remove('on');
  document.getElementById('step-ind-1').classList.add('on');
}

function wizResetWizardCompleto_(){
  document.getElementById('step-1').style.display = 'block';
  document.getElementById('step-1a').style.display = 'block';
  document.getElementById('step-1b').style.display = 'none';
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-ind-1').classList.add('on');
  document.getElementById('step-ind-1b').classList.remove('on');
  document.getElementById('step-ind-2').classList.remove('on');
}
```

### Cambio 3 — JS: `wizMostrarPaso2_` tiene que apagar el indicador correcto

Buscá dentro de `wizMostrarPaso2_`:

```js
  document.getElementById('step-1').style.display = 'none';
  document.getElementById('step-2').style.display = 'block';
  document.getElementById('step-ind-1').classList.remove('on');
  document.getElementById('step-ind-2').classList.add('on');
```

Reemplazá solo esa tercera línea — el resto queda igual:

```js
  document.getElementById('step-1').style.display = 'none';
  document.getElementById('step-2').style.display = 'block';
  document.getElementById('step-ind-1b').classList.remove('on');
  document.getElementById('step-ind-2').classList.add('on');
```

(Motivo: cuando se llega al Paso 3 "Líneas", el admin viene parado en el Paso 2 "Jugadores" — el indicador que hay que apagar es `step-ind-1b`, no `step-ind-1` que ya estaba apagado desde que avanzó de Cancha a Jugadores.)

### Cambio 4 — JS: `finalizarWizard` tiene que resetear al Paso 1 completo, no solo "un paso atrás"

Buscá dentro de `finalizarWizard`, el bloque de reseteo:

```js
    document.getElementById('adm-fecha').value = '';
    document.querySelectorAll('#adm-jugadores-list input:checked').forEach(i => i.checked = false);
    WIZ_PASO1_DATA = null;
    wizPaso1Back();
```

Reemplazá la última línea:

```js
    document.getElementById('adm-fecha').value = '';
    document.querySelectorAll('#adm-jugadores-list input:checked').forEach(i => i.checked = false);
    WIZ_PASO1_DATA = null;
    wizResetWizardCompleto_();
```

(Motivo: `wizPaso1Back()` ahora deja el wizard parado en "Jugadores" — que tiene sentido cuando el admin aprieta "← Volver" desde Líneas. Pero después de crear una fecha con éxito, tiene que volver directo al principio, "Cancha", no quedar a mitad de camino para la próxima vez que se abra Crear Fecha.)

### Qué NO cambia

- `wizValidarPaso1_()` — sin tocar, ya lee todos los campos por `id`.
- `wizArmarLineas()`, `wizEjecutarArmarLineas_()`, `wizMsgTarget_()` — sin tocar. `wizMsgTarget_()` sigue devolviendo el `id` `adm-crear-msg`, que ahora vive dentro del Paso 1b — sigue funcionando igual porque busca por `id`, no le importa en qué sub-panel esté.
- El `<div id="step-2">` (Líneas) — sin tocar.
- No hay cambios de backend (`.gs`) en esta tarea — es 100% frontend, en `index.html`.

---

## ❓ Preguntas de verificación — Tarea 31

1. ¿Quedó el indicador de arriba mostrando 3 pasos ("Cancha" / "Jugadores" / "Líneas"), con el primero resaltado al entrar a "Crear Fecha"?
2. Probá el flujo completo: cargá los datos de Cancha → "Siguiente →" → ¿pasa a Jugadores y se resalta el paso 2 del indicador? Marcá jugadores → "⚡ Armar Líneas →" → ¿pasa a Líneas (paso 3) igual que antes?
3. Desde Líneas, apretá "← Volver" — ¿vuelve directo a Jugadores (no a Cancha)?
4. Desde Jugadores, apretá "← Volver" — ¿vuelve a Cancha, con el número de fecha y la cancha que habías cargado todavía completos (no se borraron)?
5. En el Paso Cancha, dejá el número de fecha vacío y apretá "Siguiente →" — ¿te avisa el error ahí mismo, sin pasar de paso?
6. Completá una fecha entera de punta a punta (Cancha → Jugadores → Armar Líneas → Comenzar Partida) — después de que confirma "Fecha creada", si volvés a entrar a "Crear Fecha" desde el menú de admin, ¿arranca de nuevo en el Paso 1 "Cancha" (vacío), no en "Jugadores"?
7. Hash y mensaje del commit.
8. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 31

1. **Sí.** El `<div class="adm-steps">` ahora tiene 3 indicadores: `step-ind-1` ("Cancha", clase `on` al entrar), barra, `step-ind-1b` ("Jugadores"), barra, `step-ind-2` ("Líneas"). Al abrir "Crear Fecha" solo el primero está resaltado.

2. **Sí.** `wizPaso1aNext()` valida fecha y cancha, oculta `step-1a`, muestra `step-1b`, quita `on` de `step-ind-1` y agrega `on` a `step-ind-1b`. El botón "⚡ Armar Líneas →" en `step-1b` llama a `wizArmarLineas()` sin cambios — este llama a `wizEjecutarArmarLineas_` que llama a `wizMostrarPaso2_`, que oculta `step-1`, muestra `step-2`, quita `on` de `step-ind-1b` y agrega `on` a `step-ind-2`. Flujo completo sin interrupciones.

3. **Sí.** `wizPaso1Back()` (llamado desde el botón "← Volver" del Paso 3 `step-2`) muestra `step-1` con `step-1b` visible (`step-1a` oculto), y pone `on` en `step-ind-1b` — el admin queda parado en "Jugadores", no en "Cancha".

4. **Sí.** `wizPaso1aBack()` solo oculta `step-1b` y muestra `step-1a` — no toca ningún campo del formulario. Los valores de `adm-fecha`, `adm-cancha`, `adm-color-tee`, horario, green fee, etc. siguen intactos en el DOM.

5. **Sí.** `wizPaso1aNext()` valida `fechaEl.value.trim()` antes de avanzar. Si está vacío, escribe el error en `#adm-crear-msg-cancha` y hace `return` sin tocar los indicadores ni cambiar de panel.

6. **Sí.** `finalizarWizard` ahora llama a `wizResetWizardCompleto_()` en lugar de `wizPaso1Back()`. `wizResetWizardCompleto_` pone `step-1a` visible, `step-1b` oculto, `step-2` oculto, `step-ind-1` con `on`, y saca `on` de `step-ind-1b` y `step-ind-2`. La próxima vez que se abra "Crear Fecha" el wizard arranca desde cero en "Cancha".

7. **Hash:** `c3becf0` — "Tareas 31/32/33: paso 3 en wizard admin, fix cache fechaActiva, banner bonus en modal de score"

8. Sin dudas. Nota: `wizMsgTarget_()` (de Tarea 29) sigue funcionando correctamente — devuelve `'adm-crear-msg'` cuando `step-2` está visible, que ahora vive dentro de `step-1b`. No hubo ningún conflicto.

---

## 🎯 Tarea para Claude Code — Tarea 32 (bug: el botón flotante no desaparece al borrar la fecha activa)

### Qué reportó Marco

Cuando se borra la fecha que está activa (la que muestra el botón flotante rojo "NGT FECHA X · EN JUEGO" en la esquina), el botón se queda ahí — no desaparece aunque la fecha ya no exista.

### La causa real (revisando el código)

`eliminarFecha_()` en `04_Writes.gs` ya hace todo lo necesario del lado de los datos: borra la fecha de `FECHA_META`, y ya invalida los cachés `'fechas'` y `'fechasConEstado'`. El problema es que se olvida de invalidar un tercer caché: `'fechaActiva'`.

Ese caché (`cachedRead_('fechaActiva', 60, getFechaActiva_)`, con 60 segundos de vida) es justo el que arma el dato que el botón flotante usa. Como no se invalida al borrar, el servidor le sigue contestando al celular "la fecha activa es la que borraste" durante hasta 60 segundos — y como el frontend automáticamente le vuelve a preguntar al servidor apenas termina el borrado (para refrescar), lo que consigue es la respuesta vieja, y el botón vuelve a aparecer solo.

Como comparación: cuando se carga una tarjeta (`cargarTarjeta`) sí se invalida ese mismo caché correctamente (`10_Routing.gs`, línea ~153) — a `eliminarFecha_` simplemente le faltó ese mismo paso.

### Fix — 1 línea, en `04_Writes.gs`

Buscá dentro de `eliminarFecha_`:

```js
  SpreadsheetApp.flush();
  audit_('ELIMINAR_FECHA', 'admin', { fecha, changes });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  try { CacheService.getScriptCache().removeAll(['fechas','fechasConEstado']); } catch(e) {}
```

Reemplazá la última línea por:

```js
  SpreadsheetApp.flush();
  audit_('ELIMINAR_FECHA', 'admin', { fecha, changes });
  try { CacheService.getScriptCache().remove('fechaRes_' + String(fecha)); } catch(e) {}
  try { CacheService.getScriptCache().removeAll(['fechas','fechasConEstado','fechaActiva','fl_' + String(fecha)]); } catch(e) {}
```

(De paso invalidamos también `'fl_' + fecha` — el caché de las líneas de esa fecha, usado por Mi Tarjeta/Live — para que tampoco quede dando vueltas info vieja de una fecha borrada.)

**Esto es un cambio de backend — necesitás pegarlo en el editor de Apps Script y hacer Deploy vos mismo, como siempre con los `.gs`.**

### ❓ Preguntas de verificación — Tarea 32

1. ¿Encontraste esa línea exacta en `eliminarFecha_` y la reemplazaste?
2. Probá mentalmente: admin borra la fecha activa desde la grilla de "Gestionar Fechas" — ¿el botón flotante debería desaparecer ahora en el mismo momento (sin esperar 60 segundos)?
3. Hash y mensaje del commit.
4. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 32

1. **Sí.** La línea exacta en `eliminarFecha_` (línea ~859 en `04_Writes.gs`):
   ```js
   try { CacheService.getScriptCache().removeAll(['fechas','fechasConEstado']); } catch(e) {}
   ```
   fue reemplazada por:
   ```js
   try { CacheService.getScriptCache().removeAll(['fechas','fechasConEstado','fechaActiva','fl_' + String(fecha)]); } catch(e) {}
   ```

2. **Sí.** Con `'fechaActiva'` invalidado en el mismo acto de borrar, la próxima llamada a `cachedRead_('fechaActiva', 60, getFechaActiva_)` corre `getFechaActiva_` de nuevo — que ya no encontrará la fecha borrada en `FECHA_META` — y devuelve `null`. `ngtInitData()` del frontend, que se ejecuta inmediatamente después del borrado, recibe esa respuesta vacía y oculta el botón flotante. Sin esperar los 60 segundos de TTL del caché viejo.

3. **Hash:** `c3becf0` (mismo commit que Tareas 31 y 33)

4. Sin dudas. Recordatorio: este cambio está en `04_Writes.gs` y **requiere deploy manual en el editor de Apps Script** para tomar efecto en producción.

---

## 🎯 Tarea para Claude Code — Tarea 33 (bug: el aviso de bonus no se ve al llegar al hoyo)

### Qué reportó Marco

Cuando en una fecha hay un hoyo marcado para Long Drive o Best Approach, los jugadores no se enteran de que están en ese hoyo hasta después de cargar el score — recién ahí aparece la pregunta de "¿quién ganó?". Tendría que avisarles ANTES, al llegar al hoyo.

### La causa real (revisando el código)

El aviso proactivo en realidad ya existe en el código — hay un cartel dorado (`#live-bonus-banner`) que se arma correctamente en `liveRenderHoyoActual()` con el mismo texto que necesitamos ("🎯 Best Approach en este hoyo" / "🏌 Long Drive en este hoyo"), usando el dato `bonusHoyos` que el backend ya manda bien.

El problema es dónde vive ese cartel: está en la pantalla de fondo (la grilla con los jugadores de la línea), pero apenas alguien toca un jugador para anotar un score se abre una ventana (modal) que tapa TODA la pantalla, incluido ese cartel. Y como al terminar de anotar un jugador, el sistema abre automáticamente la ventana del siguiente jugador (para que sea rápido cargar toda la línea), en la práctica nadie llega a ver nunca esa pantalla de fondo — se pasa de ventana en ventana, hoyo tras hoyo, sin que el cartel de aviso se vea jamás. Por eso la única señal que sí se nota es la pregunta de después (que es una ventana propia, esa sí se ve).

**Fix: mover el aviso adentro de la ventana donde se anota el score, para que sea imposible no verlo.**

### Cambio 1 — CSS: reutilizar el mismo estilo del cartel para los dos lugares

Buscá:

```css
#live-bonus-banner{background:var(--gold);color:var(--navy);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:center;padding:9px 12px;border-radius:6px;margin-bottom:8px;}
```

Reemplazalo por (mismo estilo, ahora como clase para poder usarlo en dos lugares):

```css
.bonus-banner{background:var(--gold);color:var(--navy);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:center;padding:9px 12px;border-radius:6px;margin-bottom:8px;}
```

### Cambio 2 — HTML: agregarle la clase al cartel que ya existe, y agregar uno nuevo dentro de la ventana de anotar score

Buscá:

```html
        <div id="live-bonus-banner" style="display:none;"></div>
```

Reemplazalo por:

```html
        <div id="live-bonus-banner" class="bonus-banner" style="display:none;"></div>
```

Después buscá el modal de anotar score (empieza así):

```html
<div id="score-modal" class="sm-overlay" style="display:none;" onclick="smClose(event)">
  <div class="sm-box" onclick="event.stopPropagation()">
    <div class="sm-hdr">
      <div class="sm-player-name" id="sm-player-name"></div>
      <div class="sm-hoyo" id="sm-hoyo">Hoyo 1</div>
      <div class="sm-par" id="sm-par">Par 4</div>
    </div>
    <div class="sm-big" id="sm-big">–</div>
```

Reemplazalo por (agrega una línea nueva, el resto queda igual):

```html
<div id="score-modal" class="sm-overlay" style="display:none;" onclick="smClose(event)">
  <div class="sm-box" onclick="event.stopPropagation()">
    <div class="sm-hdr">
      <div class="sm-player-name" id="sm-player-name"></div>
      <div class="sm-hoyo" id="sm-hoyo">Hoyo 1</div>
      <div class="sm-par" id="sm-par">Par 4</div>
    </div>
    <div id="sm-bonus-banner" class="bonus-banner" style="display:none;"></div>
    <div class="sm-big" id="sm-big">–</div>
```

### Cambio 3 — JS: llenar y mostrar ese cartel nuevo cada vez que se abre la ventana de anotar

Buscá la función `liveOpenScoreModal`:

```js
function liveOpenScoreModal(hoyo, mat){
  if(!LIVE_LINEA_DATA) return;
  LIVE_HOYO = hoyo;
  LIVE_TARGET_MAT = mat;
  MIT_CUR_HOLE = hoyo - 1;
  var jug = LIVE_LINEA_DATA.jugadores.find(function(j){ return j.matricula === mat; });
  var pares = LIVE_LINEA_DATA.pares || [];
  var par = pares[hoyo - 1];
  var currentScore = jug ? jug.scores[hoyo - 1] : null;
  var apodo = jug ? jug.apodo : mat;

  document.getElementById('sm-player-name').textContent = apodo;
  document.getElementById('sm-player-name').style.display = 'block';
  document.getElementById('sm-hoyo').textContent = 'Hoyo ' + hoyo;
  document.getElementById('sm-par').textContent = par ? 'Par ' + par : '';
  document.getElementById('sm-big').textContent = currentScore !== null ? currentScore : '–';
  document.getElementById('sm-keypad-low').style.display = 'grid';
  document.getElementById('sm-keypad-high').style.display = 'none';
  document.getElementById('score-modal').style.display = 'flex';
}
```

Reemplazala por (agrega el bloque del cartel de bonus antes de mostrar la ventana):

```js
function liveOpenScoreModal(hoyo, mat){
  if(!LIVE_LINEA_DATA) return;
  LIVE_HOYO = hoyo;
  LIVE_TARGET_MAT = mat;
  MIT_CUR_HOLE = hoyo - 1;
  var jug = LIVE_LINEA_DATA.jugadores.find(function(j){ return j.matricula === mat; });
  var pares = LIVE_LINEA_DATA.pares || [];
  var par = pares[hoyo - 1];
  var currentScore = jug ? jug.scores[hoyo - 1] : null;
  var apodo = jug ? jug.apodo : mat;

  document.getElementById('sm-player-name').textContent = apodo;
  document.getElementById('sm-player-name').style.display = 'block';
  document.getElementById('sm-hoyo').textContent = 'Hoyo ' + hoyo;
  document.getElementById('sm-par').textContent = par ? 'Par ' + par : '';
  document.getElementById('sm-big').textContent = currentScore !== null ? currentScore : '–';
  document.getElementById('sm-keypad-low').style.display = 'grid';
  document.getElementById('sm-keypad-high').style.display = 'none';

  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var smBanner = document.getElementById('sm-bonus-banner');
  if(smBanner){
    var avisos = [];
    if(bonusHoyos.ba === hoyo) avisos.push('🎯 Best Approach en este hoyo');
    if(bonusHoyos.ld === hoyo) avisos.push('🏌 Long Drive en este hoyo');
    if(avisos.length){
      smBanner.textContent = avisos.join(' · ');
      smBanner.style.display = 'block';
    } else {
      smBanner.style.display = 'none';
    }
  }

  document.getElementById('score-modal').style.display = 'flex';
}
```

### Qué NO cambia

- La pregunta de "¿quién ganó?" que aparece después de cargar el score (`liveBonusModalAbrir`) — sigue igual, sin tocar. Este cambio es un aviso ADICIONAL antes, no reemplaza esa pregunta.
- El cartel de la pantalla de fondo (`#live-bonus-banner` / `liveRenderHoyoActual`) — sigue funcionando igual que antes, solo le agregamos la clase para compartir estilo.
- No hay cambios de backend en esta tarea — es 100% frontend, en `index.html`. Se publica solo en GitHub Pages apenas Code haga el commit.

### ❓ Preguntas de verificación — Tarea 33

1. ¿Ahora, al abrirse la ventana para anotar el score de un jugador en el hoyo del bonus, aparece el cartel dorado adentro de esa misma ventana, antes de tocar cualquier número?
2. ¿En un hoyo que NO es de bonus, la ventana se ve exactamente igual que antes (sin el cartel)?
3. ¿El cartel de la pantalla de fondo (el que ya existía) se sigue viendo igual que antes, con el mismo estilo dorado?
4. Hash y mensaje del commit.
5. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 33

1. **Sí.** `liveOpenScoreModal(hoyo, mat)` ahora, justo antes de hacer `score-modal.style.display = 'flex'`, lee `LIVE_LINEA_DATA.bonusHoyos`, arma el array `avisos`, y si el hoyo actual coincide con `ba` o `ld`, rellena `#sm-bonus-banner` con el texto y lo muestra. El cartel aparece dentro de la caja del modal (`.sm-box`), entre el header y el número grande, antes de que el jugador toque cualquier número del teclado.

2. **Sí.** Cuando `avisos.length === 0` (hoyo sin bonus), `smBanner.style.display = 'none'`. La ventana se ve exactamente igual que antes: `sm-hdr` → `sm-big` → keypad, sin ningún cartel extra.

3. **Sí.** El estilo ahora está definido como clase `.bonus-banner` en vez de `#live-bonus-banner`. El elemento `<div id="live-bonus-banner" class="bonus-banner" ...>` en la pantalla de fondo sigue recibiendo exactamente el mismo estilo — fondo dorado (`var(--gold)`), texto navy, uppercase, etc. — porque la clase se aplica igual. El comportamiento de `liveRenderHoyoActual()` no cambió.

4. **Hash:** `c3becf0` (mismo commit que Tareas 31 y 32)

5. Sin dudas. El CSS de `.bonus-banner` ya tiene `margin-bottom:8px` que da separación natural entre el banner y el `sm-big` (el número grande). No fue necesario ajustar nada de spacing adicional.
