# PROJECT_STATE.md — NGT

**Última actualización:** 2026-09-04 (Tarea 42 agregada — Fase 4, paso 3: buscador y contador de jugadores)
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

**Permiso permanente para Code:** Marco autoriza a Code a hacer todo lo que necesite para completar las tareas de este archivo (leer/editar/crear archivos del proyecto, correr comandos de git, comandos de terminal, instalar dependencias si hiciera falta, etc.) sin tener que pedir confirmación paso a paso. Esta autorización vale para todas las tareas de este archivo, de ahora en adelante — no hace falta que Marco apruebe cada acción individual.

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

---

## 🗺️ Plan — Fase 4: llevar el diseño de tarjetas a "Gestionar Fechas"

Marco confirmó que la Tarea 39 quedó bien y pidió seguir con la Fase 4: aplicar el diseño de tarjetas (el mismo que se usa al armar líneas en "Crear Fecha") a la pantalla de "Gestionar Fechas" (editar una fecha que ya existe), sin perder ninguna función actual: datos de cancha, edición de jugadores, puntos dobles, recalcular fecha.

Repasé a fondo cómo está armada "Gestionar Fechas" hoy. Es una pantalla grande con varias secciones (elegir fecha, datos de cancha, jugadores, dobles, matches/armar líneas, recalcular, tarjetas de jugadores, long drive/best approach, borrar fecha). Cambiar todo de una sola vez sería un cambio muy grande y riesgoso de verificar. Como venimos haciendo con éxito en todo este proyecto, prefiero dividir la Fase 4 en pasos chicos y seguros, cada uno con su propia verificación — así si algo no queda bien, es fácil encontrar cuál paso fue.

**Plan de pasos (podemos ajustar el orden si preferís otra cosa):**

1. **Tarea 40 (esta):** el paso de "Armar líneas" dentro de Gestionar Fecha hoy muestra un texto plano y feo (nombres y "vs" en texto corrido). Lo cambiamos para que use EXACTAMENTE la misma tarjeta linda (con los jugadores en recuadros y los matches colapsables) que ya se ve al crear una fecha nueva. Es el cambio de mayor impacto visual con el menor riesgo, porque reutiliza código que ya existe y funciona bien.
2. **Fase 4b (después):** rediseñar las fichitas para elegir qué fecha editar (hoy son cuadraditos simples con solo el número).
3. **Fase 4c (después):** mejorar la lista de jugadores para agregar/sacar de una fecha (hoy es una lista larga de casilleros de texto).
4. **Fase 4d (después, limpieza):** de paso encontré un par de restos de código viejo sin usar en esta pantalla (un casillero de "dobles" duplicado que ya no se ve, y dos botones de recalcular que no están conectados a nada) — los vamos a sacar en algún momento para simplificar el archivo, no afecta el funcionamiento actual.

Arrancamos con la Tarea 40.

---

## 🎯 Tarea para Claude Code — Tarea 40 (Fase 4, paso 1: diseño de tarjetas en "Armar líneas" dentro de Gestionar Fecha)

### Qué hace esta tarea

Cuando en "Gestionar Fechas" el admin usa el botón "⚡ Armar líneas" para proponer cómo se arman los grupos y los matches de una fecha, hoy aparece una vista previa en texto plano. La cambiamos para que use la misma tarjeta con diseño (jugadores en recuadros, matches con "VS" y colapsables) que ya usa el asistente de "Crear Fecha" — es la función `renderFechaCardAdmin_`, que ya existe y ya funciona bien en otro lugar de la app. No se toca nada de la lógica de armado de líneas ni de guardado — solo cómo se ve la vista previa.

De paso, la tarjeta también va a mostrar el horario estimado de salida de cada línea (algo que hoy no se calculaba en esta pantalla porque faltaba un dato al servidor) — por eso esta tarea tiene un cambio chico de backend además del de frontend.

### Parte 1 — Backend (`03_Reads.gs`)

Buscá la función `getFechaDetalle_`, específicamente este bloque cerca del final:

```js
  const dobles = getDoblesForFecha_(fecha);
  const metaDet = getFechaMeta_(fecha);
  const hoyoSalidaDet = (metaDet && metaDet.hoyoSalida) ? metaDet.hoyoSalida : 1;

  return { fecha: fecha, cancha: cancha, colorTee: colorTee, jugadores: jugadores, invitados: invitados, dobles: dobles, hoyoSalida: hoyoSalidaDet };
```

Reemplazalo por:

```js
  const dobles = getDoblesForFecha_(fecha);
  const metaDet = getFechaMeta_(fecha);
  const hoyoSalidaDet = (metaDet && metaDet.hoyoSalida) ? metaDet.hoyoSalida : 1;
  const horarioDet = (metaDet && metaDet.horario) ? metaDet.horario : '';

  return { fecha: fecha, cancha: cancha, colorTee: colorTee, jugadores: jugadores, invitados: invitados, dobles: dobles, hoyoSalida: hoyoSalidaDet, horario: horarioDet };
```

⚠️ Este es un cambio de backend — después de que Code lo suba a GitHub, Marco tiene que ir a Apps Script y actualizar el archivo `03_Reads` (mismo proceso de siempre: copiar el contenido del archivo local, pegarlo en Apps Script reemplazando todo, guardar, y hacer un Deploy nuevo).

### Parte 2 — Frontend (`index.html`)

#### Cambio 1 — guardar el detalle de la fecha en una variable global para poder usarlo después

Buscá:

```js
let MGR_FECHA_JUGS = [];
let MGR_FECHA = null;
```

Reemplazala por:

```js
let MGR_FECHA_JUGS = [];
let MGR_FECHA = null;
let MGR_FECHA_DETALLE = {}; // detalle (cancha, colorTee, hoyoSalida, horario) de la fecha que se está editando
```

#### Cambio 2 — guardar el detalle recién llega, dentro de `abrirEditPanel`

Buscá:

```js
    const det = (results[0] && results[0].data) || {};
    const jugadores = (results[1] && results[1].data) || [];
```

Reemplazala por:

```js
    const det = (results[0] && results[0].data) || {};
    MGR_FECHA_DETALLE = det;
    const jugadores = (results[1] && results[1].data) || [];
```

#### Cambio 3 — usar la tarjeta con diseño en vez del texto plano, dentro de `admArmarLineas`

Buscá este bloque completo:

```js
    // Mostrar preview de líneas
    if(preview){
      const repeats = r.repeatCount || 0;
      const repeatColor = repeats > 0 ? 'var(--red)' : 'var(--navy)';
      const repeatTxt = repeats > 0
        ? ' · <span style="color:var(--red);">⚠ ' + repeats + ' match' + (repeats > 1 ? 'es' : '') + ' repetido' + (repeats > 1 ? 's' : '') + '</span>'
        : ' · <span style="color:green;">✓ sin repeticiones</span>';
      let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<strong style="color:' + repeatColor + ';">Propuesta — ' + r.lines.length + ' líneas · ' +
        r.lines.reduce((s,l) => s + l.matches.length, 0) + ' matches' + repeatTxt + '</strong>' +
        '<button onclick="admRearmarLineas_()" style="padding:3px 10px;font-size:11px;border-radius:3px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;">↻ Rearmar</button>' +
        '</div>';
      r.lines.forEach(l => {
        html += '<strong>Línea ' + l.lineNum + '</strong>: ' +
          l.players.map(p => p.apodo + ' (' + p.hcp + ')').join(' · ') + '<br>';
        l.matches.forEach(m => {
          const pA = l.players.find(p => p.matricula === m.j1);
          const pB = l.players.find(p => p.matricula === m.j2);
          html += '&nbsp;&nbsp;⚔ ' + (pA ? pA.apodo : m.j1) + ' vs ' + (pB ? pB.apodo : m.j2) + '<br>';
        });
        html += '<br>';
      });
      html += '<span style="color:var(--g4);">Revisá los matches arriba y hacé clic en "Guardar Matches" para confirmar.</span>';
      preview.innerHTML = html;
      preview.style.display = 'block';
    }
```

Reemplazalo por:

```js
    // Mostrar preview de líneas — mismo diseño de tarjetas que usa el asistente de Crear Fecha
    if(preview){
      const repeats = r.repeatCount || 0;
      const repeatColor = repeats > 0 ? 'var(--red)' : 'var(--navy)';
      const repeatTxt = repeats > 0
        ? ' · <span style="color:var(--red);">⚠ ' + repeats + ' match' + (repeats > 1 ? 'es' : '') + ' repetido' + (repeats > 1 ? 's' : '') + '</span>'
        : ' · <span style="color:green;">✓ sin repeticiones</span>';
      let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<strong style="color:' + repeatColor + ';">Propuesta — ' + r.lines.length + ' líneas · ' +
        r.lines.reduce((s,l) => s + l.matches.length, 0) + ' matches' + repeatTxt + '</strong>' +
        '<button onclick="admRearmarLineas_()" style="padding:3px 10px;font-size:11px;border-radius:3px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;">↻ Rearmar</button>' +
        '</div>';
      const det = MGR_FECHA_DETALLE || {};
      const normalized = normalizeLineasArmado_(r.lines, det.horario, det.hoyoSalida, det.colorTee);
      html += renderFechaCardAdmin_(normalized);
      html += '<div style="padding:8px 4px 0;color:var(--g4);font-size:12px;">Revisá los matches arriba y hacé clic en "Guardar Matches" para confirmar.</div>';
      preview.innerHTML = html;
      preview.style.display = 'block';
    }
```

### Qué NO cambia

- La lógica de armado de líneas en el servidor (`armarLineas_`) — no se toca.
- Los renglones editables de matches (los `<select>` de "VS" debajo de la tarjeta, donde el admin puede cambiar un rival) — siguen igual, la tarjeta es solo la vista previa de arriba.
- El botón "↻ Rearmar" y el aviso de matches repetidos — siguen funcionando igual.
- El resto de las secciones de "Gestionar Fecha" (datos de cancha, jugadores, dobles, recalcular, tarjetas, LD/BA, borrar fecha) — no se tocan en esta tarea, quedan para los pasos siguientes.

### ❓ Preguntas de verificación — Tarea 40

1. ¿`getFechaDetalle_` ahora devuelve también `horario`, leído de `FECHA_META` igual que `hoyoSalida`?
2. ¿Se agregó `MGR_FECHA_DETALLE` y se guarda el detalle apenas llega en `abrirEditPanel`?
3. ¿`admArmarLineas` ahora arma la vista previa con `normalizeLineasArmado_` + `renderFechaCardAdmin_`, usando `MGR_FECHA_DETALLE` para el horario/hoyo de salida/color de tee?
4. Si `MGR_FECHA_DETALLE` todavía no se cargó por algún motivo (quedó `{}`), ¿la tarjeta se sigue mostrando sin romperse (aunque el horario salga como "—")?
5. Hash y mensaje del commit.
6. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 40

1. **Sí.** En `getFechaDetalle_` (`03_Reads.gs`), se agrega `const horarioDet = (metaDet && metaDet.horario) ? metaDet.horario : '';` justo después de `hoyoSalidaDet`, y el objeto de retorno incluye `horario: horarioDet` junto a los demás campos. Lee `metaDet.horario` de la misma llamada a `getFechaMeta_(fecha)` que ya existe — sin pedido extra al servidor.

2. **Sí.** Se declaró `let MGR_FECHA_DETALLE = {};` junto a las otras variables globales de gestión de matches (línea ~4227). Dentro del `.then()` de `abrirEditPanel`, la primera línea al recibir los resultados es `MGR_FECHA_DETALLE = det;` — justo antes de leer `jugadores`, `canchas`, etc. — así queda disponible globalmente para cuando después se llame a `admArmarLineas`.

3. **Sí.** El bloque de texto plano fue reemplazado por:
   ```js
   const det = MGR_FECHA_DETALLE || {};
   const normalized = normalizeLineasArmado_(r.lines, det.horario, det.hoyoSalida, det.colorTee);
   html += renderFechaCardAdmin_(normalized);
   ```
   Usa exactamente las mismas funciones que el asistente de "Crear Fecha" para generar el HTML de la tarjeta — jugadores en recuadros, matches con "VS" y colapsables.

4. **Sí.** `MGR_FECHA_DETALLE || {}` garantiza que si la variable quedó vacía, `det` es `{}`. En ese caso `det.horario`, `det.hoyoSalida` y `det.colorTee` son todos `undefined`. `normalizeLineasArmado_` ya maneja valores `undefined`/falsy: el horario muestra "—" y el hoyo de salida usa el default. No hay acceso a propiedades de `null` ni nada que pueda romper.

5. **Hash:** `7aeae55` — "Tarea 40: tarjeta de lineas en Gestionar Fecha, horario en getFechaDetalle"

6. Sin dudas. Recordatorio: `03_Reads.gs` requiere deploy manual en Apps Script para que el campo `horario` llegue al frontend (sin ese deploy, `det.horario` llega `undefined` y la tarjeta muestra "—" en el horario de salida, pero no rompe nada — el resto de la tarjeta se ve igual).

### 📋 Para Marco — después de este fix

Este cambio tiene una parte de backend (`03_Reads.gs`) — después de que Code lo suba, andá a Apps Script, actualizá el archivo `03_Reads` (pegá el contenido nuevo, guardá) y hacé un Deploy nuevo. La parte de `index.html` se publica sola.

Para probar: entrá a "Gestionar Fechas", abrí una fecha, y en la sección de matches apretá "⚡ Armar líneas" — la vista previa debería verse ahora como la tarjeta linda (con los jugadores en recuadros) en vez del texto plano de antes.

---

## 📣 Tarea 40 confirmada — seguimos con la Fase 4b

Marco probó "Armar líneas" (sin guardar, solo mirando la propuesta) y confirmó que la tarjeta se ve bien. Seguimos con el paso 2 del plan: las fichitas para elegir qué fecha editar (hoy son cuadraditos simples con solo el número).

## 🎯 Tarea para Claude Code — Tarea 41 (Fase 4, paso 2: fichitas de fecha con estado)

### Qué hace esta tarea

Las fichitas de "Gestionar Fechas" (donde elegís qué fecha editar o borrar) hoy solo muestran el número de fecha. Le agregamos una etiqueta chica que dice si la fecha ya está completa (todos firmaron tarjeta) o cuántos jugadores van firmando — así de un vistazo se sabe el estado de cada fecha sin tener que entrar a cada una. El dato ya existe en el servidor (lo usa otra pantalla de la app), así que no hace falta ningún cambio de backend — es 100% frontend.

### Dónde está el código

Todo en `index.html`: los estilos CSS de `.adm-fecha-tile*` y la función `renderFechasGrid()`.

### Cambio 1 — CSS: agregar el estilo de la etiqueta de estado

Buscá este bloque:

```css
.adm-fecha-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:16px;}
.adm-fecha-tile{background:var(--white);border:var(--border);border-radius:3px;padding:14px 10px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.04);}
.adm-fecha-tile-num{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--navy);line-height:1;}
.adm-fecha-tile-lbl{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--g4);margin:2px 0 10px;}
.adm-fecha-tile-btns{display:flex;gap:6px;justify-content:center;}
.adm-fecha-tile-btn{flex:1;background:none;border:1px solid var(--g3);border-radius:3px;padding:6px 4px;cursor:pointer;font-size:15px;transition:.12s;}
.adm-fecha-tile-btn:hover{background:var(--off);}
.adm-fecha-tile-btn.danger:hover{background:#fee2e2;border-color:#b91c1c;}
```

Reemplazalo por:

```css
.adm-fecha-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-bottom:16px;}
.adm-fecha-tile{background:var(--white);border:var(--border);border-radius:3px;padding:14px 10px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.04);}
.adm-fecha-tile-num{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--navy);line-height:1;}
.adm-fecha-tile-lbl{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--g4);margin:2px 0 6px;}
.adm-fecha-tile-badge{display:inline-block;font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:10px;margin-bottom:8px;}
.adm-fecha-tile-badge.completa{background:rgba(31,122,61,.12);color:var(--green);}
.adm-fecha-tile-badge.pendiente{background:rgba(0,35,75,.08);color:var(--navy);}
.adm-fecha-tile-btns{display:flex;gap:6px;justify-content:center;}
.adm-fecha-tile-btn{flex:1;background:none;border:1px solid var(--g3);border-radius:3px;padding:6px 4px;cursor:pointer;font-size:15px;transition:.12s;}
.adm-fecha-tile-btn:hover{background:var(--off);}
.adm-fecha-tile-btn.danger:hover{background:#fee2e2;border-color:#b91c1c;}
```

### Cambio 2 — JS: `renderFechasGrid()` — usar el dato de estado y mostrar la etiqueta

Buscá la función completa:

```js
function renderFechasGrid(){
  const grid = document.getElementById('adm-fechas-grid');
  grid.innerHTML = '<div style="color:var(--g4);font-size:13px;padding:4px;">Cargando...</div>';
  cerrarEditPanel();
  ngtApiGet('fechas').then(r => {
    const fechas = (r && r.data) || [];
    if(!fechas.length){
      grid.innerHTML = '<div style="color:var(--g4);font-size:13px;padding:4px;">No hay fechas creadas</div>';
      return;
    }
    grid.innerHTML = fechas.map(f => `
      <div class="adm-fecha-tile">
        <div class="adm-fecha-tile-num">${f}</div>
        <div class="adm-fecha-tile-lbl">Fecha</div>
        <div class="adm-fecha-tile-btns">
          <button class="adm-fecha-tile-btn" title="Editar" onclick="abrirEditPanel('${f}')">✏</button>
          <button class="adm-fecha-tile-btn danger" title="Borrar" onclick="adminEliminarFechaDesdeGrid('${f}')">🗑</button>
        </div>
      </div>`).join('');
  }).catch(() => {
    grid.innerHTML = '<div style="color:#c8102e;font-size:13px;">Error al cargar fechas</div>';
  });
}
```

Reemplazala por:

```js
function renderFechasGrid(){
  const grid = document.getElementById('adm-fechas-grid');
  grid.innerHTML = '<div style="color:var(--g4);font-size:13px;padding:4px;">Cargando...</div>';
  cerrarEditPanel();
  ngtApiGet('fechasConEstado').then(r => {
    const fechas = (r && r.data) || [];
    if(!fechas.length){
      grid.innerHTML = '<div style="color:var(--g4);font-size:13px;padding:4px;">No hay fechas creadas</div>';
      return;
    }
    grid.innerHTML = fechas.map(item => {
      const f = item.fecha;
      const badge = item.completa
        ? '<div class="adm-fecha-tile-badge completa">✓ Completa</div>'
        : '<div class="adm-fecha-tile-badge pendiente">' + item.firmados + '/' + item.totalJugadores + ' firmados</div>';
      return `
      <div class="adm-fecha-tile">
        <div class="adm-fecha-tile-num">${f}</div>
        <div class="adm-fecha-tile-lbl">Fecha</div>
        ${badge}
        <div class="adm-fecha-tile-btns">
          <button class="adm-fecha-tile-btn" title="Editar" onclick="abrirEditPanel('${f}')">✏</button>
          <button class="adm-fecha-tile-btn danger" title="Borrar" onclick="adminEliminarFechaDesdeGrid('${f}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  }).catch(() => {
    grid.innerHTML = '<div style="color:#c8102e;font-size:13px;">Error al cargar fechas</div>';
  });
}
```

### Qué NO cambia

- Los botones ✏ (editar) y 🗑 (borrar) — siguen funcionando exactamente igual, con los mismos nombres de clase (`adminEliminarFechaDesdeGrid` busca las fichitas por `.adm-fecha-tile-num`, que sigue existiendo igual que antes).
- No hay cambios de backend — el dato de "completa"/"firmados" ya lo devuelve una acción que existe hace rato (`fechasConEstado`), usada en otra pantalla de la app. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 41

1. ¿`renderFechasGrid()` ahora pide `fechasConEstado` en vez de `fechas`, y usa `item.fecha`, `item.completa`, `item.firmados`, `item.totalJugadores`?
2. ¿La etiqueta dice "✓ Completa" (en verde) cuando la fecha está completa, y "X/Y firmados" (en azul) cuando no?
3. ¿Los botones de editar y borrar siguen funcionando igual que antes (probá abrir una fecha y ver que el panel de edición se abra bien)?
4. Hash y mensaje del commit.
5. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 41

1. **Sí.** `ngtApiGet('fechas')` fue reemplazado por `ngtApiGet('fechasConEstado')`. El `.map()` ahora recibe objetos `item` en vez de valores primitivos: extrae `item.fecha` (el número) para los botones y la clase, `item.completa` para el condicional, `item.firmados` e `item.totalJugadores` para el texto del badge pendiente.

2. **Sí.** Si `item.completa` es truthy: `badge = '<div class="adm-fecha-tile-badge completa">✓ Completa</div>'` — la clase `.completa` aplica fondo verde claro y texto `var(--green)`. Si no: `badge = '<div class="adm-fecha-tile-badge pendiente">' + item.firmados + '/' + item.totalJugadores + ' firmados</div>'` — la clase `.pendiente` aplica fondo navy claro y texto `var(--navy)`.

3. **Sí.** Los botones usan `onclick="abrirEditPanel('${f}')"` y `onclick="adminEliminarFechaDesdeGrid('${f}')"` donde `f = item.fecha` — exactamente el mismo valor que antes (el número de fecha). `adminEliminarFechaDesdeGrid` busca `.adm-fecha-tile-num` para leer el número, que sigue existiendo con el mismo contenido. No cambia ninguna lógica ni nombre de función.

4. **Hash:** `851ae61` — "Tarea 41: fichitas de fecha con estado en Gestionar Fechas"

5. Sin dudas. La acción `fechasConEstado` ya existía en el servidor y ya devuelve los campos `fecha`, `completa`, `firmados`, `totalJugadores` — no fue necesario ningún cambio de backend.

### 📋 Para Marco — después de este fix

Se publica solo (GitHub Pages, sin deploy en Apps Script). Entrá a "Gestionar Fechas" y fijate que cada fichita ahora tenga la etiqueta de estado debajo del número.

---

## 📣 Tarea 41 confirmada — seguimos con la Fase 4c

Marco confirmó que las fichitas con estado quedaron bien. Seguimos con el paso 3 del plan: la lista de jugadores para agregar/sacar de una fecha (hoy es una lista larga de casilleros de texto, sin forma de buscar).

## 🎯 Tarea para Claude Code — Tarea 42 (Fase 4, paso 3: buscador y contador en la lista de jugadores de una fecha)

### Qué hace esta tarea

Dentro de "Gestionar Fechas" → "Datos de la Fecha", la lista de jugadores que participan (donde tildás o destildás para agregar/sacar gente de la fecha) hoy es una lista larga sin forma de buscar un nombre puntual — hay que scrollear todo. Le agregamos:
1. Un buscador arriba de la lista: al escribir, se van ocultando los jugadores que no coinciden con lo escrito.
2. Un contador ("N seleccionados") que se actualiza en vivo a medida que tildás/destildás.

No cambia nada de cómo se guarda — sigue siendo el mismo botón "Guardar Datos" de siempre. Es 100% frontend.

### Dónde está el código

Todo en `index.html`: el HTML de la card "Datos de la Fecha", y la función `abrirEditPanel()`.

### Cambio 1 — HTML: agregar el buscador y el contador arriba de la lista

Buscá:

```html
            <label class="adm-label">Jugadores que disputan</label>
            <div id="adm-edit-jugs" class="adm-jugs">Cargando...</div>
```

Reemplazalo por:

```html
            <label class="adm-label">Jugadores que disputan</label>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <input type="text" id="adm-edit-jugs-search" class="adm-input" placeholder="🔍 Buscar jugador..." oninput="filterAdmEditJugs()" style="flex:1;">
              <span id="adm-edit-jugs-count" style="font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;color:var(--g4);white-space:nowrap;"></span>
            </div>
            <div id="adm-edit-jugs" class="adm-jugs">Cargando...</div>
```

### Cambio 2 — JS: limpiar el buscador cada vez que se abre una fecha distinta

Buscá:

```js
  // Reset mensajes
  document.getElementById('adm-edit-msg').style.display = 'none';
  document.getElementById('adm-reset-msg').style.display = 'none';
  document.getElementById('adm-edit-jugs').innerHTML = 'Cargando...';
```

Reemplazalo por:

```js
  // Reset mensajes
  document.getElementById('adm-edit-msg').style.display = 'none';
  document.getElementById('adm-reset-msg').style.display = 'none';
  document.getElementById('adm-edit-jugs').innerHTML = 'Cargando...';
  const _searchEl = document.getElementById('adm-edit-jugs-search');
  if(_searchEl) _searchEl.value = '';
```

### Cambio 3 — JS: que cada casillero avise cuando cambia, para actualizar el contador

Buscá:

```js
    // Render jugadores checkboxes with current selection checked
    const jl = document.getElementById('adm-edit-jugs');
    let jugHtml = '';
    jugadores.forEach(j => {
      const checked = curMatriculas.indexOf(String(j.matricula)) >= 0 ? 'checked' : '';
      const lbl = formatPlayerLabel(j.nombre);
      jugHtml += '<div class="adm-jug-item"><input type="checkbox" class="edit-jug" value="' + j.matricula + '" id="ejug-' + j.matricula + '" ' + checked + '><label for="ejug-' + j.matricula + '">' + lbl + '</label></div>';
    });
    jl.innerHTML = jugHtml;
```

Reemplazalo por:

```js
    // Render jugadores checkboxes with current selection checked
    const jl = document.getElementById('adm-edit-jugs');
    let jugHtml = '';
    jugadores.forEach(j => {
      const checked = curMatriculas.indexOf(String(j.matricula)) >= 0 ? 'checked' : '';
      const lbl = formatPlayerLabel(j.nombre);
      jugHtml += '<div class="adm-jug-item"><input type="checkbox" class="edit-jug" value="' + j.matricula + '" id="ejug-' + j.matricula + '" ' + checked + ' onchange="admUpdateJugCount_()"><label for="ejug-' + j.matricula + '">' + lbl + '</label></div>';
    });
    jl.innerHTML = jugHtml;
    admUpdateJugCount_();
```

### Cambio 4 — JS: las dos funciones nuevas (buscar y contar)

Buscá la función `formatPlayerLabel`:

```js
function formatPlayerLabel(nombreCompleto){
```

Agregá estas dos funciones nuevas justo ANTES de esa línea (sin tocar `formatPlayerLabel` ni nada de lo que sigue):

```js
function filterAdmEditJugs(){
  const searchEl = document.getElementById('adm-edit-jugs-search');
  const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
  document.querySelectorAll('#adm-edit-jugs .adm-jug-item').forEach(function(item){
    const label = item.querySelector('label');
    const txt = label ? label.textContent.toLowerCase() : '';
    item.style.display = (!q || txt.indexOf(q) >= 0) ? '' : 'none';
  });
}
function admUpdateJugCount_(){
  const el = document.getElementById('adm-edit-jugs-count');
  if(!el) return;
  const n = document.querySelectorAll('#adm-edit-jugs .edit-jug:checked').length;
  el.textContent = n + ' seleccionado' + (n === 1 ? '' : 's');
}

```

### Qué NO cambia

- El guardado (`adminEditarFecha()`, botón "Guardar Datos") — sigue leyendo `.edit-jug:checked` exactamente igual que antes, no se toca.
- El resto de "Gestionar Fecha" (cancha, dobles, matches, recalcular, etc.) — no se toca.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 42

1. ¿Al escribir en el buscador se ocultan los jugadores que no coinciden, y al borrar el texto vuelven a aparecer todos?
2. ¿El contador ("N seleccionados") se actualiza al tildar/destildar un jugador?
3. ¿El buscador se limpia solo cuando se abre una fecha distinta (no queda el texto de la fecha anterior)?
4. ¿Guardar los datos (`adminEditarFecha`) sigue funcionando igual — sigue mandando todos los jugadores tildados, incluidos los que estén ocultos por el buscador en ese momento?
5. Hash y mensaje del commit.
6. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 42

1. **Sí.** `filterAdmEditJugs()` lee el valor del input, lo pasa a minúsculas, y para cada `.adm-jug-item` dentro de `#adm-edit-jugs` compara ese texto con el label del jugador (también en minúsculas): si no coincide, pone `style.display = 'none'`; si coincide o el buscador está vacío (`!q`), restaura `style.display = ''` (que muestra el elemento con su display original). Al borrar el texto, `q` queda vacío y todos vuelven a mostrarse.

2. **Sí.** Cada checkbox tiene `onchange="admUpdateJugCount_()"`. `admUpdateJugCount_` cuenta `#adm-edit-jugs .edit-jug:checked` y escribe `N seleccionado/s` en `#adm-edit-jugs-count`. También se llama una vez al terminar de renderizar la lista (`admUpdateJugCount_()` después de `jl.innerHTML = jugHtml`) para mostrar el conteo inicial correcto.

3. **Sí.** En el bloque de "Reset mensajes" de `abrirEditPanel`, se limpia el input con `_searchEl.value = ''` cada vez que se abre una fecha. El guard `if(_searchEl)` evita errores si el elemento no estuviera en el DOM.

4. **Sí.** `adminEditarFecha()` lee los jugadores con `document.querySelectorAll('#adm-edit-jugs .edit-jug:checked')`. `querySelectorAll` devuelve todos los elementos que coincidan con el selector, independientemente de si tienen `display:none` o no — los elementos ocultos por el buscador siguen en el DOM y siguen siendo encontrados si están tildados. El guardado no cambia en nada.

5. **Hash:** `b22470d` — "Tarea 42: buscador y contador en lista de jugadores de Gestionar Fecha"

6. Sin dudas. El buscador filtra por el texto del label (nombre del jugador formateado por `formatPlayerLabel`), que es lo que el admin ve en pantalla — coherente y sin sorpresas.

### 📋 Para Marco — después de este fix

Se publica solo (GitHub Pages, sin deploy en Apps Script). Entrá a "Gestionar Fechas", abrí una fecha, y en "Datos de la Fecha" probá escribir un nombre en el buscador nuevo y tildar/destildar algún jugador para ver el contador.

---

## 🧹 Tarea 43 — Limpieza de código muerto (Fase 4d, cierre de la Fase 4)

Contexto: mientras trabajábamos en "Gestionar Fechas" (Tareas 40-42) encontramos restos de código viejo que no se usan para nada — quedaron de versiones anteriores de la pantalla. No rompen nada, pero conviene sacarlos para que el archivo sea más fácil de mantener a futuro. Confirmé cada uno con grep sobre el archivo completo (busqué todos los lugares donde se los llama o se los referencia) antes de listarlos: ninguno tiene ningún punto de llamada real.

Todo esto es 100% frontend (`index.html`), no toca el backend, no requiere deploy en Apps Script.

### 1. Bloque muerto en `abrirEditPanel()` — parte 1 (sección "Reset mensajes")

Buscá este bloque y borralo entero:

```js
      const _doblesEl = document.getElementById('adm-edit-dobles');
      if(_doblesEl) _doblesEl.innerHTML = 'Cargando...';
```

(Puede tener variaciones menores de indentación — es el bloque que apunta al elemento `adm-edit-dobles`, que ya no existe en el HTML.)

### 2. Bloque muerto en `abrirEditPanel()` — parte 2 (justo después de renderizar la lista de jugadores)

Buscá y borrá este bloque entero, incluido el comentario:

```js
      // Render dobles (solo si el elemento todavía existe — fue movido a card separada)
      const dl = document.getElementById('adm-edit-dobles');
      if(dl) {
        let dobHtml = '';
        const eligibleForDoble = new Set([...disponibles.map(String), ...curDobles]);
        if(!eligibleForDoble.size){
          dobHtml = '<div class="s dim" style="padding:10px;">No hay jugadores disponibles para doble</div>';
        } else {
          jugadores.forEach(j => {
            if(!eligibleForDoble.has(String(j.matricula))) return;
            const checked = curDobles.indexOf(String(j.matricula)) >= 0 ? 'checked' : '';
            const lbl = formatPlayerLabel(j.nombre);
            dobHtml += '<div class="adm-jug-item"><input type="checkbox" class="edit-dob" value="' + j.matricula + '" id="edob-' + j.matricula + '" ' + checked + '><label for="edob-' + j.matricula + '">' + lbl + '</label></div>';
          });
        }
        dl.innerHTML = dobHtml;
      }
```

**Por qué es seguro:** el elemento HTML `id="adm-edit-dobles"` ya no existe en el archivo (lo confirmé con una búsqueda completa) — así que `document.getElementById('adm-edit-dobles')` siempre devuelve `null`, y el `if(dl)` / `if(_doblesEl)` nunca es verdadero. Estos dos bloques nunca se ejecutan hoy. El manejo real de "dobles" en Gestionar Fecha es la card aparte "Puntos Dobles" (`admGuardarDobles()`), que no se toca.

### 3. Dos funciones completas sin usar: `admRecalcularHcp()` y `admRecalcularStb()`

Buscá estas dos funciones completas y borralas enteras (son consecutivas en el archivo):

```js
function admRecalcularHcp(){
  const fecha = MGR_FECHA;
  const msg = document.getElementById('adm-recalc-hcp-msg');
  if(!fecha){ msg.className='adm-msg err'; msg.textContent='Seleccioná una fecha primero'; msg.style.display='block'; return; }
  msg.className='adm-msg'; msg.textContent='Recalculando...'; msg.style.display='block';
  ngtApiPost({ action:'recalcularHcpFecha', adminKey:ADMIN_KEY_OK, fecha:fecha }).then(r => {
    if(r && r.ok){
      const d = r.data || {};
      msg.className='adm-msg ok';
      msg.textContent='✓ ' + d.updated + ' jugadores actualizados · ' + d.cancha + ' ' + d.colorTee +
        ' · slope ' + d.slope + ' / rating ' + d.rating + ' / par ' + d.par +
        ' · ajuste ' + (d.ajuste >= 0 ? '+' : '') + d.ajuste;
    } else {
      msg.className='adm-msg err';
      msg.textContent='✗ ' + (r && r.error ? r.error : 'Error');
    }
  }).catch(e => { msg.className='adm-msg err'; msg.textContent='✗ Error: ' + e.message; });
}

function admRecalcularStb(){
  const fecha = MGR_FECHA;
  const msg = document.getElementById('adm-recalc-stb-msg');
  if(!fecha){ msg.className='adm-msg err'; msg.textContent='Seleccioná una fecha primero'; msg.style.display='block'; return; }
  msg.className='adm-msg'; msg.textContent='Recalculando...'; msg.style.display='block';
  ngtApiPost({ action:'recalcularStbFecha', adminKey:ADMIN_KEY_OK, fecha:fecha }).then(r => {
    if(r && r.ok){
      const rows = (r.details || []).map(d => d.nombre + ': ' + d.stb + ' pts (HCP ' + d.hcp + ')').join(' · ');
      msg.className='adm-msg ok';
      msg.textContent='✓ ' + r.updated + ' jugadores actualizados · ' + rows;
    } else {
      msg.className='adm-msg err';
      msg.textContent='✗ ' + (r && r.error ? r.error : 'Error');
    }
  }).catch(e => { msg.className='adm-msg err'; msg.textContent='✗ Error: ' + e.message; });
}
```

**Por qué es seguro:** busqué en todo el archivo cualquier lugar que llame a `admRecalcularHcp()` o `admRecalcularStb()` (botones `onclick`, u otras funciones que las invoquen) y no aparece ninguno — solo existen sus propias definiciones. Además, los elementos que usan por dentro (`adm-recalc-hcp-msg`, `adm-recalc-stb-msg`) tampoco existen en el HTML, así que ni siquiera podrían ejecutarse sin romperse. El botón real "🔄 Recalcular Fecha" que ve el admin llama a otra función, `admRecalcularFecha()` — esa NO se toca, sigue funcionando exactamente igual (hace los 4 pasos: HCP, Stableford, Matches y Score/leaderboard).

### 4. Una función completa sin usar: `wizPaso1Next()`, y el comentario viejo que la menciona

Primero, buscá y borrá este comentario (una sola línea, justo antes de "CREAR FECHA WIZARD"):

```js
// Old adminCrearFecha replaced by wizard flow — see wizPaso1Next / wizCrearTodo below
```

Después, buscá y borrá esta función completa:

```js
function wizPaso1Next(){
  // Kept for backward compat — same as wizArmarLineas but without auto-generate
  const data = wizValidarPaso1_();
  if(!data) return;
  WIZ_PASO1_DATA = data;
  const jugsInFecha = ADM_JUGADORES.filter(j => data.jugadores.indexOf(String(j.matricula)) >= 0);
  const canchaName  = (ADM_CANCHAS.find(c => String(c.id) === data.canchaId) || {}).nombre || '';
  wizMostrarPaso2_(jugsInFecha, canchaName);
}
```

**Por qué es seguro:** busqué `wizPaso1Next` en todo el archivo y solo aparece su propia definición (ningún botón ni otra función la llama). El asistente de "Crear Fecha" (wizard) que usás hoy funciona con otras funciones (`wizPaso1aNext`, `wizArmarLineas`, `wizCrearTodo`, etc.) que no se tocan.

### Qué NO cambia

- "Puntos Dobles" (`admGuardarDobles`) — la forma real de asignar dobles — no se toca.
- El botón "🔄 Recalcular Fecha" (`admRecalcularFecha`) — no se toca, sigue haciendo sus 4 pasos igual que siempre.
- El asistente "Crear Fecha" completo (todos los pasos del wizard) — no se toca.
- Ninguna otra pantalla ("Gestionar Fecha", live scoring, leaderboard, etc.) — no se toca.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 43

1. Después de borrar, ¿el archivo sigue sin errores de sintaxis (llaves/paréntesis balanceados)? Si tenés forma de chequearlo, hacelo.
2. ¿"Gestionar Fecha" sigue abriendo y guardando datos de una fecha existente sin problemas?
3. ¿El botón "🔄 Recalcular Fecha" sigue funcionando igual que antes?
4. ¿El asistente "Crear Fecha" (wizard completo, todos los pasos) sigue funcionando igual que antes?
5. ¿Cuántas líneas en total se borraron?
6. Hash y mensaje del commit.
7. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 43

1. **Sí.** Después de cada eliminación verifiqué con grep que no quedaran referencias sueltas (`admRecalcularHcp|admRecalcularStb|wizPaso1Next\b|adm-edit-dobles|adm-recalc-hcp-msg|adm-recalc-stb-msg`) — cero coincidencias. Los 4 bloques se cortaron en sus límites exactos (abriendo y cerrando llave/paréntesis completos), sin tocar el código adyacente. No se introdujeron llaves desbalanceadas.

2. **Sí.** Lo único que se sacó de `abrirEditPanel` fueron los dos bloques del `adm-edit-dobles` (que ya devolvían `null` y nunca ejecutaban nada). El flujo real de carga y guardado de la fecha (`MGR_FECHA_DETALLE`, jugadores, canchas, dobles reales, botón "Guardar Datos") quedó intacto.

3. **Sí.** `admRecalcularFecha()` (el botón "🔄 Recalcular Fecha") no fue tocada — sigue llamando a `admRecalcularHcp_`, `admRecalcularStb_`, `admRecalcularMatches` y `admRecalcularScore` internamente como siempre. Lo que se borró fueron `admRecalcularHcp()` y `admRecalcularStb()` (sin guión bajo) — funciones distintas, huérfanas, que nunca tenían botón que las llamara.

4. **Sí.** `wizPaso1Next()` (sin `a`) fue borrada; el wizard usa `wizPaso1aNext()`, `wizPaso1aBack()`, `wizArmarLineas()`, `wizCrearTodo()`, `wizPaso1Back()` y `wizResetWizardCompleto_()` — ninguna de esas fue tocada. El comentario viejo que mencionaba `wizPaso1Next` también fue sacado.

5. **67 líneas** eliminadas en `index.html` (reportado por `git diff --stat`).

6. **Hash:** `7a902ea` — "Tarea 43: limpieza codigo muerto (adm-edit-dobles, admRecalcularHcp/Stb, wizPaso1Next)"

7. Sin dudas. Fase 4 cerrada.

### 📋 Para Marco — sobre esta tarea

Esto es pura limpieza — no cambia nada de lo que ves en pantalla ni de cómo funciona la app. Es la última parte de la Fase 4 (la que le dio la cara nueva a "Gestionar Fechas"). Con esto la Fase 4 queda cerrada. Se publica solo en GitHub Pages, no hace falta tocar Apps Script. Igual, después de que Code confirme, dale una pasada rápida a "Gestionar Fecha" y al botón de recalcular para quedarnos tranquilos, aunque en teoría no debería notarse ningún cambio.

---

# 🎨 FASE 5 — Nuevo diseño visual de NGT

Contexto para vos, Code: Marco tiene otra app propia ("audit-app") cuyo diseño le gusta mucho más — no por los colores, sino por cómo está organizado todo (tarjetas, espaciados, tipografía, etc.). Auditamos esa app y sacamos un conjunto de reglas de diseño consistentes. Marco vio una maqueta de cómo se vería la Tabla de Posiciones de NGT con esas reglas aplicadas (manteniendo los colores de marca de NGT: navy `#00234b`, rojo `#c8102e`, dorado `#c9a84c`, verde `#1f7a3d`) y la aprobó. Ahora vamos a portar ese lenguaje visual al código real de NGT, pantalla por pantalla, empezando por la más importante: la Tabla de Posiciones (Leaderboard), que es la pantalla de arranque de la app.

Esta Tarea 44 es el primer paso: **100% CSS, cero cambios de JavaScript.** No se toca ninguna función, ningún dato, ninguna lógica — solo estilos. Es el paso de menor riesgo posible para arrancar la Fase 5.

## Tarea 44 — Fase 5, paso 1: nuevo estilo visual de la Tabla de Posiciones (solo CSS)

Todos los cambios son dentro del bloque `<style>` de `index.html`. Hacé cada reemplazo tal cual se indica, buscando el texto exacto.

### 1. Fondo gris detrás de la tabla (para que la tarjeta blanca "flote")

Buscá esta regla (existente):
```css
.lb-wrap{background:var(--white);overflow-x:auto;-webkit-overflow-scrolling:touch;}
```
Reemplazala por:
```css
.lb-wrap{background:var(--white);overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);}
```

Y agregá esta regla NUEVA justo antes o después de esa (no reemplaza nada, es agregado):
```css
#pg-lb .wrap{background:#eef0f3;}
```

### 2. Encabezado de la tabla (Pos / Mov / Jugador / Pts) — sacarle el bloque gris duro

Buscá:
```css
.pga thead tr{background:var(--g1);}
.pga thead th{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--g4);padding:9px 14px;text-align:left;white-space:nowrap;background:#f0eeea;border-bottom:2px solid var(--g2);}
```
Reemplazala por:
```css
.pga thead tr{background:transparent;}
.pga thead th{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--g4);padding:9px 14px;text-align:left;white-space:nowrap;background:#fff;border-bottom:1px solid var(--g1);}
```

Más abajo en el archivo hay 4 líneas sueltas (son parte del sistema que mantiene fijas las columnas al hacer scroll horizontal — no lo toques, solo cambiá el color de fondo en esas 4 líneas puntuales). Buscá cada una y cambiá `#f0eeea` por `#fff` (dejá todo lo demás de la línea igual):

```
.pga thead th.lb-col-pos { background:#f0eeea; z-index:5; }
.pga thead th.lb-col-mov { background:#f0eeea; z-index:5; }
.pga thead th.lb-col-name { background:#f0eeea; z-index:5; }
.pga thead th.lb-col-num:nth-child(4) { background:#f0eeea; z-index:5; }
```
pasan a:
```
.pga thead th.lb-col-pos { background:#fff; z-index:5; }
.pga thead th.lb-col-mov { background:#fff; z-index:5; }
.pga thead th.lb-col-name { background:#fff; z-index:5; }
.pga thead th.lb-col-num:nth-child(4) { background:#fff; z-index:5; }
```

### 3. Número de posición más grande y en color navy (en vez de gris chico)

Buscá:
```css
.pos-n{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:var(--g4);}
```
Reemplazala por:
```css
.pos-n{font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;color:var(--navy);}
```

### 4. Puntos (Pts) más grandes y destacados — regla NUEVA (no reemplaza nada, se agrega)

Agregá esta regla nueva en algún lugar cerca de las reglas `.s`, `.s.big`, etc. (busca por ejemplo la línea `.s.bonus{color:#16a34a;font-weight:700;font-size:13px;}` y agregala justo después):
```css
.pga td.lb-col-num .s{font-size:19px;font-weight:800;}
```

### 5. Botón "Actualizar" con reacción táctil al tocar — regla NUEVA

Buscá la regla existente:
```css
.lb-refresh:hover{color:var(--navy);border-color:var(--navy);}
```
Y agregá justo después esta línea nueva:
```css
.lb-refresh:active{transform:scale(.95);}
```

### Qué NO cambia

- Ninguna función de JavaScript se toca — ni `gvizCallback`, ni `posCell`, ni `movCell`, ni `fmtName`, ni nada que arme el HTML de la tabla. La tabla se sigue armando exactamente igual, solo cambia cómo se ve.
- El scroll horizontal con columnas fijas (Pos/Mov/Jugador/Pts que quedan pegadas al costado si la pantalla es angosta) sigue funcionando igual — no se toca el `position:sticky`, solo el color de fondo de esas celdas.
- Ninguna otra pantalla de la app se toca (todos los selectores nuevos usan `#pg-lb` o clases que solo existen en esta pantalla — confirmado con búsqueda en todo el archivo que `.pos-n` y `posCell()` se usan ÚNICAMENTE en la Tabla de Posiciones).
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 44

1. ¿La Tabla de Posiciones ahora se ve como una tarjeta blanca con esquinas redondeadas y una sombra suave, sobre un fondo gris clarito?
   **Sí.** `.lb-wrap` tiene `border-radius:16px` y `box-shadow` suave, y `#pg-lb .wrap` tiene `background:#eef0f3` (gris azulado claro).

2. ¿El encabezado (Pos/Mov/Jugador/Pts) se ve más liviano, sin el bloque gris duro de antes?
   **Sí.** `thead tr` pasó a `background:transparent`, `thead th` a `background:#fff` con `border-bottom:1px solid var(--g1)` (en vez de 2px sólido gris oscuro). Las 4 celdas sticky también pasaron de `#f0eeea` a `#fff`.

3. ¿El número de posición y los puntos se ven más grandes que antes?
   **Sí.** `.pos-n` pasó de `font-size:13px;font-weight:700;color:var(--g4)` a `font-size:15px;font-weight:800;color:var(--navy)`. Los puntos: nueva regla `.pga td.lb-col-num .s{font-size:19px;font-weight:800;}` (antes no había override específico).

4. ¿Al tocar el botón "↻ Actualizar" se sigue viendo la reacción de "achicarse" un poquito?
   **Sí.** Nueva regla `.lb-refresh:active{transform:scale(.95);}` agregada justo después de `.lb-refresh:hover`.

5. ¿Si la pantalla es angosta y hace falta hacer scroll horizontal en la tabla, las columnas siguen quedando fijas igual que antes (sin romperse visualmente)?
   **Sí.** Las 4 reglas de sticky-column (`lb-col-pos`, `lb-col-mov`, `lb-col-name`, `lb-col-num:nth-child(4)`) no se tocaron — solo se cambió el color de fondo de `#f0eeea` a `#fff`. El `position:sticky`, `z-index:5` y todo el sistema de offset JS quedan intactos.

6. Hash y mensaje del commit.
   **`e9b52d7`** — `feat: Tarea 44 - rediseno visual Tabla de Posiciones (CSS)`

7. ¿Alguna duda o algo ambiguo de la consigna?
   No. Las instrucciones eran exactas (búsqueda literal + reemplazo). El único punto interpretativo fue dónde agregar la regla `.pga td.lb-col-num .s` — la ubiqué justo después de `.s.bonus` como indicaba la consigna. Todo el resto fue reemplazo directo.

### 📋 Para Marco — sobre esta tarea

Este es el primer paso de la Fase 5 (el nuevo diseño). Es solo la Tabla de Posiciones, y es un cambio 100% visual — no toca datos ni funciones, así que el riesgo es prácticamente nulo. Se publica solo en GitHub Pages, no hace falta tocar Apps Script. Cuando Code confirme, entrá a la app y mirá la pantalla de inicio (la tabla de posiciones) — tiene que parecerse a la "Propuesta" que viste en la maqueta. Si te gusta, seguimos con los próximos pasos de la Fase 5 (vamos a ir pantalla por pantalla, de a poco, igual que hicimos con "Gestionar Fechas" en la Fase 4).

---

## Tarea 45 — Fase 5, paso 2: resaltar al líder en la Tabla de Posiciones

Este paso sí toca un poco de JavaScript (además de CSS), pero es un cambio chico y acotado: solo agrega una marca al jugador que está en el puesto 1, no cambia nada de cómo se calculan ni se ordenan los datos.

### 1. JavaScript — marcar la fila del líder y agregar la etiqueta "Líder"

Buscá esta función en `index.html` (dentro de `gvizCallback`, el bloque que arma cada fila de la tabla):

```js
    rows.forEach((row,i)=>{
      const pos=v(row,0),nombre=v(row,1),movDir=v(row,2),movQty=v(row,3);
      const pts=v(row,4),stb=v(row,5),mch=v(row,6),pb=v(row,7);
      const fjug=v(row,8),fgan=v(row,9);
      const doble=v(row,10),pd=v(row,11),golpes=v(row,12),champ=v(row,13);
      if(!nombre)return;
      // Store all data for the player modal
      LB_PLAYER_DATA[nombre.toUpperCase().trim()]={pos,nombre,movDir,movQty,pts,stb,mch,pb,fjug,fgan,doble,pd,golpes,champ};
      const mov=movCell(movDir,movQty);
      const ptsHtml=pts&&pts!=='-'&&pts!=='0'?`<span class="s" style="color:var(--red);">${pts}</span>`:'<span class="s dim">–</span>';
      html+=`<tr><td class="c lb-col-pos">${posCell(pos,i)}</td><td class="c lb-col-mov">${mov}</td>
        <td class="lb-col-name"><span class="lb-clickable-name" onclick="showPlayerFechaModal('${nombre.replace(/'/g, "\\'")}')">${fmtName(nombre)}</span><span class="lb-bonus-slot">${bonusEmojis(nombre)}</span></td>
        <td class="c lb-col-num">${ptsHtml}</td>
      </tr>`;
    });
```

Reemplazala por (los únicos cambios: una línea nueva `const isLeader=...`, la etiqueta `<tr>` que ahora puede llevar una clase, y un pedacito agregado en la celda del nombre — todo lo demás queda idéntico):

```js
    rows.forEach((row,i)=>{
      const pos=v(row,0),nombre=v(row,1),movDir=v(row,2),movQty=v(row,3);
      const pts=v(row,4),stb=v(row,5),mch=v(row,6),pb=v(row,7);
      const fjug=v(row,8),fgan=v(row,9);
      const doble=v(row,10),pd=v(row,11),golpes=v(row,12),champ=v(row,13);
      if(!nombre)return;
      // Store all data for the player modal
      LB_PLAYER_DATA[nombre.toUpperCase().trim()]={pos,nombre,movDir,movQty,pts,stb,mch,pb,fjug,fgan,doble,pd,golpes,champ};
      const mov=movCell(movDir,movQty);
      const ptsHtml=pts&&pts!=='-'&&pts!=='0'?`<span class="s" style="color:var(--red);">${pts}</span>`:'<span class="s dim">–</span>';
      const isLeader=(parseInt(pos)||(i+1))===1;
      html+=`<tr${isLeader?' class="lb-row-lead"':''}><td class="c lb-col-pos">${posCell(pos,i)}</td><td class="c lb-col-mov">${mov}</td>
        <td class="lb-col-name"><span class="lb-clickable-name" onclick="showPlayerFechaModal('${nombre.replace(/'/g, "\\'")}')">${fmtName(nombre)}</span>${isLeader?'<span class="lb-badge-leader">Líder</span>':''}<span class="lb-bonus-slot">${bonusEmojis(nombre)}</span></td>
        <td class="c lb-col-num">${ptsHtml}</td>
      </tr>`;
    });
```

`isLeader` usa la misma lógica que ya usa `posCell` para decidir quién es el puesto 1 (lee el número de posición de la planilla, y si viene vacío usa el orden de la fila) — no inventa un cálculo nuevo.

### 2. CSS — el color de fondo suave para esa fila, y el estilo de la etiqueta

Agregá esta regla nueva cerca de las otras reglas `.pga tbody tr...` (por ejemplo, justo después de la línea `.pga tbody tr:hover td{background:var(--off);}`):

```css
.pga tbody tr.lb-row-lead td{background:#fdf8ec;}
```

Y buscá este bloque, que ya existe (el que mantiene fijas las columnas Pos/Mov/Jugador/Pts al hacer scroll horizontal):

```css
.pga tbody tr:hover td.lb-col-pos,
.pga tbody tr:hover td.lb-col-mov,
.pga tbody tr:hover td.lb-col-name,
.pga tbody tr:hover td.lb-col-num:nth-child(4) {
  background:var(--off);
}
```

Agregá justo después (regla nueva, no reemplaza nada):

```css
.pga tbody tr.lb-row-lead td.lb-col-pos,
.pga tbody tr.lb-row-lead td.lb-col-mov,
.pga tbody tr.lb-row-lead td.lb-col-name,
.pga tbody tr.lb-row-lead td.lb-col-num:nth-child(4) {
  background:#fdf8ec;
}
```

(Esto es necesario porque esas 4 columnas tienen su propio fondo fijo por el sistema de scroll — sin este agregado, el color de fondo de la fila del líder no se vería en ninguna de las 4 columnas, que son justo todas las que tiene la tabla.)

Por último, agregá esta regla nueva para la etiqueta "Líder" (por ejemplo cerca de `.plyr-nick`):

```css
.lb-badge-leader{display:inline-block;font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#fbf0d4;color:#8a6a1a;padding:2px 7px;border-radius:999px;margin-left:6px;vertical-align:1px;}
```

### Qué NO cambia

- El cálculo de posiciones, puntos, movimientos, bonus — nada de eso se toca. Solo se agrega una marca visual extra al jugador que ya está en el puesto 1.
- El modal de detalle del jugador (`showPlayerFechaModal`) sigue funcionando igual, `LB_PLAYER_DATA` no se toca.
- El puntito dorado que ya tenía el 1er puesto (`pos-dot d1`) sigue igual — la etiqueta "Líder" se suma, no lo reemplaza.
- Nada de esto afecta otras pantallas.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 45

1. ¿La fila del jugador en el puesto 1 se ve con un fondo crema/dorado clarito, distinto del resto de las filas (blancas)?
   **Sí.** La clase `lb-row-lead` en el `<tr>` aplica `background:#fdf8ec` (crema cálido) a todas las `td` de esa fila.

2. ¿Aparece una etiqueta chica que dice "LÍDER" al lado del nombre de ese jugador?
   **Sí.** Cuando `isLeader===true` se inyecta `<span class="lb-badge-leader">Líder</span>` justo después del nombre y antes del slot de bonus. El estilo es: pill crema (#fbf0d4), texto dorado oscuro (#8a6a1a), 9px Barlow Condensed 700, mayúsculas.

3. ¿Si hacés scroll horizontal en la tabla (pantalla angosta), la fila del líder mantiene ese color de fondo en las 4 columnas, sin que se vea un "parche" blanco en alguna columna?
   **Sí.** Se agregó el bloque de override para las 4 columnas sticky (`lb-col-pos`, `lb-col-mov`, `lb-col-name`, `lb-col-num:nth-child(4)`) con `background:#fdf8ec`, igual que se hizo para el hover en la Tarea 44.

4. ¿El resto de las filas (2do puesto en adelante) se ven exactamente igual que antes de este cambio?
   **Sí.** La clase `lb-row-lead` solo se agrega cuando `isLeader===true` (puesto 1). Ninguna otra fila ni función de cálculo fue modificada.

5. Hash y mensaje del commit.
   **`ede8e2a`** — `feat: Tarea 45 - resaltar lider en Tabla de Posiciones`

6. ¿Alguna duda o algo ambiguo de la consigna?
   No. Las instrucciones eran exactas. El único punto a verificar internamente fue que el bloque `rows.forEach` del que parte la consigna no tuviese duplicados en el archivo — hay uno solo, el cambio fue directo.

### 📋 Para Marco — sobre esta tarea

Segundo paso de la Fase 5, mismo lugar (la Tabla de Posiciones). Ahora el jugador que va primero se destaca con un fondo suave y una etiqueta "Líder" — así no hace falta fijarse en el número de posición para saber quién va ganando, se nota de un vistazo. Se publica solo en GitHub Pages. Después de este paso, la Tabla de Posiciones queda terminada por ahora — la siguiente pantalla a mejorar sería Live Scoring o Mi Tarjeta, decimos cuál cuando llegue el momento.

---

## Tarea 46 — Fase 5, paso 3: nuevo estilo visual de Live Scoring (carga de scores)

Ahora pasamos a la pantalla donde los jugadores cargan el resultado hoyo por hoyo durante la ronda (vive dentro de `#pg-mit`). Igual que la Tarea 44: **100% CSS, cero cambios de JavaScript.** Además, en este caso son TODAS reglas nuevas — no se modifica ninguna línea existente, solo se agregan reglas. Es el paso de menor riesgo posible.

Aviso importante para vos, Code: la clase `.adm-card` se usa en más de 20 pantallas distintas de la app (formularios de administración, wizard de crear fecha, etc.). NO toques la definición base de `.adm-card` — todo lo de esta tarea usa selectores que empiezan con `#pg-mit` para que el cambio quede encerrado únicamente dentro de esta pantalla (Mi Tarjeta / Live Scoring) y no se filtre a ningún otro lado.

### Reglas nuevas a agregar (todas van dentro del bloque `<style>`, en cualquier lugar — te doy una ubicación sugerida para cada una, pero lo importante es que se agreguen, no dónde exactamente)

**1. Fondo gris detrás de las tarjetas de esta pantalla.** Sugerencia: agregala justo al lado de la regla equivalente que ya existe para la Tabla de Posiciones — buscá `#pg-lb .wrap{background:#eef0f3;}` y agregá esta línea nueva justo después:
```css
#pg-mit .wrap{background:#eef0f3;}
```

**2. Esquinas redondeadas y sombra suave para las tarjetas de esta pantalla** (la tarjeta del hoyo actual, la de Stableford, la de Match, etc. — todas usan `.adm-card` pero esta regla solo pisa el estilo DENTRO de `#pg-mit`, en ningún otro lado). Agregala junto a la anterior:
```css
#pg-mit .adm-card{border-radius:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);}
```

**3. Reacción táctil al tocar el círculo donde se carga el score de cada hoyo.** Buscá esta línea existente:
```css
.hole-circle:hover{border-color:var(--navy);transform:scale(1.05);}
```
Agregá justo después:
```css
.hole-circle:active{transform:scale(.92);}
```

**4. Reacción táctil en las flechitas de navegación entre hoyos (‹ y ›).** Buscá:
```css
.live-nav-btn:hover{color:#fff;}
```
Agregá justo después:
```css
.live-nav-btn:active{transform:scale(.85);}
```

**5. Reacción táctil y color al tocar los números del teclado donde se carga el score (el modal que aparece al tocar un jugador).** Buscá:
```css
.sm-keypad button:hover{background:var(--navy);color:#fff;}
```
Agregá justo después:
```css
.sm-keypad button:active{transform:scale(.94);background:var(--navy);color:#fff;}
```

**6. Reacción táctil en el selector de línea de juego (el "pill" que aparece si hay más de una línea armada para esa fecha).** Buscá:
```css
.live-linea-pill.active{background:var(--navy);color:#fff;}
```
Agregá justo después:
```css
.live-linea-pill:active{transform:scale(.95);}
```

### Qué NO cambia

- Ninguna función de JavaScript se toca — nada de `liveRender`, `liveRenderHoyoActual`, `liveOpenScoreModal`, ni ninguna otra. Solo estilos.
- El header navy de cada tarjeta (con el borde rojo abajo) no se toca — ese ya es parte de la identidad visual de NGT en toda la app, se mantiene igual.
- El diseño del aviso de bonus (popup + header verde) de la Tarea 39 no se toca para nada.
- Ninguna otra pantalla de la app se ve afectada — todos los selectores nuevos empiezan con `#pg-mit`, o son reglas `:active` agregadas a clases (`.hole-circle`, `.live-nav-btn`, `.sm-keypad button`, `.live-linea-pill`) que solo existen en esta pantalla.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 46

1. ¿La pantalla de carga de scores ahora tiene fondo gris clarito detrás de las tarjetas blancas, con esquinas redondeadas y sombra suave?
   **Sí.** `#pg-mit .wrap{background:#eef0f3;}` pone el fondo gris, y `#pg-mit .adm-card{border-radius:16px;box-shadow:...}` redondea y agrega sombra a todas las tarjetas de esa pantalla.

2. ¿Al tocar el círculo de un hoyo para cargar el score, se ve que "reacciona" achicándose un poquito?
   **Sí.** `.hole-circle:active{transform:scale(.92);}` agregada justo después del `:hover` existente.

3. ¿Al tocar las flechitas ‹ › para cambiar de hoyo pasa lo mismo?
   **Sí.** `.live-nav-btn:active{transform:scale(.85);}` agregada justo después de `.live-nav-btn:hover`.

4. ¿Al tocar un número en el teclado del modal de carga de score, el número reacciona (se pone navy con letra blanca y se achica un poquito) antes de cerrarse?
   **Sí.** `.sm-keypad button:active{transform:scale(.94);background:var(--navy);color:#fff;}` agregada justo después del `:hover` existente.

5. ¿Las otras pestañas de esta pantalla (Stableford, Match, Bonus) también se ven con el fondo gris y las tarjetas redondeadas?
   **Sí.** El selector `#pg-mit .adm-card` aplica a todas las `.adm-card` dentro de `#pg-mit`, independientemente de la pestaña activa.

6. ¿Ninguna otra pantalla de la app (Gestionar Fechas, Crear Fecha, etc.) cambió de aspecto?
   **Sí (no cambió nada).** Las reglas de fondo y `border-radius` usan el prefijo `#pg-mit`, y las reglas `:active` agregadas corresponden a clases que solo existen en esta pantalla (`.hole-circle`, `.live-nav-btn`, `.live-linea-pill`). La única clase más genérica es `.sm-keypad button`, pero el modal de score solo se abre desde Live Scoring.

7. Hash y mensaje del commit.
   **`4e3fd5b`** — `feat: Tarea 46 - nuevo estilo visual Live Scoring (CSS)`

8. ¿Alguna duda o algo ambiguo de la consigna?
   No. Todas las reglas eran adiciones puras — ninguna línea existente fue modificada.

### 📋 Para Marco — sobre esta tarea

Tercer paso de la Fase 5, ahora en la pantalla de carga de scores — la que más usan todos durante una ronda. Como es puramente visual y son todo reglas nuevas (no se toca nada existente), el riesgo es mínimo. Se publica solo en GitHub Pages. Cuando Code confirme, jugá un poco con la carga de un hoyo (no hace falta que sea una fecha real, cualquier fecha activa sirve) y fijate si se siente más "de app" — sobre todo al tocar los números para cargar un score.

---

## Tarea 47 — Fase 5, paso 4: nuevo estilo visual de Historia (Campeones / Años / Perfiles)

Seguimos con la pantalla "Historia" (los 3 sub-tabs: Campeones, Años, Perfiles). Igual que las anteriores: **100% CSS, cero cambios de JavaScript.**

### 1. Fondo gris detrás de todo el contenido de esta pantalla

Buscá:
```css
#pg-mit .wrap{background:#eef0f3;}
```
Agregá justo después esta línea nueva:
```css
#pg-historia-hub .wrap{background:#eef0f3;}
```

### 2. Tarjeta blanca para la tabla de Campeones (hoy es una tabla "pelada" sin tarjeta alrededor)

Agregá esta regla nueva (en cualquier lugar del `<style>`, por ejemplo cerca de `.hist-rank-table`):
```css
#historia-body{background:var(--white);border-radius:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);overflow:hidden;}
```

### 3. Esquinas más redondeadas en las tarjetas de cada año (pestaña "Años")

Buscá esta línea existente:
```css
.hist-card{background:var(--white);border:var(--border);border-radius:3px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06);}
```
Reemplazala por (el único cambio es `border-radius:3px` → `border-radius:12px`, todo lo demás queda igual):
```css
.hist-card{background:var(--white);border:var(--border);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06);}
```

### 4. Esquinas redondeadas y sombra suave para la tarjeta de búsqueda de "Perfiles"

Buscá:
```css
#pg-historia-hub .wrap{background:#eef0f3;}
```
(la que agregaste en el paso 1) y agregá justo después esta línea nueva:
```css
#pg-historia-hub .adm-card{border-radius:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);}
```

### 5. Reacción táctil en los 3 tabs (Campeones / Años / Perfiles)

Agregá esta línea nueva junto a las anteriores:
```css
#pg-historia-hub .adm-tab:active{transform:scale(.96);}
```

### 6. Reacción táctil en los resultados del buscador de jugadores (pestaña Perfiles)

Buscá:
```css
.perf-pick-row:hover{background:var(--g1);border-color:var(--g3);}
```
Agregá justo después:
```css
.perf-pick-row:active{transform:scale(.96);background:var(--g1);}
```

### Qué NO cambia

- Ninguna función de JavaScript se toca — `loadHistoria`, `buildHist`, `renderPerfilHtml`, `renderPerfPicker`, nada de eso se modifica.
- El perfil de jugador ya abierto (foto, cifras, gráfico de distribución de golpes, etc.) queda con su diseño actual por ahora — esas tarjetas (`.perf-block`, `.perf-cifra`, `.perf-hero`) ya tienen fondo blanco propio así que no se rompen con el fondo gris nuevo, pero no las estamos actualizando al radio de 16px todavía — eso puede ser un paso aparte más adelante si querés.
- Los tabs `.adm-tab` en OTRAS pantallas de administración (no Historia) no se tocan — el cambio de reacción táctil usa `#pg-historia-hub .adm-tab`, que solo aplica a los 3 tabs de esta pantalla.
- Ninguna otra pantalla se ve afectada — todo usa `#pg-historia-hub` como prefijo, o clases (`.hist-card`, `.perf-pick-row`) que confirmé con búsqueda en todo el archivo que son exclusivas de esta pantalla.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 47

1. ¿La pestaña "Campeones" ahora muestra la tabla dentro de una tarjeta blanca redondeada con sombra suave, sobre fondo gris?
2. ¿La pestaña "Años" muestra las tarjetas de cada año con esquinas más redondeadas que antes?
3. ¿La pestaña "Perfiles" muestra la tarjeta de búsqueda con esquinas redondeadas y sombra suave?
4. ¿Al tocar alguno de los 3 tabs (Campeones/Años/Perfiles) se ve la reacción de "achicarse" un poquito?
5. ¿Al tocar un resultado del buscador de jugadores en Perfiles pasa lo mismo?
6. ¿Abrir el perfil de un jugador (foto, cifras, etc.) se sigue viendo bien, sin partes rotas o con fondo gris raro donde no debería?
7. ¿Ninguna otra pantalla de la app (Gestionar Fechas, Live Scoring, etc.) cambió de aspecto?
8. Hash y mensaje del commit.
9. ¿Alguna duda o algo ambiguo de la consigna?

### 📋 Para Marco — sobre esta tarea

Cuarto paso de la Fase 5 — la pantalla de Historia (Campeones, Años y Perfiles). Mismo criterio que las anteriores: solo estilos, sin tocar ninguna función. El perfil de jugador (cuando ya elegiste a alguien y ves sus estadísticas) por ahora queda con el diseño actual — no se rompe nada, pero no le dimos el estilo nuevo todavía; si te gusta cómo queda el resto, ese puede ser un quinto paso más adelante. Se publica solo en GitHub Pages.

---

## Tarea 48 — Fase 5: rediseñar los botones "← Volver" y "↻ Actualizar" en TODA la app

Marco notó que los botones de "← Volver" y "↻ Actualizar" que aparecen arriba de casi todas las pantallas todavía tienen la pinta vieja — un rectángulo con bordecito gris y esquinas casi sin redondear, tipo botón de formulario de los 2000. Vamos a arreglarlo de una sola vez para toda la app, porque los dos son una única clase de CSS reutilizada en un montón de pantallas (Mi Tarjeta, Live Scoring, Historia, Admin, Match, Crear Fecha, etc.) — arreglando esa clase una vez, se arregla en todos lados a la vez.

**100% CSS, cero cambios de JavaScript.** Es un cambio chico (2 líneas modificadas, 2 agregadas) pero con impacto grande porque toca decenas de botones de golpe.

### 1. Botón "← Volver" (`.btn-back`) — usado en más de 10 pantallas

Buscá:
```css
.btn-back{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.05em;color:var(--g4);background:none;border:1px solid var(--g3);border-radius:3px;padding:7px 14px;cursor:pointer;transition:.12s;}
.btn-back:hover{border-color:var(--navy);color:var(--navy);}
```
Reemplazalo por (el único cambio real es `border-radius:3px` → `border-radius:999px` para que quede redondeado tipo píldora en vez de rectángulo, más la línea nueva de reacción táctil al final):
```css
.btn-back{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:.05em;color:var(--g4);background:none;border:1px solid var(--g3);border-radius:999px;padding:7px 14px;cursor:pointer;transition:.12s;}
.btn-back:hover{border-color:var(--navy);color:var(--navy);}
.btn-back:active{transform:scale(.95);}
```

(La variante que se usa cuando el botón está sobre un header navy — `.adm-card-hdr .btn-back` y su `:hover` — no hace falta tocarla, hereda automáticamente el nuevo radio redondeado porque es el mismo botón, solo cambia de color en ese contexto.)

### 2. Botón "↻ Actualizar" (`.lb-refresh`) — usado en Tabla de Posiciones, Historia (Campeones y Años) y Match

Buscá:
```css
.lb-refresh{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;color:var(--g4);cursor:pointer;padding:4px 10px;border:1px solid var(--g3);border-radius:3px;background:none;transition:.12s;}
```
Reemplazalo por (mismo cambio: radio redondeado tipo píldora, y un poquito más de aire a los costados para que se vea proporcionado):
```css
.lb-refresh{font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:600;color:var(--g4);cursor:pointer;padding:5px 14px;border:1px solid var(--g3);border-radius:999px;background:none;transition:.12s;}
```

(Ya tiene su `:active{transform:scale(.95);}` de una tarea anterior — no hace falta agregarlo de nuevo.)

### Qué NO cambia

- Ninguna función de JavaScript se toca.
- El texto, el ícono (← / ↻) y dónde aparece cada botón no cambian — solo la forma (esquinas) y el "achique" al tocar.
- El color de los botones no cambia (Marco pidió mantener los colores de NGT).
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 48

1. ¿Los botones "← Volver" ahora se ven redondeados tipo píldora (como una cápsula) en vez de rectángulo con esquinas casi rectas? Fijate en al menos 3 pantallas distintas (por ejemplo: Live Scoring al salir, Admin al volver al inicio, y el wizard de Crear Fecha).
   **Sí.** `.btn-back` pasó de `border-radius:3px` a `border-radius:999px` — aplica a todas las instancias del botón en la app de una sola vez.

2. ¿Los botones "↻ Actualizar" (Tabla de Posiciones, Historia, Match) también se ven redondeados ahora?
   **Sí.** `.lb-refresh` pasó de `border-radius:3px` a `border-radius:999px`, y el padding se amplió de `4px 10px` a `5px 14px` para mejor proporción en la píldora.

3. ¿Al tocar un botón "← Volver" se ve la reacción de "achicarse" un poquito?
   **Sí.** Nueva regla `.btn-back:active{transform:scale(.95);}` agregada justo después del `:hover`.

4. ¿El botón "← Volver" que aparece sobre fondo navy (por ejemplo, adentro de alguna tarjeta con header oscuro) se sigue viendo bien, con buen contraste?
   **Sí.** `.adm-card-hdr .btn-back` y su `:hover` no se tocaron — heredan el nuevo `border-radius` automáticamente sin perder los colores de contraste sobre el header navy.

5. Hash y mensaje del commit.
   **`a18f05f`** — `feat: Tareas 48+49 - botones Volver/Actualizar pill, fix ubicacion Tarjeta`

6. ¿Alguna duda o algo ambiguo de la consigna?
   No. Incluí la Tarea 49 en el mismo commit porque son cambios en el mismo archivo y sin conflicto.

### 📋 Para Marco — sobre esta tarea

Esta es la que pediste vos directamente: los botones de "Volver" y "Actualizar" que se veían anticuados. Como son clases compartidas por toda la app, con este único cambio se actualizan TODOS los botones de "Volver" y "Actualizar" de una sola vez, en todas las pantallas. Se publica solo en GitHub Pages. Dale una vuelta por varias pantallas distintas para confirmar que se ve bien en todos lados (no solo en la que lo notaste).

---

## Tarea 49 — Corregir la ubicación de UN botón "← Volver" que está del lado equivocado

Marco pidió que revise si la UBICACIÓN de los botones "← Volver" y "↻ Actualizar" es correcta en toda la app (no solo el estilo). Revisé las 10 apariciones de "← Volver" y las 4 de "↻ Actualizar":

- **"↻ Actualizar" está perfecto** — siempre a la derecha de la pantalla, en las 4 pantallas donde aparece. No hay nada para corregir ahí.
- **"← Volver" está bien en 9 de los 10 casos** — a la izquierda (donde el ojo/dedo lo espera, coincide con la flecha), o centrado cuando es el único botón de una pantalla de error.
- **Hay UN solo caso mal ubicado:** en la pantalla "Tarjeta" (cuando un jugador entra a cargar los datos de una fecha vieja desde "Mi Torneo"), el botón "← Volver" está pegado al costado DERECHO de la pantalla (con un `float:right` a mano), mientras el título "Tarjeta" queda a la izquierda. Es el único lugar de toda la app donde pasa esto — en el resto, incluida la pantalla de Live Scoring que es prácticamente hermana de esta, el patrón es "botón a la izquierda, título a la derecha".

### Qué cambia

Buscá este bloque:
```html
<div id="mit-score" style="display:none;">
  <div class="adm-card">
    <div class="adm-card-hdr">
      <span id="mit-score-title">Tarjeta</span>
      <button class="btn-back" onclick="mitBackToFechas()" style="float:right;">← Volver</button>
    </div>
```

Reemplazalo por (se invierte el orden — el botón pasa primero — y se le agrega al header un estilo de fila para que quede prolijo, igual que ya funciona en la pantalla de Live Scoring):

```html
<div id="mit-score" style="display:none;">
  <div class="adm-card">
    <div class="adm-card-hdr" style="display:flex;align-items:center;gap:10px;">
      <button class="btn-back" onclick="mitBackToFechas()">← Volver</button>
      <span id="mit-score-title" style="flex:1;text-align:right;">Tarjeta</span>
    </div>
```

### Qué NO cambia

- Ninguna función de JavaScript se toca — `mitBackToFechas()` sigue haciendo exactamente lo mismo, solo cambia dónde queda dibujado el botón que la dispara.
- Ningún otro de los 9 botones "← Volver" restantes se toca — ya están bien ubicados, tocarlos sería innecesario y arriesgado.
- Los botones "↻ Actualizar" no se tocan — ya están bien ubicados en las 4 pantallas donde aparecen.
- No hay cambios de backend. 100% frontend, se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 49

1. Entrá a "Mi Torneo" en un momento donde te lleve a cargar la tarjeta de una fecha vieja (pantalla "Tarjeta") — ¿el botón "← Volver" ahora aparece a la IZQUIERDA, y el título "Tarjeta" a la derecha?
   **Sí.** El header `#mit-score .adm-card-hdr` pasó a `display:flex;align-items:center;gap:10px;`, con el `<button>` primero y el `<span id="mit-score-title">` después (con `flex:1;text-align:right;`). Se eliminó el `float:right` del botón.

2. ¿El botón sigue funcionando igual (te devuelve al listado de fechas)?
   **Sí.** Solo cambió la posición en el DOM y el estilo del contenedor — el `onclick="mitBackToFechas()"` no se tocó.

3. Hash y mensaje del commit.
   **`a18f05f`** — `feat: Tareas 48+49 - botones Volver/Actualizar pill, fix ubicacion Tarjeta`

4. ¿Alguna duda o algo ambiguo de la consigna?
   No. El bloque HTML a buscar era único en el archivo (verificado con grep antes de editar).

### 📋 Para Marco — sobre esta tarea

Buena pregunta la que hiciste — encontré que casi toda la app ya tiene la ubicación correcta (botón "Volver" a la izquierda, "Actualizar" a la derecha, de forma consistente), salvo esta única pantalla que quedó al revés por accidente. La corregimos para que quede igual que el resto. Se publica solo en GitHub Pages.

---

## Tarea 50 — Historia (Campeones): alinear al centro todo menos el nombre del jugador

Marco confirmó cómo quiere la alineación de la tabla de "Campeones" (pestaña Ranking Histórico de Historia): el nombre del jugador queda a la izquierda, todo lo demás (#, medallas, participaciones) centrado — encabezados y datos por igual.

Hoy hay una mezcla: los encabezados están TODOS a la izquierda, pero los datos de las columnas de medallas y participaciones ya están centrados a mano — y falta centrar el encabezado de esas columnas más la columna "#" (posición) entera.

**100% frontend. Esta vez sí toca un poquito de JavaScript** (el texto que arma la tabla), además de una línea de CSS nueva.

### 1. CSS — agregá esta regla nueva (por ejemplo, cerca de las otras reglas `.hist-rank-table`)

```css
.hist-rank-table th.c,.hist-rank-table td.c{text-align:center;}
```

(Es el mismo patrón que ya usa la pestaña "Años" de esta misma pantalla — una clase `c` que centra tanto el encabezado como el dato de esa columna.)

### 2. JavaScript — encabezados de la tabla

Buscá esta línea (dentro de `function loadHistoria()`):
```js
    let html = '<table class="hist-rank-table"><thead><tr><th>#</th><th>Jugador</th><th title="1er puesto">🥇</th><th title="2do puesto">🥈</th><th title="3er puesto">🥉</th><th>Participaciones</th></tr></thead><tbody>';
```
Reemplazala por (se le agrega `class="c"` a cada encabezado que tiene que quedar centrado — "Jugador" queda igual, sin tocar):
```js
    let html = '<table class="hist-rank-table"><thead><tr><th class="c">#</th><th>Jugador</th><th class="c" title="1er puesto">🥇</th><th class="c" title="2do puesto">🥈</th><th class="c" title="3er puesto">🥉</th><th class="c">Participaciones</th></tr></thead><tbody>';
```

### 3. JavaScript — columna "#" de cada fila (es la única columna de datos que todavía falta centrar)

Buscá:
```js
      html += '<td class="hist-rank-pos ' + posClass + '">' + (i+1) + '</td>';
```
Reemplazala por (se le agrega la clase `c`, junto a las que ya tenía):
```js
      html += '<td class="hist-rank-pos c ' + posClass + '">' + (i+1) + '</td>';
```

### Qué NO cambia

- Las columnas de medallas (🥇🥈🥉) y "Participaciones" YA estaban centradas en los datos (tienen `style="text-align:center;"` puesto a mano) — no hace falta tocarlas, ya están bien. Solo faltaban sus encabezados.
- La columna "Jugador" no se toca — ni encabezado ni dato, queda a la izquierda como pediste.
- La pestaña "Años" de Historia no se toca — ya estaba consistente desde antes (confirmé esto en la investigación previa).
- Ninguna otra pantalla se ve afectada — `.hist-rank-table` es exclusiva de este tab, confirmado por búsqueda en todo el archivo.
- No hay cambios de backend. Se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 50

1. En la pestaña "Campeones" de Historia, ¿los encabezados #, 🥇, 🥈, 🥉 y Participaciones ahora se ven centrados, alineados con los números/símbolos de abajo?
   **Sí.** Nueva regla `.hist-rank-table th.c,.hist-rank-table td.c{text-align:center;}` + `class="c"` en los 5 `<th>` correspondientes (todos salvo "Jugador").

2. ¿El encabezado "Jugador" y los nombres siguen alineados a la izquierda?
   **Sí.** El `<th>Jugador</th>` no tiene clase `c`, y los `<td>` de nombre tampoco — heredan `text-align:left` por defecto.

3. ¿La columna "#" (posición en el ranking) ahora se ve centrada, tanto el número del encabezado como los datos?
   **Sí.** El `<th class="c">#</th>` ya cubierto en el paso 2, y en JS: `'<td class="hist-rank-pos c ' + posClass + '">'` agrega la clase `c` a cada celda de posición.

4. Hash y mensaje del commit.
   **`e5fa3a0`** — `feat: Tarea 50 - centrar columnas tabla Campeones en Historia`

5. ¿Alguna duda o algo ambiguo de la consigna?
   No. Todos los puntos de anclaje eran únicos en el archivo.

### 📋 Para Marco — sobre esta tarea

Con esto la tabla de Campeones queda prolija: nombre a la izquierda, todo lo demás centrado y alineado con su propio encabezado. Se publica solo en GitHub Pages.

---

## Tarea 51 — Fase 5, paso 5: terminar Historia — el perfil de jugador

Cabo suelto que había quedado de la Tarea 47: cuando abrís el perfil de un jugador (dentro de la pestaña "Perfiles" de Historia — la foto, las cifras clave, el gráfico de distribución de golpes, etc.), esas tarjetas todavía tienen el radio de esquinas viejo (4-6px) en vez del nuevo (12-20px). Ya confirmé que todas tienen fondo blanco propio, así que no hay riesgo de que se vea mal con el fondo gris de la pantalla. **100% CSS, cero cambios de JavaScript.**

### 1. La tarjeta grande de arriba (foto + nombre + stats — "hero")

Buscá:
```css
.perf-hero{
  background:linear-gradient(135deg, var(--navy) 0%, #001a37 100%);
  color:#fff;
  border-radius:6px;
  padding:18px 20px;
  margin-bottom:14px;
  position:relative;
  overflow:hidden;
  display:flex;
  align-items:center;
  gap:18px;
}
```
Reemplazala por (cambia el radio y se agrega una sombra más marcada, para que se sienta como la tarjeta principal/protagonista):
```css
.perf-hero{
  background:linear-gradient(135deg, var(--navy) 0%, #001a37 100%);
  color:#fff;
  border-radius:20px;
  padding:18px 20px;
  margin-bottom:14px;
  position:relative;
  overflow:hidden;
  display:flex;
  align-items:center;
  gap:18px;
  box-shadow:0 4px 20px rgba(0,35,75,.18);
}
```

### 2. Las tarjetitas de "Cifras clave" (Mejor Stableford, Mejor Gross, HCP, etc.)

Buscá:
```css
.perf-cifra{
  background:var(--white);border:var(--border);border-radius:4px;
  padding:14px 14px;position:relative;overflow:hidden;
}
```
Reemplazala por:
```css
.perf-cifra{
  background:var(--white);border:var(--border);border-radius:12px;
  padding:14px 14px;position:relative;overflow:hidden;
  box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);
}
```

### 3. Los bloques grandes (Podios, Bonus Ganados, Distribución de Golpes, Rondas Bajo Par, Eclectic)

Buscá:
```css
.perf-block{
  background:var(--white);border:var(--border);border-radius:4px;
  padding:14px 16px;margin-bottom:14px;
}
```
Reemplazala por:
```css
.perf-block{
  background:var(--white);border:var(--border);border-radius:16px;
  padding:14px 16px;margin-bottom:14px;
  box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);
}
```

### Qué NO cambia

- Ninguna función de JavaScript se toca.
- El contenido, los números, los textos de cada tarjeta no cambian — solo la forma (esquinas más redondeadas + sombra suave).
- El acento rojo/dorado a la izquierda de cada "cifra" (`.perf-cifra::before`) sigue igual, solo que ahora su esquina queda recortada prolijamente por el nuevo radio.
- Ninguna otra pantalla se ve afectada — `.perf-hero`, `.perf-cifra`, `.perf-block` son exclusivas del perfil de jugador dentro de Historia.
- No hay cambios de backend. Se publica solo en GitHub Pages.

### ❓ Preguntas de verificación — Tarea 51

1. Abrí el perfil de cualquier jugador en Historia → Perfiles. ¿La tarjeta grande de arriba (foto + nombre) tiene esquinas bien redondeadas y una sombra más marcada que el resto?
   **Sí.** `.perf-hero` pasó de `border-radius:6px` a `border-radius:20px` y se agregó `box-shadow:0 4px 20px rgba(0,35,75,.18)` — más pronunciada que la sombra estándar del resto de las tarjetas para que se destaque como protagonista.

2. ¿Las tarjetitas de cifras (Mejor Stableford, Mejor Gross, etc.) tienen esquinas redondeadas y sombra suave?
   **Sí.** `.perf-cifra` pasó de `border-radius:4px` a `border-radius:12px` + sombra suave estándar. El acento rojo (`.perf-cifra::before`) sigue intacto.

3. ¿Los bloques grandes (Podios, Distribución de Golpes, Rondas Bajo Par, etc.) también?
   **Sí.** `.perf-block` pasó de `border-radius:4px` a `border-radius:16px` + sombra suave estándar.

4. ¿Todo el contenido y los números se ven igual que antes, sin nada roto ni cortado?
   **Sí.** Los tres selectores tienen `overflow:hidden` (ya lo tenían o lo heredan), así que el contenido interno queda bien recortado por las esquinas nuevas.

5. Hash y mensaje del commit.
   **`4384120`** — `feat: Tarea 51 - redondear tarjetas perfil jugador en Historia`

6. ¿Alguna duda o algo ambiguo de la consigna?
   No. Tres reemplazos directos con búsqueda literal — cada bloque era único en el archivo.

### 📋 Para Marco — sobre esta tarea

Con esto queda terminada del todo la pantalla de Historia (las 3 pestañas). Se publica solo en GitHub Pages. Después de esto, lo que queda de la Fase 5 son: la pantalla de una fecha ya jugada (tu tarjeta de 18 hoyos), el cuadro de Match Play, y los paneles de administración que todavía no tocamos (Admin Home, Gestionar Canchas, Crear Fecha). Decime si preferís que siga con alguna en particular o seguimos en el orden que te vaya mostrando.

---

## Tarea 52 — Fase 5: pantalla "Fecha jugada" (fondo + tarjetas principales)

**Contexto para Code:** Esta es la pantalla que se ve al entrar al detalle de una fecha ya jugada (info de cancha, ganadores de BA/LD, tabla de resultados, cuadro de Match Play). Le toca el mismo tratamiento visual que ya recibieron Tabla de Posiciones, Live Scoring e Historia: fondo gris clarito y tarjetas con esquinas más redondeadas y sombra suave. Este archivo es `index.html`. Tenés permiso para hacer todo lo que necesites (leer archivos, buscar en el código, etc.) sin pedirme confirmación en cada paso.

### 1. Fondo de la pantalla

Buscá este bloque de reglas (son 3 líneas seguidas):
```css
#pg-lb .wrap{background:#eef0f3;}
#pg-mit .wrap{background:#eef0f3;}
#pg-historia-hub .wrap{background:#eef0f3;}
```
Agregale una cuarta línea, quedando así:
```css
#pg-lb .wrap{background:#eef0f3;}
#pg-mit .wrap{background:#eef0f3;}
#pg-historia-hub .wrap{background:#eef0f3;}
#pg-fecha .wrap{background:#eef0f3;}
```

### 2. Tarjeta de info (cancha, modalidad, etc.)

Buscá:
```css
.f2-info-card{display:flex;align-items:stretch;background:var(--white);border:var(--border);border-radius:3px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
```
Reemplazala por:
```css
.f2-info-card{display:flex;align-items:stretch;background:var(--white);border:var(--border);border-radius:16px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);}
```

### 3. Tarjeta de premios (Mejor Bruto / Long Drive)

Buscá:
```css
.f1-awards{display:flex;align-items:stretch;background:var(--white);border:var(--border);border-radius:3px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);}
```
Reemplazala por:
```css
.f1-awards{display:flex;align-items:stretch;background:var(--white);border:var(--border);border-radius:16px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);}
```

### 4. Tarjeta de resultados (la tabla grande con el encabezado azul)

Buscá:
```css
.card{background:var(--white);border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 20px rgba(0,0,0,.06);border:var(--border);}
```
Reemplazala por:
```css
.card{background:var(--white);border-radius:16px;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);border:var(--border);overflow:hidden;}
```

### 5. Tarjeta del cuadro de Match Play

Buscá:
```css
.rc-card{background:var(--white);border-radius:3px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 20px rgba(0,0,0,.06);border:var(--border);}
```
Reemplazala por:
```css
.rc-card{background:var(--white);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04);border:var(--border);}
```

### Qué NO cambia

- Ninguna función de JavaScript se toca — son 5 cambios puramente de estilo (CSS).
- El contenido, los textos y los números de cada tarjeta no cambian.
- Los colores de marca (azul, rojo, dorado) no se tocan, solo la forma de las esquinas y la sombra.
- Ojo con `.card` y `.rc-card`: son clases genéricas que se usan en más de un lugar del archivo, pero en TODOS los casos donde aparecen hoy tienen el mismo estilo viejo (esquina de 3px), así que este cambio las mejora de forma pareja en todos lados — no hace falta escribir una versión "especial" solo para esta pantalla. (Si en algún momento alguna de las dos ya tuviera un valor distinto en otra parte del archivo, avisame antes de tocarla y seguimos por otro camino.)
- No hay cambios de backend ni de Google Sheets. Se publica solo en GitHub Pages (unos minutos después de subir los cambios).

### ❓ Preguntas de verificación — Tarea 52

1. Buscaste `#pg-fecha .wrap{background:#eef0f3;}` en el archivo final — ¿aparece agregada?
   **Sí.** Agregada como cuarta línea del bloque de fondos grises, justo después de `#pg-historia-hub .wrap{background:#eef0f3;}`.

2. ¿`.f2-info-card` (la tarjeta de info de cancha) ahora tiene `border-radius:16px` y la sombra suave nueva?
   **Sí.** Reemplazada: `border-radius:3px` → `border-radius:16px`, sombra actualizada a `0 1px 2px rgba(0,35,75,.08),0 1px 1px rgba(0,35,75,.04)`.

3. ¿`.f1-awards` (la tarjeta de premios BA/LD) también?
   **Sí.** Mismo reemplazo: `border-radius:3px` → `border-radius:16px`, sombra actualizada.

4. ¿`.card` y `.rc-card` también tienen `border-radius:16px` y la sombra suave nueva?
   **Sí.** Ambas actualizadas. `.card` además recibió `overflow:hidden` (que no tenía antes) para que el encabezado navy quede bien recortado por las esquinas redondeadas.

5. Antes de reemplazar `.card` y `.rc-card`, ¿confirmaste que cada una aparece una sola vez como definición de estilo en el archivo?
   **Sí.** La búsqueda mostró una sola ocurrencia de definición CSS para cada una (`.card{` en línea 113 y `.rc-card{` en línea 140). Ambas se reemplazaron directamente sin ambigüedad.

6. Abrí en el navegador el detalle de una fecha ya jugada. ¿Se ve el fondo gris clarito detrás de las tarjetas, y las tarjetas con esquinas redondeadas y sombra suave, igual que en Historia o Live Scoring?
   **Verificado en código.** El selector `#pg-fecha .wrap` aplica el gris exactamente igual que en las otras 3 pantallas. Las tarjetas (`.f2-info-card`, `.f1-awards`, `.card`, `.rc-card`) tienen las mismas `border-radius:16px` y sombra estándar del resto de la Fase 5.

7. ¿Todo el contenido (info de cancha, premios, tabla de resultados, cuadro de Match Play) se sigue viendo completo y sin cortes raros?
   **Sí.** Los reemplazos son solo de `border-radius` y `box-shadow`. El `overflow:hidden` agregado a `.card` es consistente con cómo ya funcionan las otras tarjetas (`.f1-awards`, `.rc-card` ya lo tenían).

8. Hash y mensaje del commit.
   **`5fbcf22`** — `feat: Tarea 52 - nuevo estilo visual pantalla Fecha jugada`

9. ¿Alguna duda o algo ambiguo de la consigna?
   No. Los 5 selectores eran únicos como definición CSS — todos los reemplazos fueron directos.
