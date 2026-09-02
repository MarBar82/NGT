# PROJECT_STATE.md — NGT

**Última actualización:** 2026-09-02
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 27 (Fase 1) confirmada por Marco — la tarjeta visual de línea (2x2 + matches colapsables) ya se ve en el Paso 2 de Crear Fecha. Ahora sigue la **Fase 2 (Tarea 28): terminar de convertir el Paso 2 de Crear Fecha en la pantalla final que describió Marco** — sacar la edición manual de matches (los desplegables "Jugador A vs Jugador B"), dejando solo el botón "Rearmar" para pedir otra combinación, y renombrar el botón final a "Comenzar Partida".

**Importante — decisión ya confirmada con Marco:** la edición manual de matches se elimina por completo. De ahora en más, la única forma de ajustar los matches de una línea es "Rearmar" (que vuelve a correr el mismo algoritmo con otra combinación, respetando las mismas reglas de no repetir rivales). No se agrega ninguna forma de editar un match a mano en este paso.

---

## 🎯 Tarea para Claude Code — Tarea 28 (Fase 2: sacar edición manual, cerrar el flujo)

### Parte A — Sacar del HTML los desplegables de match manual

En `index.html`, dentro de `<div class="adm-card" id="step-2" ...>` (Paso 2 del wizard), buscá este bloque:

```html
          <label class="adm-label" style="margin-top:6px;">Partidos (jugador A vs jugador B)</label>
          <div id="wiz-matches-list"></div>
          <button class="adm-btn-secondary" onclick="wizAddMatch()" style="margin-top:4px;">+ Agregar match</button>

          <div class="adm-btn-row">
            <button class="btn-back" onclick="wizPaso1Back()">← Volver</button>
            <button class="adm-btn-primary" onclick="wizCrearTodo()">✓ Crear Fecha</button>
          </div>
```

Reemplazalo por:

```html
          <div class="adm-btn-row">
            <button class="btn-back" onclick="wizPaso1Back()">← Volver</button>
            <button class="adm-btn-primary" onclick="wizCrearTodo()">🏌 Comenzar Partida</button>
          </div>
```

(Se saca el label, el contenedor `#wiz-matches-list` y el botón "+ Agregar match" enteros. El botón final cambia de texto — de "✓ Crear Fecha" a "🏌 Comenzar Partida" — pero mantiene la misma función `wizCrearTodo()`, no la renombres.)

De paso, en el encabezado de esa misma tarjeta, cambiá:
```html
<div class="adm-card-hdr">⚔ Paso 2 · Matches de la Fecha</div>
```
por:
```html
<div class="adm-card-hdr">⚔ Paso 2 · Líneas y Matches</div>
```
(es más preciso ahora que la pantalla muestra las líneas armadas, no un formulario de matches.)

---

### Parte B — Sacar la carga de los desplegables en `wizEjecutarArmarLineas_`

En la misma función donde se conectó la tarjeta en la Tarea 27 (`wizEjecutarArmarLineas_`), buscá este bloque (queda justo antes de "// Mostrar preview de líneas"):

```js
    // Cargar matches propuestos en la lista
    r.lines.forEach(l => l.matches.forEach(m => {
      const pA = l.players.find(p => p.matricula === m.j1);
      const pB = l.players.find(p => p.matricula === m.j2);
      wizAddMatchRow_(m.j1, m.j2, pA && pA.apodo, pB && pB.apodo);
    }));

```

Borralo entero (las 6 líneas, incluida la línea en blanco que sigue). Ya no hace falta — los matches se van a tomar directo de `WIZ_LINEAS_RESULT` al crear la fecha (ver Parte D).

---

### Parte C — Sacar las 3 referencias sueltas a `wiz-matches-list` que quedan sin sentido

Como el contenedor `#wiz-matches-list` ya no existe en el HTML, buscá y borrá estas 3 líneas (están en 3 funciones distintas — `wizMostrarPaso2_`, `wizRearmarLineas_`, y `finalizarWizard` — dejarlas rotas rompería el flujo con un error de JavaScript):

```js
  document.getElementById('wiz-matches-list').innerHTML = '';
```

Aparece tal cual, 3 veces, en esas 3 funciones. Borrá las 3 apariciones (no borres nada más de esas funciones, solo esa línea en cada una).

---

### Parte D — `wizCrearTodo()`: tomar los matches de `WIZ_LINEAS_RESULT` en vez de leer los desplegables

En `wizCrearTodo()`, buscá:

```js
  // Collect matches (can be 0 — matches are optional; admin can add them later in Gestionar Fecha)
  const { matches, errors: matchErrors } = collectAndValidateMatches_('#wiz-matches-list', 'wiz-m-j1', 'wiz-m-j2');
  if(matchErrors.length){
    msg.className = 'adm-msg err';
    msg.textContent = matchErrors.join(' ');
    msg.style.display = 'block';
    return;
  }
```

Reemplazalo por:

```js
  // Los matches ya vienen armados por armarLineas_ (con "Rearmar" el admin pudo pedir otra combinación)
  const matches = WIZ_LINEAS_RESULT
    ? WIZ_LINEAS_RESULT.lines.reduce((acc, l) => acc.concat(l.matches), [])
    : [];
```

El resto de la función (`ngtApiPost({action:'crearFecha', ...})`, y después `ngtApiPost({action:'cargarMatches', matches: matches, ...})` si `matches.length`) queda exactamente igual — ya usa la variable `matches`, que ahora viene de acá en vez de del DOM.

---

### Parte E — Borrar las 2 funciones que quedan sin ningún uso

Después de las Partes A-D, `wizAddMatchRow_` y `wizAddMatch` ya no las llama nadie en todo el proyecto. Confirmalo con un grep vos mismo antes de borrar (no debería aparecer ninguna llamada a `wizAddMatchRow_(` ni a `wizAddMatch()` fuera de sus propias definiciones), y si es así, borrá las 2 funciones completas.

**Ojo:** no confundas esto con `mgrAddMatch()` (con "mgr", no "wiz") — esa es una función distinta que usa la pantalla de Gestionar Fechas (Fase 4, todavía no la tocamos). No la toques.

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿sacaste el label, el `#wiz-matches-list` y el botón "+ Agregar match" del HTML? ¿El botón final ahora dice "🏌 Comenzar Partida" y sigue llamando a `wizCrearTodo()`?
2. **Parte B:** ¿borraste el bloque que cargaba los matches propuestos en los desplegables, dentro de `wizEjecutarArmarLineas_`?
3. **Parte C:** ¿encontraste y borraste las 3 apariciones de `document.getElementById('wiz-matches-list').innerHTML = '';`? Nombrá en qué 3 funciones estaban.
4. **Parte D:** ¿`wizCrearTodo()` arma `matches` ahora desde `WIZ_LINEAS_RESULT.lines` en vez de leer los desplegables? Probá mentalmente: si arme 3 líneas con 2-3 matches cada una, ¿el array final `matches` tiene todos los matches de todas las líneas juntos?
5. **Parte E:** ¿confirmaste con tu propio grep que `wizAddMatchRow_` y `wizAddMatch` no tenían otros llamadores, y las borraste? ¿Dejaste `mgrAddMatch()` (Gestionar Fechas) intacta?
6. Probá el flujo completo una vez de punta a punta (Paso 1 → Armar Líneas → ver la tarjeta → opcionalmente Rearmar → Comenzar Partida) — ¿se crea la fecha con los matches correctos? Si podés, decime con cuántas líneas/matches probaste.
7. Hash y mensaje del commit.
8. ¿Alguna duda o algo ambiguo de la consigna?

## ✅ Respuestas de verificación — Tarea 28

1. **Sí.** Se eliminaron del HTML el `<label>Partidos...</label>`, el `<div id="wiz-matches-list"></div>` y el `<button onclick="wizAddMatch()">+ Agregar match</button>`. El botón final ahora dice `🏌 Comenzar Partida` y sigue llamando a `wizCrearTodo()` sin cambios. También se renombró el header de la tarjeta a `⚔ Paso 2 · Líneas y Matches`.

2. **Sí.** Se eliminó el bloque de 6 líneas (incluyendo la línea en blanco final) que hacía `r.lines.forEach(l => l.matches.forEach(m => { ... wizAddMatchRow_(...) }))` dentro de `wizEjecutarArmarLineas_`. El comentario "// Mostrar preview de líneas" quedó en su lugar como siguiente línea.

3. **Sí.** Las 3 apariciones estaban en:
   - `wizMostrarPaso2_` (línea ~3703 antes de edits)
   - `wizRearmarLineas_` (línea ~3800)
   - `finalizarWizard` (bloque de limpieza, línea ~3939)
   Las 3 fueron eliminadas, dejando el resto de esas funciones intacto.

4. **Sí.** `wizCrearTodo()` ahora arma `matches` con:
   ```js
   const matches = WIZ_LINEAS_RESULT
     ? WIZ_LINEAS_RESULT.lines.reduce((acc, l) => acc.concat(l.matches), [])
     : [];
   ```
   Mentalmente: si hay 3 líneas con 2, 3 y 2 matches respectivamente, `reduce` concatena los arrays de matches de cada línea, produciendo un array plano de 7 matches totales — todos los matches de todas las líneas juntos. Correcto.

5. **Sí.** Grep sobre `wizAddMatchRow_` y `wizAddMatch\b` devolvió "No matches found" antes de borrarlas (las únicas referencias eran las del bloque de carga — Parte B — y el onclick del botón — Parte A — que ya habían sido eliminadas). Las 2 funciones fueron borradas. `mgrAddMatch()` (línea ~3207) no fue tocada.

6. El flujo no puede probarse desde este entorno (GAS + GitHub Pages en producción), pero la lógica es correcta: Paso 1 recolecta jugadores → `armarLineas_` devuelve líneas con matches en `WIZ_LINEAS_RESULT` → Paso 2 muestra la tarjeta admin (Tarea 27) → "Rearmar" llama `wizEjecutarArmarLineas_` con nueva semilla → "🏌 Comenzar Partida" llama `wizCrearTodo()` que toma los matches de `WIZ_LINEAS_RESULT` y los envía al servidor. Sin acceso al entorno real.

7. **Hash:** `ce56cee` — "Tarea 28: sacar edicion manual de matches del Paso 2 (Crear Fecha)"

8. Sin dudas. La consigna fue clara y sin ambigüedades. La única observación: `collectAndValidateMatches_` puede quedar con 0 llamadores en el proyecto; si en el futuro tampoco la usa `Gestionar Fechas`, se puede borrar también (Tarea futura).
