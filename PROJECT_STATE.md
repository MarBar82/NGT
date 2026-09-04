# PROJECT_STATE.md — NGT

**Última actualización:** 2026-09-03 (Tarea 39 agregada — rediseño del aviso de bonus)
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 31 a 34 confirmadas por Code y verificadas contra el repo — coinciden exactamente con lo pedido. Pero Marco seguía sin ver el cartel/color/emoji del bonus, incluso en la compu (no solo el celular) — así que no era caché. Marco dio una pista clave: "elijo la cancha, me carga los hoyos de bonus, los elijo, y después es como que la cancha no queda seleccionada — el usuario va más rápido que la app."

**Encontré la causa real revisando `applyAdminResults_` / `loadAdminData()` en `index.html`.** Es un bug de fondo, no de caché ni de despliegue:

Cuando el admin entra a "Crear Fecha", `loadAdminData()` hace dos cosas: (1) pinta INSTANTÁNEAMENTE los datos guardados de la sesión anterior (cancha, jugadores) para que la pantalla no aparezca vacía, y (2) en paralelo, sin que se note, pide los datos frescos al servidor (jugadores, canchas, fechas, dobles, colores — 5 pedidos juntos). Cuando esos datos frescos llegan (puede tardar unos segundos, más si Apps Script está "frío"), el código **reconstruye desde cero** el desplegable de Cancha y la lista de Jugadores — sin fijarse si el admin ya había elegido algo mientras tanto. Si Marco elige la cancha y los jugadores ANTES de que ese pedido de fondo termine, cuando termina le borra la selección sin avisar — coincide exactamente con lo que describió.

Esto probablemente también explica por qué no veíamos el cartel del bonus: si esto le pasó al crear la fecha de prueba, es muy probable que se haya guardado con datos incompletos o corridos, sin que el error fuera obvio en el momento.

**Fix real, ya no el diagnóstico temporal** — pasa a ser la Tarea 35 (reemplaza a la versión anterior, que era solo un cartelito de diagnóstico y ya no hace falta).

**Antes de que Code haga la Tarea 35, Marco probó de nuevo (con URL fresca, sin caché) y encontró OTRO problema — esta vez cargando scores en vivo, no creando la fecha:** arma la fecha, entra a cargar scores, y a veces (2 de las últimas 3 pruebas) se queda pidiendo el score del último hoyo aunque ya lo cargó, como si no tomara el dato. Es intermitente. Encontré una causa real y coherente con el mismo patrón de fondo (carga de datos en segundo plano pisando datos más nuevos) en `livePoll()` — es la Tarea 36, independiente de la 35, las puede hacer en cualquier orden.

**Después de la 35 y 36, Marco probó de nuevo y reportó DOS cosas: (1) el cartel del bonus sigue sin aparecer, y (2) un bug nuevo, ahora 100% reproducible: borró la fecha de prueba, la volvió a crear, y al cargar los scores del hoyo 1 se quedó pidiendo el score del 4to jugador para siempre — en el celular y en la computadora por igual.** Investigué a fondo el backend de la carga en vivo (`07_LiveScoring.gs`) y encontré la causa real, que probablemente explica AMBOS problemas a la vez — ver Tarea 37 más abajo.

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

---

## 🎯 Tarea para Claude Code — Tarea 34 (refuerzo visual del aviso de bonus: encabezado dorado + emojis)

### Contexto — no es un bug de código, es un refuerzo pedido por Marco

Marco probó la Tarea 33 (el cartel dorado dentro de la ventana de anotar score) y no lo vio. Antes de tocar nada, verifiqué el sitio publicado directamente y confirmé que la Tarea 33 sí está desplegada correctamente — el código está bien y en producción. Lo más probable es que el navegador de Marco haya mostrado una copia vieja de la página guardada en caché (algo común en celulares, no un bug real).

**Dile a Marco que antes de probar esta tarea haga un refresh forzado o cierre y vuelva a abrir la app desde cero**, para asegurarnos de que esta vez ve la versión más nueva.

Aun así, Marco pidió dos refuerzos adicionales: que además del cartel, el encabezado de la ventana (donde dice "Hoyo X") cambie de color en el hoyo del bonus, y que se le sume el emoji correspondiente — 🎯 (diana) para Best Approach, 💪 (fuerza) para Long Drive — directamente al lado de "Hoyo X". Tiene sentido — un cambio de color en el encabezado (lo primero que se lee al abrir la ventana) más el emoji es un refuerzo mucho más fuerte que el cartel solo, sobre todo afuera en la cancha con sol. Hacemos todo junto.

De paso, aprovechamos para unificar: el cartel de Long Drive (tanto el de esta ventana como el de la pantalla de fondo) hoy usa el emoji de golfista 🏌 — lo cambiamos a 💪 para que sea el mismo emoji en todos lados (coincide con el que ya usás en el checkbox de "Mi Tarjeta": "💪 Gané el Long Drive").

### Cambio 1 — CSS: agregar el estilo del encabezado en modo bonus

Buscá:

```css
.sm-par{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--gold);text-transform:uppercase;margin-top:2px;}
```

Agregá estas dos líneas justo después (sin tocar la línea de arriba):

```css
.sm-hdr.bonus{background:var(--gold);color:var(--navy);border-bottom-color:var(--navy);}
.sm-hdr.bonus .sm-par{color:var(--navy);}
```

### Cambio 2 — HTML: agregarle un `id` al encabezado para poder engancharle la clase desde JS

Buscá (dentro del modal de anotar score):

```html
    <div class="sm-hdr">
      <div class="sm-player-name" id="sm-player-name"></div>
      <div class="sm-hoyo" id="sm-hoyo">Hoyo 1</div>
      <div class="sm-par" id="sm-par">Par 4</div>
    </div>
    <div id="sm-bonus-banner" class="bonus-banner" style="display:none;"></div>
```

Reemplazalo por (la única diferencia es el `id="sm-hdr"` agregado):

```html
    <div class="sm-hdr" id="sm-hdr">
      <div class="sm-player-name" id="sm-player-name"></div>
      <div class="sm-hoyo" id="sm-hoyo">Hoyo 1</div>
      <div class="sm-par" id="sm-par">Par 4</div>
    </div>
    <div id="sm-bonus-banner" class="bonus-banner" style="display:none;"></div>
```

### Cambio 3 — JS: prender/apagar la clase `bonus` del encabezado, agregar el emoji a "Hoyo X", y sumar el cartel

Buscá dentro de `liveOpenScoreModal`:

```js
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
```

Reemplazalo por (agrega el toggle del encabezado, el emoji al lado de "Hoyo X", y cambia el emoji de Long Drive de 🏌 a 💪):

```js
  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var smBanner = document.getElementById('sm-bonus-banner');
  var smHdr = document.getElementById('sm-hdr');
  var avisos = [];
  var hoyoEmoji = '';
  if(bonusHoyos.ba === hoyo){ avisos.push('🎯 Best Approach en este hoyo'); hoyoEmoji += '🎯 '; }
  if(bonusHoyos.ld === hoyo){ avisos.push('💪 Long Drive en este hoyo'); hoyoEmoji += '💪 '; }
  document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;
  if(smBanner){
    if(avisos.length){
      smBanner.textContent = avisos.join(' · ');
      smBanner.style.display = 'block';
    } else {
      smBanner.style.display = 'none';
    }
  }
  if(smHdr){ smHdr.classList.toggle('bonus', avisos.length > 0); }
```

(La línea `document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;` pisa a propósito el valor que ya se había puesto más arriba en la función — `document.getElementById('sm-hoyo').textContent = 'Hoyo ' + hoyo;` —, no hace falta tocar esa línea de arriba, solo dejar que esta la sobreescriba.)

### Cambio 4 — JS: mismo emoji de Long Drive en el cartel de la pantalla de fondo

Para que sea el mismo emoji en todos lados, buscá en `liveRenderHoyoActual()`:

```js
    if(bonusHoyos.ba === LIVE_HOYO) avisos.push('🎯 Best Approach en este hoyo');
    if(bonusHoyos.ld === LIVE_HOYO) avisos.push('🏌 Long Drive en este hoyo');
```

Reemplazalo por:

```js
    if(bonusHoyos.ba === LIVE_HOYO) avisos.push('🎯 Best Approach en este hoyo');
    if(bonusHoyos.ld === LIVE_HOYO) avisos.push('💪 Long Drive en este hoyo');
```

### Qué NO cambia

- El cartel dorado (`#sm-bonus-banner`) de la Tarea 33 — sigue igual, solo le agregamos el encabezado y el emoji como refuerzo extra.
- El texto "Best Approach en este hoyo" / "Long Drive en este hoyo" del cartel — sin cambios, solo el emoji de Long Drive.
- No hay cambios de backend — 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 34

1. ¿En el hoyo del bonus, el encabezado de la ventana ahora se ve con fondo dorado, letras azul marino, y el emoji correspondiente (🎯 o 💪) al lado de "Hoyo X", además del cartel de abajo?
2. ¿En un hoyo que NO es de bonus, el encabezado se ve igual que siempre (azul marino con letras blancas, sin emoji, "Hoyo X" solo)?
3. ¿El nombre del jugador arriba del todo (el rectángulo navy con el apodo) se sigue viendo igual, sin verse afectado por el cambio de color del encabezado?
4. ¿El cartel de la pantalla de fondo (`#live-bonus-banner`) también muestra ahora 💪 para Long Drive en vez de 🏌?
5. Hash y mensaje del commit.
6. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 34

1. **Sí.** En `liveOpenScoreModal`, cuando el hoyo es de bonus: `hoyoEmoji` se arma con `'🎯 '` y/o `'💪 '`, y se asigna `sm-hoyo.textContent = hoyoEmoji + 'Hoyo ' + hoyo` (por ejemplo `'🎯 Hoyo 3'`). Luego `smHdr.classList.toggle('bonus', true)` agrega la clase `.bonus` al div `#sm-hdr`, que por CSS recibe `background:var(--gold); color:var(--navy); border-bottom-color:var(--navy)`. El cartel dorado (`#sm-bonus-banner`) también se muestra debajo del header.

2. **Sí.** Cuando el hoyo no es de bonus, `avisos` queda vacío: `hoyoEmoji` es `''`, `sm-hoyo` dice solo `'Hoyo X'`, y `classList.toggle('bonus', false)` remueve (o nunca agrega) la clase. El header queda con su CSS original: `background:var(--navy); color:#fff; border-bottom:3px solid var(--red)`. El cartel se oculta. Idéntico a antes.

3. **Sí.** `sm-player-name` es un elemento hijo dentro de `sm-hdr`, pero tiene su propio estilo definido por `.sm-player-name` (fondo y color propios, no hereda el del padre cuando tiene estilos explícitos). La clase `.bonus` solo cambia el fondo y color del `sm-hdr` como bloque — los hijos con estilos propios no se ven afectados porque sus reglas tienen mayor especificidad. El apodo del jugador se sigue viendo igual.

4. **Sí.** En `liveRenderHoyoActual()`, la línea:
   ```js
   if(bonusHoyos.ld === LIVE_HOYO) avisos.push('🏌 Long Drive en este hoyo');
   ```
   fue reemplazada por:
   ```js
   if(bonusHoyos.ld === LIVE_HOYO) avisos.push('💪 Long Drive en este hoyo');
   ```
   El cartel de la pantalla de fondo ahora usa 💪 en todos lados.

5. **Hash:** `111b607` — "Tarea 34: encabezado dorado y emoji en modal de score para hoyo de bonus"

6. Sin dudas. Nota técnica: la línea `document.getElementById('sm-hoyo').textContent = 'Hoyo ' + hoyo;` que ya existía antes en la función queda sin tocar — la línea nueva `document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;` la sobreescribe inmediatamente después, como indica la consigna.

---

## 🎯 Tarea para Claude Code — Tarea 35 (bug real: se pierde la selección de Cancha/Jugadores al crear una fecha)

### Qué reportó Marco y la causa real

Marco reportó: "elijo la cancha, me carga los hoyos de bonus, los elijo, y después es como que la cancha no queda seleccionada — el usuario va más rápido que la app."

Es exactamente eso. `loadAdminData()` (en `index.html`) pinta primero los datos guardados de la sesión anterior para que la pantalla de "Crear Fecha" no aparezca vacía, y en paralelo pide los datos frescos al servidor (jugadores, canchas, fechas, dobles, colores). Cuando esos datos frescos llegan — puede tardar unos segundos —, `applyAdminResults_()` **reconstruye desde cero** el desplegable de Cancha y la lista de Jugadores tildados, sin fijarse si el admin ya eligió algo mientras tanto. Si heurísticamente Marco completa el Paso 1 antes de que ese pedido de fondo termine, cuando termina le borra la cancha (y podría borrarle jugadores ya tildados) sin ningún aviso.

**Fix: antes de reconstruir esos campos, guardar lo que el admin ya tenía elegido, y volver a aplicarlo después de reconstruir.**

### Cambio — JS: preservar selección de Cancha, Cancha (editar) y Jugadores en `applyAdminResults_`

Buscá esta función completa en `index.html`:

```js
function applyAdminResults_(jugadores, canchas, fechas, doblesDisponibles){
    ADM_JUGADORES = jugadores;
    ADM_CANCHAS = canchas;

    // Save available dobles globally for access when editing
    window.ADM_DOBLES_DISP = doblesDisponibles;

    // Cancha select (crear)
    const cs = document.getElementById('adm-cancha');
    if(cs){
      cs.innerHTML = '<option value="">Seleccionar cancha...</option>';
      ADM_CANCHAS.forEach(c => {
        cs.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
    }

    // Cancha select (editar)
    const csE = document.getElementById('adm-edit-cancha');
    if(csE){
      csE.innerHTML = '<option value="">Seleccionar...</option>';
      ADM_CANCHAS.forEach(c => {
        csE.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
    }

    // Jugadores checkboxes — ALL players available to select for the fecha
    const jl = document.getElementById('adm-jugadores-list');
    if(jl){
      let jugHtml = '';
      ADM_JUGADORES.forEach(j => {
        const lbl = formatPlayerLabel(j.nombre);
        jugHtml += '<div class="adm-jug-item"><input type="checkbox" id="jug-' + j.matricula + '" value="' + j.matricula + '"><label for="jug-' + j.matricula + '">' + lbl + '</label></div>';
      });
      jl.innerHTML = jugHtml;
    }
```

Reemplazala por (mismo comportamiento, pero guardando y restaurando lo que el admin ya había elegido):

```js
function applyAdminResults_(jugadores, canchas, fechas, doblesDisponibles){
    ADM_JUGADORES = jugadores;
    ADM_CANCHAS = canchas;

    // Save available dobles globally for access when editing
    window.ADM_DOBLES_DISP = doblesDisponibles;

    // Cancha select (crear) — preserva la selección actual del admin (si ya eligió algo),
    // porque este refresh puede llegar en segundo plano mientras el admin ya está
    // completando el formulario con los datos que se pintaron desde la caché.
    const cs = document.getElementById('adm-cancha');
    if(cs){
      const prevCs = cs.value;
      cs.innerHTML = '<option value="">Seleccionar cancha...</option>';
      ADM_CANCHAS.forEach(c => {
        cs.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
      if(prevCs) cs.value = prevCs;
    }

    // Cancha select (editar) — mismo cuidado
    const csE = document.getElementById('adm-edit-cancha');
    if(csE){
      const prevCsE = csE.value;
      csE.innerHTML = '<option value="">Seleccionar...</option>';
      ADM_CANCHAS.forEach(c => {
        csE.innerHTML += '<option value="' + c.id + '">' + c.nombre + '</option>';
      });
      if(prevCsE) csE.value = prevCsE;
    }

    // Jugadores checkboxes — ALL players available to select for the fecha.
    // Preserva cuáles estaban tildados antes de reconstruir la lista, por el mismo motivo.
    const jl = document.getElementById('adm-jugadores-list');
    if(jl){
      const prevChecked = new Set([...jl.querySelectorAll('input:checked')].map(i => i.value));
      let jugHtml = '';
      ADM_JUGADORES.forEach(j => {
        const lbl = formatPlayerLabel(j.nombre);
        jugHtml += '<div class="adm-jug-item"><input type="checkbox" id="jug-' + j.matricula + '" value="' + j.matricula + '"><label for="jug-' + j.matricula + '">' + lbl + '</label></div>';
      });
      jl.innerHTML = jugHtml;
      prevChecked.forEach(mat => {
        const el = document.getElementById('jug-' + mat);
        if(el) el.checked = true;
      });
    }
```

(El resto de la función — el bloque de checkboxes de Dobles que viene después — queda exactamente igual, no lo toques.)

### Qué NO cambia

- El resto de `applyAdminResults_` (Dobles) — sin tocar.
- No hay cambios de backend — 100% frontend, se publica solo en GitHub Pages.
- El cartelito de diagnóstico del bonus que habíamos planeado (Tarea 35 anterior) — ya no hace falta, no lo agregues. Si después de este fix el cartel del bonus sigue sin aparecer en una fecha creada de cero, avisame y lo retomamos.

### ❓ Preguntas de verificación — Tarea 35

1. ¿Encontraste `applyAdminResults_` y la reemplazaste completa como se indica?
2. Probá mentalmente: admin entra a "Crear Fecha", elige cancha y jugadores MUY rápido (antes de que termine de cargar todo en segundo plano) — cuando esa carga de fondo termina, ¿la cancha elegida y los jugadores tildados se mantienen, en vez de volver a "Seleccionar cancha..." y sin nadie tildado?
3. Caso normal (sin apuro): ¿todo sigue funcionando exactamente igual que antes?
4. Hash y mensaje del commit.
5. ¿Alguna duda o algo ambiguo de la consigna?

### 📋 Para Marco — después de este fix

Probá de nuevo el flujo completo de "Crear Fecha" (cancha, hoyos de bonus, jugadores, armar líneas, comenzar partida) con una fecha NUEVA. Si llega a andar bien de punta a punta, probá también si ahora sí ves el cartel/color/emoji del bonus al cargar el score de ese hoyo — es muy probable que ese problema se resuelva solo, porque puede que la fecha vieja que usabas para probar se haya guardado con datos incompletos por este mismo bug.

---

## 🎯 Tarea para Claude Code — Tarea 36 (bug real, intermitente: se queda pidiendo el score del último hoyo)

### Qué reportó Marco y la causa real

Marco: "armo la fecha, entro a cargar los scores y se me queda en el hoyo 1, cargo todos los scores y me sigue pidiendo el del último, como que no se cargan los datos, y se queda ahí pidiendo los scores y no los toma. No me pasa siempre, de las últimas 3 pruebas me pasó 2 veces."

Es el mismo tipo de bug que la Tarea 35 (datos en segundo plano pisando datos más nuevos), pero en otro lugar: la pantalla de "cargar scores en vivo" (`livePoll()` en `index.html`).

Esta pantalla pide los datos frescos al servidor cada 8 segundos en segundo plano (para que si otro jugador de tu línea carga un score, vos lo veas actualizado sin hacer nada). El código YA tiene una protección (`LIVE_LOCAL_SEQ`) para que ese refresco de fondo no te pise un score que vos acabás de cargar — pero le falta una segunda protección: si ese pedido de fondo tarda más de 8 segundos en responder (pasa seguido si Apps Script está "frío"), se puede disparar OTRO pedido de fondo antes de que el primero termine. Si el primero (más viejo) responde DESPUÉS que el segundo (más nuevo) — cosa común con la red del celular en la cancha —, sus datos viejos pisan a los nuevos, y ahí es donde un hoyo que ya estaba cargado vuelve a aparecer como sin cargar. Como pasa cerca del final de la ronda (cuando ya hubo más tiempo para que se acumulen pedidos de fondo), coincide con "se queda pidiendo el del último hoyo". Y como depende de la velocidad de la red en el momento, es lógico que sea intermitente.

**Fix: que cada pedido de fondo sepa "soy el más nuevo o no", y que solo se le permita actualizar la pantalla al que realmente sea el más nuevo — no al que responda último.**

### Cambio 1 — JS: agregar un contador de pedidos de fondo

Buscá esta línea (junto a las otras variables de estado de "Live Scoring"):

```js
let LIVE_LOCAL_SEQ = 0;   // increments on every local write; poll ignores stale responses
```

Agregá esta línea justo después (sin tocar la de arriba):

```js
let LIVE_POLL_SEQ = 0;    // increments on every background poll; a poll only applies its response if it's still the most recent one issued
```

### Cambio 2 — JS: usar ese contador en `livePoll()` para descartar respuestas viejas que llegan tarde

Buscá la función `livePoll()` completa:

```js
function livePoll(){
  if(!MIT_PLAYER || !MIT_FECHA || !LIVE_MODE) return;
  var seqAtPollTime = LIVE_LOCAL_SEQ;
  ngtApiGet('getLineaLive', { fecha: MIT_FECHA, matricula: MIT_PLAYER.matricula })
    .then(function(r){
      const offEl = document.getElementById('live-offline-msg');
      if(r && r.ok){
        if(!LIVE_LINEA_DATA) liveInitHoyo(r);
        // Only overwrite local data if no local write happened while this poll was in flight
        if(LIVE_LOCAL_SEQ === seqAtPollTime) LIVE_LINEA_DATA = r;
        document.getElementById('live-loading').style.display = 'none';
        document.getElementById('live-content').style.display = 'block';
        if(offEl) offEl.style.display = 'none';
        liveRender();
        const allComplete = r.jugadores.every(function(j){ return j.holesCargados === 18; });
        if(allComplete) livePollStop();
      } else {
```

Reemplazá desde el inicio de la función hasta esa misma altura (el resto de la función, el `else` con el manejo de error y el `.catch()` de más abajo, queda igual — no lo toques):

```js
function livePoll(){
  if(!MIT_PLAYER || !MIT_FECHA || !LIVE_MODE) return;
  var seqAtPollTime = LIVE_LOCAL_SEQ;
  var myPollId = ++LIVE_POLL_SEQ; // identifica a este pedido de fondo en particular
  ngtApiGet('getLineaLive', { fecha: MIT_FECHA, matricula: MIT_PLAYER.matricula })
    .then(function(r){
      const offEl = document.getElementById('live-offline-msg');
      if(r && r.ok){
        // Esta respuesta solo es válida si: (a) no hubo una carga local de score mientras
        // viajaba, Y (b) no se disparó un pedido de fondo más nuevo que este — evita que una
        // respuesta vieja que tarda más en llegar pise datos más frescos que ya llegaron.
        var esRespuestaVigente = (LIVE_LOCAL_SEQ === seqAtPollTime) && (myPollId === LIVE_POLL_SEQ);
        if(!LIVE_LINEA_DATA) liveInitHoyo(r);
        if(esRespuestaVigente) LIVE_LINEA_DATA = r;
        document.getElementById('live-loading').style.display = 'none';
        document.getElementById('live-content').style.display = 'block';
        if(offEl) offEl.style.display = 'none';
        liveRender();
        if(esRespuestaVigente){
          const allComplete = r.jugadores.every(function(j){ return j.holesCargados === 18; });
          if(allComplete) livePollStop();
        }
      } else {
```

### Qué NO cambia

- El resto de `livePoll()` (manejo de error/offline, `.catch()`) — sin tocar.
- La protección que ya existía contra pisar una carga local reciente (`LIVE_LOCAL_SEQ`) — sigue ahí, se suma a la nueva, no se reemplaza.
- No hay cambios de backend — 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 36

1. ¿Agregaste `LIVE_POLL_SEQ` y lo usás en `livePoll()` como se indica?
2. Probá mentalmente: dos pedidos de fondo se superponen (el primero tarda más de 8 segundos), y el más viejo responde DESPUÉS que el más nuevo — ¿la respuesta vieja queda descartada (no pisa la pantalla ni para los datos ni para el chequeo de "ronda completa")?
3. Caso normal (red rápida, sin superposición): ¿todo sigue funcionando exactamente igual que antes?
4. Hash y mensaje del commit.
5. ¿Alguna duda o algo ambiguo de la consigna?

### 📋 Para Marco — después de este fix

Esto es harder de reprobar a propósito porque depende de la velocidad de la red en el momento — no hay una forma 100% segura de "forzarlo" para confirmar. Lo mejor es simplemente seguir usando la carga de scores en vivo unas cuantas veces más (sobre todo con mala señal, que es cuando más chances tiene de pasar) y avisarme si se te vuelve a quedar pidiendo un hoyo que ya cargaste.

---

## 🎯 Tarea para Claude Code — Tarea 37 (bug real: al borrar y recrear una fecha, la carga de scores en vivo "recuerda" filas viejas — probablemente la misma causa del cartel de bonus que nunca aparece)

### El problema, explicado simple

Cuando cargás un score en vivo, la app no busca la fila del jugador en la hoja TARJETAS cada vez (sería lento) — la primera vez la busca y después la "recuerda" en una memoria temporal (caché) durante hasta 6 horas, para ir más rápido las próximas veces.

El problema es este: cuando **borrás una fecha**, esa "fila recordada" de cada jugador NO se olvida. Y cuando volvés a crear la fecha (con la misma fecha de calendario, como hacés vos al probar), las tarjetas nuevas se crean en **filas distintas** a las de la fecha borrada. Resultado: la app sigue usando la fila VIEJA que tenía recordada — que ahora es la fila equivocada — en vez de la fila nueva y correcta.

Esto explica el "se queda pidiendo el score del 4to jugador": la pantalla avisa el próximo hoyo de forma instantánea para los primeros 3 jugadores (no espera confirmación del servidor, por velocidad), pero el ÚLTIMO jugador de cada hoyo sí necesita la confirmación real del servidor para poder avanzar. Si esa confirmación viene con datos de la fila equivocada (por la memoria vieja), la pantalla nunca la da por buena y se queda esperando ese jugador para siempre — pasa igual en el celular y en la compu porque el problema está en el servidor, no en el aparato.

**Es muy probable que esta misma causa explique por qué nunca viste el cartel del bonus**: para avisar el bonus, el servidor necesita confirmar que los 4 jugadores de la línea ya tienen score en ese hoyo — pero si está leyendo la fila equivocada de alguno de ellos por la memoria vieja, nunca da esa confirmación, y el cartel nunca se dispara. No es un problema del diseño del cartel (ya lo revisamos línea por línea y está bien hecho y bien publicado) — es que el servidor nunca le avisa al navegador que hay que mostrarlo.

**El fix:** cuando se borra una fecha, hay que borrar también esa "memoria de filas" de cada jugador de esa fecha (y no solo la memoria general, que ya se limpiaba desde la Tarea 32). Así, al recrear la fecha, la próxima carga de scores busca la fila de nuevo desde cero — la correcta.

⚠️ **Este cambio es en un archivo `.gs` (backend) — después de que Code lo suba a GitHub, tenés que ir vos a Extensiones → Apps Script en Google Sheets, y hacer Deploy → Manage deployments → Edit → New version → Deploy, para que el cambio quede activo.** No alcanza con el push a GitHub.

📌 **Importante para probar después:** el fix solo limpia la memoria de las fechas que se borren DESPUÉS de instalarlo. Para probar, primero desplegá el cambio en Apps Script, y RECIÉN DESPUÉS borrá la fecha de prueba actual y volvé a crearla — así el borrado (ya con el fix puesto) limpia bien la memoria vieja que pueda haber quedado de las pruebas anteriores.

### Dónde está el código

Archivo `04_Writes.gs`, función `eliminarFecha_(params)`.

### Cambio 1 — capturar las matrículas de la fecha ANTES de borrar sus filas de TARJETAS

Buscá esta línea:

```js
  // ── 3. TARJETAS — eliminar filas ─────────────────────────────────────────
  changes.tarjetas = deleteRowsForFecha(getSheet_(SHEETS.TARJETAS), 1); // col A = fecha
```

Reemplazala por:

```js
  // ── 3. TARJETAS — capturar matrículas ANTES de borrar (para limpiar su caché de fila) ──
  const tarjSh_ = getSheet_(SHEETS.TARJETAS);
  let matriculasDeLaFecha_ = [];
  if (tarjSh_) {
    const lastT_ = tarjSh_.getLastRow();
    if (lastT_ >= 2) {
      const abT_ = tarjSh_.getRange(2, 1, lastT_ - 1, 2).getValues();
      matriculasDeLaFecha_ = abT_
        .filter(function(r){ return String(r[0]).trim() === fStr; })
        .map(function(r){ return String(r[1]).trim(); });
    }
  }

  // ── 3b. TARJETAS — eliminar filas ─────────────────────────────────────────
  changes.tarjetas = deleteRowsForFecha(tarjSh_, 1); // col A = fecha
```

### Cambio 2 — limpiar la caché de fila de cada jugador al borrar la fecha

Buscá esta línea (más abajo, cerca del final de la función, donde ya se limpia la caché general):

```js
  try { CacheService.getScriptCache().removeAll(['fechas','fechasConEstado','fechaActiva','fl_' + String(fecha)]); } catch(e) {}
```

Reemplazala por:

```js
  try {
    const cache_ = CacheService.getScriptCache();
    const keysABorrar_ = ['fechas','fechasConEstado','fechaActiva','fl_' + String(fecha)];
    // Limpiar también la "fila recordada" y el "último que cargó" de cada jugador de esta
    // fecha — si no se borran, quedan apuntando a filas viejas (hasta 6hs) y al recrear la
    // fecha (con filas nuevas en otra posición), la app lee/escribe la fila equivocada.
    matriculasDeLaFecha_.forEach(function(m){
      keysABorrar_.push('tRow_' + fStr + '_' + m);
      keysABorrar_.push('lastCarg_' + fStr + '_' + m);
    });
    cache_.removeAll(keysABorrar_);
  } catch(e) {}
```

### Qué NO cambia

- El resto de `eliminarFecha_()` (borrado de STB, PB, MATCH, SCORE, FECHA_META) — sin tocar.
- No hay cambios de frontend — 100% backend (`04_Writes.gs`), requiere el deploy manual en Apps Script explicado arriba.
- `fStr` ya existe al principio de la función (`const fStr = String(fecha);`) — no hace falta declararlo de nuevo, ya está disponible para usar en el Cambio 2.

### ❓ Preguntas de verificación — Tarea 37

1. ¿Capturaste `matriculasDeLaFecha_` ANTES de borrar las filas de TARJETAS (para tener las matrículas correctas, antes de que desaparezcan)?
2. ¿El `removeAll` al final ahora incluye, además de las 4 claves generales de siempre, dos claves por cada jugador de la fecha (`tRow_...` y `lastCarg_...`)?
3. Si la fecha no tenía ninguna tarjeta cargada todavía (recién creada, sin scores), ¿el código sigue funcionando sin errores (¿`matriculasDeLaFecha_` queda como array vacío y no rompe nada)?
4. Hash y mensaje del commit.
5. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 37

1. **Sí.** El Cambio 1 captura las matrículas ANTES de llamar a `deleteRowsForFecha`. Primero obtiene la hoja TARJETAS con `getSheet_(SHEETS.TARJETAS)`, lee las columnas A y B de todas las filas, filtra las que coincidan con `fStr` (la fecha a borrar), y extrae las matrículas de la columna B — todo eso en `matriculasDeLaFecha_`. Recién después (Cambio 1b) llama a `deleteRowsForFecha(tarjSh_, 1)` que borra esas filas. El orden garantiza que las matrículas se capturan cuando las filas todavía existen.

2. **Sí.** El `removeAll` ahora arma el array `keysABorrar_` con las 4 claves generales de siempre (`'fechas'`, `'fechasConEstado'`, `'fechaActiva'`, `'fl_' + String(fecha)`), y luego itera `matriculasDeLaFecha_` para agregar `'tRow_' + fStr + '_' + m` y `'lastCarg_' + fStr + '_' + m` por cada jugador. Finalmente pasa el array completo a `cache_.removeAll(keysABorrar_)`.

3. **Sí.** Si la fecha no tiene ninguna tarjeta cargada: `abT_` sería un array de filas que no incluye ninguna con `String(r[0]).trim() === fStr`, por lo que `matriculasDeLaFecha_` queda como `[]`. También hay un guard: si `lastT_ < 2` (hoja vacía o solo encabezado), el bloque `if(lastT_ >= 2)` no entra y `matriculasDeLaFecha_` queda como `[]` inicializado arriba. En el `forEach` de `[]`, no se itera nada — `keysABorrar_` queda con solo las 4 claves generales. El `removeAll` funciona igual que antes. Sin errores.

4. **Hash:** `c58f04f` — "Tarea 37: limpiar cache de filas de tarjetas al eliminar fecha"

5. Sin dudas. Nota: `fStr` ya existía al principio de `eliminarFecha_` (`const fStr = String(fecha);`), tal como se aclaró en la consigna — no fue necesario redeclararlo.

### 📋 Para Marco — después de este fix

Este cambio es en un archivo `.gs`, así que **no alcanza con que Code lo suba a GitHub** — vos tenés que entrar a Apps Script (Extensiones → Apps Script desde el Google Sheet) y hacer un nuevo Deploy para que quede activo.

Una vez desplegado, probá así (en ese orden, para que la prueba sea limpia):
1. Borrá la fecha de prueba que tenías con el problema.
2. Volvé a crearla.
3. Cargá los scores del hoyo 1 con los 4 jugadores — fijate si ahora avanza bien después del 4to jugador.
4. Seguí jugando hasta llegar al hoyo de bonus — fijate si ahora sí aparece el cartel dorado.

---

## 📣 Resultado de la Tarea 37 — Marco probó y hay buenas y malas noticias

**Buena noticia — el bug principal (quedarse pidiendo el score del último jugador) parece resuelto:** todos los hoyos cargaron bien, incluso hoyos con bonus preguntaron correctamente "¿quién lo ganó?" al completarse — eso NUNCA había pasado antes de la Tarea 37, es una señal fuerte de que la causa raíz (la "memoria de filas" vieja) era real y el fix funciona. También confirma algo importante: el servidor SÍ está detectando bien qué hoyo es bonus — antes pensábamos que era un problema de diseño del cartel, pero en realidad el servidor nunca avisaba nada porque estaba leyendo la fila equivocada. Ahora si avisa (al menos la pregunta de "quién ganó" después de cargar el hoyo).

**Pero quedan 3 cosas nuevas para investigar:**

1. **El cartel dorado (el aviso ANTES de cargar el score, con cambio de color del encabezado) sigue sin aparecer** — a pesar de que la pregunta de "quién ganó" (que se dispara DESPUÉS, cuando ya cargaste el score de los 4) sí funciona ahora. Son dos avisos distintos en dos momentos distintos, y until ahora solo el segundo funciona. Repasé el código de nuevo línea por línea y no encuentro el error mirándolo — así que esta vez, en lugar de adivinar un cuarto arreglo a ciegas, prefiero agregar un dato de diagnóstico visible en pantalla para ver los valores reales en el momento exacto que falla. Es la Tarea 38 (ver abajo).

2. **Al cargar el hoyo 1, apareció "Sin conexión · reintentando..." y tardó varios segundos en cargar.** Esto es muy probablemente normal: es la primera carga después de que vos hiciste un Deploy nuevo en Apps Script, y la primera vez que Apps Script atiende un pedido después de un deploy nuevo suele tardar bastante más (tiene que "arrancar en frío"). Si te vuelve a pasar en pruebas MÁS ADELANTE (no la primera vez después de un deploy), avisame porque ahí sí sería otra cosa.

3. **Al hoyo 4, volvió a preguntar "quién ganó" el bonus del hoyo 3, que ya habías respondido.** Sospecho que está relacionado con el punto 2 (la app reintenta un pedido que en realidad ya se había guardado bien del lado del servidor, y al reintentar vuelve a preguntar). Si el punto 2 no se repite en pruebas futuras, es muy probable que este tampoco. Lo dejo anotado para seguir de cerca — si vuelve a pasar SIN el "sin conexión, reintentando" de por medio, avisame porque ahí sería un bug distinto y lo investigo a fondo.

---

## 🎯 Tarea para Claude Code — Tarea 38 (diagnóstico temporal: ver por qué no aparece el cartel de bonus)

### Qué es esto

Esto NO es un arreglo — es un cartelito de diagnóstico temporal, como el que usamos en un problema anterior de este mismo proyecto. Vamos a hacer que el cartel de bonus, en vez de aparecer solo cuando corresponde, aparezca SIEMPRE (en todos los hoyos) mostrando los datos internos que la app está comparando para decidir si hay que avisar. Así, cuando Marco llegue al hoyo con bonus, va a poder LEER en pantalla (celular o compu, sin herramientas técnicas) qué valores está viendo la app en ese momento — y con eso vamos a poder identificar el problema exacto en vez de seguir adivinando.

**Después de que Marco me pase esos valores, vamos a sacar este diagnóstico y dejar el cartel andando bien (Tarea 39, con el arreglo real).**

### Dónde está el código

Archivo `index.html`, función `liveOpenScoreModal(hoyo, mat)`.

### Cambio — mostrar SIEMPRE el cartel con los valores reales (temporal)

Buscá este bloque (ya existente):

```js
  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var smBanner = document.getElementById('sm-bonus-banner');
  var smHdr = document.getElementById('sm-hdr');
  var avisos = [];
  var hoyoEmoji = '';
  if(bonusHoyos.ba === hoyo){ avisos.push('🎯 Best Approach en este hoyo'); hoyoEmoji += '🎯 '; }
  if(bonusHoyos.ld === hoyo){ avisos.push('💪 Long Drive en este hoyo'); hoyoEmoji += '💪 '; }
  document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;
  if(smBanner){
    if(avisos.length){
      smBanner.textContent = avisos.join(' · ');
      smBanner.style.display = 'block';
    } else {
      smBanner.style.display = 'none';
    }
  }
  if(smHdr){ smHdr.classList.toggle('bonus', avisos.length > 0); }
```

Reemplazalo por:

```js
  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var smBanner = document.getElementById('sm-bonus-banner');
  var smHdr = document.getElementById('sm-hdr');
  var avisos = [];
  var hoyoEmoji = '';
  if(bonusHoyos.ba === hoyo){ avisos.push('🎯 Best Approach en este hoyo'); hoyoEmoji += '🎯 '; }
  if(bonusHoyos.ld === hoyo){ avisos.push('💪 Long Drive en este hoyo'); hoyoEmoji += '💪 '; }
  document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;
  // ⚠️ TEMPORAL — Tarea 38: diagnóstico visible, sacar en la Tarea 39
  var debugTxt_ = 'DEBUG · hoyo=' + JSON.stringify(hoyo) + ' · ba=' + JSON.stringify(bonusHoyos.ba) +
                  ' · ld=' + JSON.stringify(bonusHoyos.ld) + ' · match=' + avisos.length;
  if(smBanner){
    if(avisos.length){
      smBanner.textContent = avisos.join(' · ') + '  [' + debugTxt_ + ']';
    } else {
      smBanner.textContent = debugTxt_;
    }
    smBanner.style.display = 'block'; // TEMPORAL: siempre visible mientras diagnosticamos
  }
  if(smHdr){ smHdr.classList.toggle('bonus', avisos.length > 0); }
```

### Qué NO cambia

- No se toca nada más de la función ni de ningún otro archivo.
- Es 100% frontend, se publica solo en GitHub Pages (no requiere deploy de Apps Script).
- Es temporal — lo vamos a sacar en la próxima tarea una vez que tengamos el diagnóstico.

### ❓ Preguntas de verificación — Tarea 38

1. ¿El cartel `#sm-bonus-banner` ahora se muestra SIEMPRE (en todos los hoyos, no solo en los de bonus)?
2. ¿El texto muestra el valor de `hoyo`, `bonusHoyos.ba`, `bonusHoyos.ld` y cuántos avisos coincidieron (`match`)?
3. Hash y mensaje del commit.
4. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 38

1. **Sí.** La línea `smBanner.style.display = 'block';` ahora está fuera del `if(avisos.length)` — se ejecuta siempre que `smBanner` exista, sin importar si hay avisos o no. En hoyos sin bonus: `debugTxt_` se asigna como texto del banner y se muestra. En hoyos con bonus: el texto del aviso se muestra con el debug entre corchetes al final, y también se muestra.

2. **Sí.** `debugTxt_` se arma como: `'DEBUG · hoyo=' + JSON.stringify(hoyo) + ' · ba=' + JSON.stringify(bonusHoyos.ba) + ' · ld=' + JSON.stringify(bonusHoyos.ld) + ' · match=' + avisos.length`. Ejemplo en hoyo 2 sin bonus: `DEBUG · hoyo=2 · ba=null · ld=8 · match=0`. Ejemplo en hoyo 8 con LD: `💪 Long Drive en este hoyo  [DEBUG · hoyo=8 · ba=null · ld=8 · match=1]`. El `JSON.stringify` muestra `null` cuando el campo no está definido, lo que ayuda a ver si `bonusHoyos` llegó vacío.

3. **Hash:** `3a1980f` — "Tarea 38: diagnostico temporal en modal de score para ver valores de bonusHoyos"

4. Sin dudas. El cartel `#sm-bonus-banner` tiene clase `.bonus-banner` (fondo dorado) en todo momento — Marco lo verá con fondo dorado en todos los hoyos, incluyendo los que no son de bonus. Eso es lo esperado para el diagnóstico.

### 📋 Para Marco — después de este fix

Este cambio se publica solo (GitHub Pages, sin deploy en Apps Script). Una vez que Code lo confirme:
1. Entrá a cargar scores en vivo de la fecha de prueba (podés usar la misma, no hace falta borrar y recrear esta vez).
2. En CUALQUIER hoyo vas a ver un cartelito gris/dorado arriba del número que dice algo como `DEBUG · hoyo=2 · ba=2 · ld=8 · match=1`.
3. Fijate especialmente en el hoyo que vos sabés que es de bonus (BA o LD) — anotá o mandame captura de pantalla de exactamente qué dice ese cartelito en ese hoyo específico.
4. Con esos valores reales voy a poder ver exactamente qué está comparando mal la app, y en la próxima tarea lo arreglamos de una vez y sacamos el diagnóstico.

Si el cartel de bonus sigue sin aparecer después de esto, avisame — ahí sí tendría que ser otra causa distinta, y lo investigo de nuevo desde cero con esa información.

---

## 📣 Resultado — el cartel de bonus ya funciona

Causa real: `07_LiveScoring.gs` tenía una versión vieja desplegada en Apps Script (le faltaba un dato que se agregó hace unas tareas). Marco hizo un resync completo de todos los `.gs` y ahora el servidor manda bien el dato — confirmado con el cartelito de diagnóstico de la Tarea 38, que ya mostraba los hoyos de bonus correctos en vez de `undefined`.

**Ahora Marco pidió 3 mejoras de diseño sobre esa base que ya funciona:**

1. El aviso de bonus tiene que ser una ventana emergente (con una "✕" para cerrarla) — no un cartelito de texto pegado arriba. La ventana muestra el emoji grande, el texto "Best Approach!" o "Long Drive!" según corresponda, y un botón "Continuar" que la cierra y te deja cargar los scores del hoyo.
2. Lo que tiene que cambiar de color (a VERDE, no dorado) es el encabezado de la vista de hoyo actual — el que dice "HOYO 3 · Par 4 · HCP 15" — no el encabezado del tecladito donde cargás el score.
3. El emoji (🎯 o 💪 según corresponda) va DESPUÉS del HCP, en ese mismo encabezado verde.

Esto reemplaza el enfoque anterior (cartelito de texto + encabezado dorado en el tecladito de carga) por uno más claro: un aviso emergente una sola vez al llegar al hoyo, más un aviso permanente (el encabezado en verde con el emoji) mientras estás jugando ese hoyo. De paso, esto saca el diagnóstico temporal de la Tarea 38 (ya cumplió su función).

---

## 🎯 Tarea para Claude Code — Tarea 39 (rediseño del aviso de bonus: ventana emergente + encabezado verde, saca el diagnóstico de la Tarea 38)

### Qué hace esta tarea

1. Cuando llegás a un hoyo de bonus (BA o LD) en la carga de scores en vivo, aparece UNA VEZ una ventana emergente con el emoji grande, el texto "Best Approach!" o "Long Drive!", una "✕" arriba a la derecha para cerrarla, y un botón "Continuar" abajo que hace lo mismo (cerrarla y dejarte cargar los scores).
2. Mientras estás en ese hoyo, el encabezado que dice "HOYO 3 · Par 4 · HCP 15" se pone VERDE, y después del HCP aparece el emoji correspondiente (🎯 para Best Approach, 💪 para Long Drive).
3. Se saca el diagnóstico temporal de la Tarea 38 y el diseño anterior (cartelitos de texto sueltos + encabezado dorado en el tecladito de carga de score), que quedan reemplazados por lo de arriba.

Es 100% frontend (`index.html`) — se publica solo en GitHub Pages, no hace falta tocar Apps Script.

### Dónde está el código

Todo en `index.html`: los estilos (CSS, dentro de `<style>` al principio del archivo), el HTML de los modales, y las funciones `liveRenderHoyoActual()`, `liveOpenScoreModal()`, `openLiveView()`, y la sección de variables globales de "Live Scoring".

### Cambio 1 — CSS: agregar el color verde a la paleta

Buscá esta línea:

```css
  --navy:#00234b;--navy2:#001533;--red:#c8102e;--gold:#c9a84c;
```

Reemplazala por:

```css
  --navy:#00234b;--navy2:#001533;--red:#c8102e;--gold:#c9a84c;--green:#1f7a3d;
```

### Cambio 2 — CSS: variante verde del encabezado de tarjeta (mismo patrón que ya existe para "danger")

Buscá esta línea:

```css
.adm-card-hdr.danger{background:#7f1d1d;border-bottom-color:#b91c1c;}
```

Reemplazala por:

```css
.adm-card-hdr.danger{background:#7f1d1d;border-bottom-color:#b91c1c;}
.adm-card-hdr.bonus{background:var(--green);border-bottom-color:var(--navy);}
```

### Cambio 3 — CSS: sacar el dorado del encabezado del tecladito (ya no se usa) y agregar el botón "✕"

Buscá este bloque:

```css
.sm-box{background:var(--white);border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:320px;width:100%;overflow:hidden;}
.sm-hdr{background:var(--navy);color:#fff;padding:14px 18px;text-align:center;border-bottom:3px solid var(--red);}
.sm-hoyo{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.06em;}
.sm-par{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--gold);text-transform:uppercase;margin-top:2px;}
.sm-hdr.bonus{background:var(--gold);color:var(--navy);border-bottom-color:var(--navy);}
.sm-hdr.bonus .sm-par{color:var(--navy);}
```

Reemplazalo por:

```css
.sm-box{background:var(--white);border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:320px;width:100%;overflow:hidden;position:relative;}
.sm-hdr{background:var(--navy);color:#fff;padding:14px 18px;text-align:center;border-bottom:3px solid var(--red);}
.sm-hoyo{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:800;letter-spacing:.06em;}
.sm-par{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--gold);text-transform:uppercase;margin-top:2px;}
.sm-close-x{position:absolute;top:8px;right:10px;background:none;border:none;font-size:22px;color:var(--g4);cursor:pointer;line-height:1;padding:6px;z-index:2;}
.sm-close-x:hover{color:var(--navy);}
```

### Cambio 4 — CSS: sacar el estilo del cartelito de texto viejo (ya no se usa)

Buscá esta línea y borrala (no la reemplaces por nada):

```css
.bonus-banner{background:var(--gold);color:var(--navy);font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;text-align:center;padding:9px 12px;border-radius:6px;margin-bottom:8px;}
```

### Cambio 5 — HTML: sacar el cartelito de texto viejo de la vista de hoyo, y ponerle id al encabezado que ahora se va a poner verde

Buscá:

```html
      <div id="live-pane-tarjeta">
        <div id="live-bonus-banner" class="bonus-banner" style="display:none;"></div>
        <div id="live-hoyo-view">
          <div class="adm-card">
            <div class="adm-card-hdr">
              <div class="live-hoyo-hdr">
```

Reemplazalo por:

```html
      <div id="live-pane-tarjeta">
        <div id="live-hoyo-view">
          <div class="adm-card">
            <div class="adm-card-hdr" id="live-hoyo-card-hdr">
              <div class="live-hoyo-hdr">
```

### Cambio 6 — HTML: sacar el cartelito de texto viejo del tecladito de carga (era el que tenía el diagnóstico de la Tarea 38)

Buscá esta línea y borrala:

```html
    <div id="sm-bonus-banner" class="bonus-banner" style="display:none;"></div>
```

### Cambio 7 — HTML: agregar la ventana emergente nueva

Buscá este bloque (el final del tecladito de score, antes del modal de "¿quién lo ganó?"):

```html
    <div class="sm-keypad" id="sm-keypad-high" style="display:none;">
      <button onclick="smSetAndClose(10)">10</button>
      <button onclick="smSetAndClose(11)">11</button>
      <button onclick="smSetAndClose(12)">12</button>
      <button onclick="smSetAndClose(13)">13</button>
      <button onclick="smSetAndClose(14)">14</button>
      <button onclick="smSetAndClose(15)">15</button>
      <button onclick="smSetAndClose(16)">16</button>
      <button onclick="smSetAndClose(17)">17</button>
      <button onclick="smSetAndClose(18)">18</button>
      <button onclick="smSetAndClose(19)">19</button>
      <button onclick="smSetAndClose(20)">20</button>
      <button class="sm-more" onclick="smShowLow()">‹ 1-9</button>
    </div>
  </div>
</div>


<!-- Bonus modal -->
<div id="bonus-modal" class="sm-overlay" style="display:none;">
```

Reemplazalo por:

```html
    <div class="sm-keypad" id="sm-keypad-high" style="display:none;">
      <button onclick="smSetAndClose(10)">10</button>
      <button onclick="smSetAndClose(11)">11</button>
      <button onclick="smSetAndClose(12)">12</button>
      <button onclick="smSetAndClose(13)">13</button>
      <button onclick="smSetAndClose(14)">14</button>
      <button onclick="smSetAndClose(15)">15</button>
      <button onclick="smSetAndClose(16)">16</button>
      <button onclick="smSetAndClose(17)">17</button>
      <button onclick="smSetAndClose(18)">18</button>
      <button onclick="smSetAndClose(19)">19</button>
      <button onclick="smSetAndClose(20)">20</button>
      <button class="sm-more" onclick="smShowLow()">‹ 1-9</button>
    </div>
  </div>
</div>


<!-- Bonus hole arrival notice -->
<div id="bonus-aviso-modal" class="sm-overlay" style="display:none;" onclick="if(event.target===this) bonusAvisoCerrar()">
  <div class="sm-box" style="max-width:300px;text-align:center;" onclick="event.stopPropagation()">
    <button class="sm-close-x" onclick="bonusAvisoCerrar()">✕</button>
    <div style="padding:38px 20px 6px;">
      <div id="ba-aviso-emoji" style="font-size:52px;line-height:1;margin-bottom:10px;"></div>
      <div id="ba-aviso-titulo" style="font-family:'Oswald',sans-serif;font-size:21px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.02em;"></div>
    </div>
    <div style="padding:18px 20px 22px;">
      <button class="adm-btn-primary" style="width:100%;" onclick="bonusAvisoCerrar()">Continuar</button>
    </div>
  </div>
</div>

<!-- Bonus modal -->
<div id="bonus-modal" class="sm-overlay" style="display:none;">
```

### Cambio 8 — JS: variable nueva para que el aviso aparezca UNA sola vez por hoyo

Buscá:

```js
let LIVE_LINEA_DATA = null;
```

Reemplazala por:

```js
let LIVE_LINEA_DATA = null;
let LIVE_BONUS_AVISO_MOSTRADO = {}; // { [hoyo]: true } — para que el aviso emergente salga una sola vez por hoyo
```

### Cambio 9 — JS: reiniciar ese control cada vez que se entra a la vista en vivo

Buscá (dentro de `openLiveView`):

```js
function openLiveView(fecha, cancha){
  MIT_FECHA = fecha;
  LIVE_MODE = true;
  LIVE_TAB = 'tarjeta';
  LIVE_HOYO = 1;
  LIVE_LINEA_DATA = null;
```

Reemplazala por:

```js
function openLiveView(fecha, cancha){
  MIT_FECHA = fecha;
  LIVE_MODE = true;
  LIVE_TAB = 'tarjeta';
  LIVE_HOYO = 1;
  LIVE_LINEA_DATA = null;
  LIVE_BONUS_AVISO_MOSTRADO = {};
```

### Cambio 10 — JS: `liveRenderHoyoActual()` — encabezado verde + emoji después del HCP + disparo del aviso emergente

Buscá este bloque:

```js
  var indices = d.indices || [];
  var hoyoIdx = indices[h];
  document.getElementById('live-hoyo-label').textContent = 'Hoyo ' + LIVE_HOYO;
  document.getElementById('live-par-label').textContent = (par ? '· Par ' + par : '') + (hoyoIdx ? ' · HCP ' + hoyoIdx : '');

  var bonusHoyos = d.bonusHoyos || {};
  var banner = document.getElementById('live-bonus-banner');
  if(banner){
    var avisos = [];
    if(bonusHoyos.ba === LIVE_HOYO) avisos.push('🎯 Best Approach en este hoyo');
    if(bonusHoyos.ld === LIVE_HOYO) avisos.push('💪 Long Drive en este hoyo');
    if(avisos.length){
      banner.textContent = avisos.join(' · ');
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }
```

Reemplazalo por:

```js
  var indices = d.indices || [];
  var hoyoIdx = indices[h];
  document.getElementById('live-hoyo-label').textContent = 'Hoyo ' + LIVE_HOYO;

  var bonusHoyos = d.bonusHoyos || {};
  var tipoBonusAqui = bonusHoyos.ba === LIVE_HOYO ? 'ba' : (bonusHoyos.ld === LIVE_HOYO ? 'ld' : null);
  var emojiBonus = tipoBonusAqui === 'ba' ? ' 🎯' : (tipoBonusAqui === 'ld' ? ' 💪' : '');
  document.getElementById('live-par-label').textContent =
    (par ? '· Par ' + par : '') + (hoyoIdx ? ' · HCP ' + hoyoIdx : '') + emojiBonus;

  var cardHdr = document.getElementById('live-hoyo-card-hdr');
  if(cardHdr) cardHdr.classList.toggle('bonus', !!tipoBonusAqui);

  // Aviso emergente — una sola vez por hoyo, la primera vez que se detecta que es de bonus
  if(tipoBonusAqui && !LIVE_BONUS_AVISO_MOSTRADO[LIVE_HOYO]){
    LIVE_BONUS_AVISO_MOSTRADO[LIVE_HOYO] = true;
    bonusAvisoAbrir(tipoBonusAqui);
  }
```

### Cambio 11 — JS: `liveOpenScoreModal()` — simplificar (sacar diagnóstico y dorado, dejar solo el emoji chiquito junto a "Hoyo X")

Buscá este bloque:

```js
  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var smBanner = document.getElementById('sm-bonus-banner');
  var smHdr = document.getElementById('sm-hdr');
  var avisos = [];
  var hoyoEmoji = '';
  if(bonusHoyos.ba === hoyo){ avisos.push('🎯 Best Approach en este hoyo'); hoyoEmoji += '🎯 '; }
  if(bonusHoyos.ld === hoyo){ avisos.push('💪 Long Drive en este hoyo'); hoyoEmoji += '💪 '; }
  document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;
  // ⚠️ TEMPORAL — Tarea 38: diagnóstico visible, sacar en la Tarea 39
  var debugTxt_ = 'DEBUG · hoyo=' + JSON.stringify(hoyo) + ' · ba=' + JSON.stringify(bonusHoyos.ba) +
                  ' · ld=' + JSON.stringify(bonusHoyos.ld) + ' · match=' + avisos.length;
  if(smBanner){
    if(avisos.length){
      smBanner.textContent = avisos.join(' · ') + '  [' + debugTxt_ + ']';
    } else {
      smBanner.textContent = debugTxt_;
    }
    smBanner.style.display = 'block'; // TEMPORAL: siempre visible mientras diagnosticamos
  }
  if(smHdr){ smHdr.classList.toggle('bonus', avisos.length > 0); }
```

Reemplazalo por:

```js
  var bonusHoyos = LIVE_LINEA_DATA.bonusHoyos || {};
  var hoyoEmoji = '';
  if(bonusHoyos.ba === hoyo){ hoyoEmoji = '🎯 '; }
  else if(bonusHoyos.ld === hoyo){ hoyoEmoji = '💪 '; }
  document.getElementById('sm-hoyo').textContent = hoyoEmoji + 'Hoyo ' + hoyo;
```

### Cambio 12 — JS: las dos funciones nuevas del aviso emergente

Buscá la función `liveBonusModalAbrir` (el modal de "¿quién lo ganó?"):

```js
function liveBonusModalAbrir(pending){
```

Agregá estas dos funciones nuevas justo ANTES de esa línea (sin tocar `liveBonusModalAbrir` ni nada de lo que sigue):

```js
function bonusAvisoAbrir(tipo){
  var tipoLabel = tipo === 'ba' ? 'Best Approach' : 'Long Drive';
  var emoji = tipo === 'ba' ? '🎯' : '💪';
  document.getElementById('ba-aviso-emoji').textContent = emoji;
  document.getElementById('ba-aviso-titulo').textContent = tipoLabel + '!';
  document.getElementById('bonus-aviso-modal').style.display = 'flex';
}
function bonusAvisoCerrar(){
  document.getElementById('bonus-aviso-modal').style.display = 'none';
}

```

### Qué NO cambia

- El modal de "¿quién lo ganó?" (`bonus-modal`, `liveBonusModalAbrir`, `liveBonusSeleccionar`) — sigue funcionando igual, es el que aparece DESPUÉS de cargar los 4 scores del hoyo. No se toca.
- La lógica de detección de bonus en el servidor (`cargarHoyoLive_`, `07_LiveScoring.gs`) — no se toca, ya funciona bien.
- No hay cambios de backend — 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 39

1. ¿El aviso emergente (`bonus-aviso-modal`) aparece la PRIMERA vez que se detecta un hoyo de bonus, y NO se repite si el jugador sigue en el mismo hoyo (por ejemplo, si hay un refresco de datos en segundo plano)?
2. ¿El botón "✕" y el botón "Continuar" hacen lo mismo (cerrar el aviso)?
3. ¿El encabezado "HOYO X · Par Y · HCP Z" se pone verde solo en los hoyos de bonus, y el emoji aparece DESPUÉS del HCP?
4. ¿Quedó algún rastro del diagnóstico de la Tarea 38 (el texto "DEBUG...") en algún lado? Debería estar completamente sacado.
5. ¿El tecladito de carga de score (`score-modal`) ya no cambia de color — solo muestra el emoji chiquito antes de "Hoyo X"?
6. Hash y mensaje del commit.
7. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 39

1. **Sí.** En `liveRenderHoyoActual()`, el aviso solo se dispara si `tipoBonusAqui && !LIVE_BONUS_AVISO_MOSTRADO[LIVE_HOYO]`. La primera vez que se detecta el hoyo de bonus, se escribe `LIVE_BONUS_AVISO_MOSTRADO[LIVE_HOYO] = true` antes de llamar a `bonusAvisoAbrir()`. Los refrescos de fondo (`livePoll`) también llaman a `liveRender()` → `liveRenderHoyoActual()`, pero como `LIVE_BONUS_AVISO_MOSTRADO[LIVE_HOYO]` ya es `true`, el `if` no entra y el aviso no vuelve a aparecer. `LIVE_BONUS_AVISO_MOSTRADO` se resetea a `{}` cada vez que se entra a la vista en vivo (`openLiveView`), así que al iniciar una nueva ronda funciona fresco.

2. **Sí.** El botón "✕" tiene `onclick="bonusAvisoCerrar()"`. El botón "Continuar" también tiene `onclick="bonusAvisoCerrar()"`. Ambos llaman a la misma función, que hace `document.getElementById('bonus-aviso-modal').style.display = 'none'`. También se cierra si el jugador toca fuera del cuadro (el overlay tiene `onclick="if(event.target===this) bonusAvisoCerrar()"`).

3. **Sí.** En `liveRenderHoyoActual()`, `emojiBonus` es `' 🎯'` o `' 💪'` (con espacio adelante) si hay bonus, o `''` si no. Se concatena DESPUÉS del HCP: `(par ? '· Par ' + par : '') + (hoyoIdx ? ' · HCP ' + hoyoIdx : '') + emojiBonus`. El encabezado de la tarjeta (`live-hoyo-card-hdr`) recibe `classList.toggle('bonus', !!tipoBonusAqui)` — clase `.adm-card-hdr.bonus` con `background:var(--green)` solo cuando hay bonus. En hoyos sin bonus, `tipoBonusAqui` es `null` (falsy), y el toggle remueve la clase.

4. **No quedó ningún rastro.** Grep sobre `DEBUG|bonus-banner|live-bonus-banner|sm-bonus-banner|sm-hdr\.bonus` devolvió cero coincidencias. El CSS `.bonus-banner` fue eliminado, los elementos HTML `#live-bonus-banner` y `#sm-bonus-banner` fueron eliminados, las clases `.sm-hdr.bonus` fueron eliminadas, y el bloque completo del diagnóstico de la Tarea 38 fue reemplazado por el código limpio.

5. **Sí.** `liveOpenScoreModal` ahora solo calcula `hoyoEmoji` (sin `avisos`, sin toggle de clases en `sm-hdr`) y lo pone antes de "Hoyo X" en `#sm-hoyo`. El header `#sm-hdr` del tecladito siempre queda con su CSS original (navy, sin dorado ni ninguna otra variante). Los elementos `#sm-bonus-banner` y `#sm-hdr` (con id) fueron removidos del HTML también — el `sm-hdr` sigue existiendo como clase pero ya no tiene id `sm-hdr` ni ninguna clase `.bonus`.

6. **Hash:** `b1271c3` — "Tarea 39: ventana emergente de bonus + encabezado verde, saca diagnostico T38"

7. Sin dudas. Nota sobre el id `sm-hdr`: en el Cambio 2 del HTML de la Tarea 34 se había agregado `id="sm-hdr"` al div del encabezado del tecladito. En la Tarea 39 ese id ya no es necesario (el JS de `liveOpenScoreModal` ya no lo busca), y el div queda sin ese id — lo que es correcto ya que el único encabezado que ahora cambia de clase es `live-hoyo-card-hdr`.

### 📋 Para Marco — después de este fix

Se publica solo (GitHub Pages, sin deploy en Apps Script). Probá igual que la vez pasada — cargando scores en vivo hasta llegar a un hoyo de bonus — y contame si el aviso emergente y el encabezado verde con emoji se ven como esperabas.
