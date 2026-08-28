# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-28
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 26 (dobles) confirmada funcionando por Marco. Ahora arrancamos el rediseño del panel de Admin que Marco pidió (Gestionar Jugadores nueva, Crear Fecha con tarjetas visuales, mismo diseño en Gestionar Fechas). Es una tarea grande, así que la dividimos en fases chicas y testeables. Esta es la **Fase 1 (Tarea 27): construir el componente visual de la tarjeta de línea para Admin** — el "ladrillo" que después se va a insertar en Crear Fecha (Fase 2) y en Gestionar Fechas (Fase 4). Para poder probarlo con datos reales sin tener que esperar a las fases siguientes, esta tarea también lo conecta de forma temporal en el lugar donde hoy se arman las líneas (Paso 2 de Crear Fecha), reemplazando el resumen de texto plano que hay ahí hoy — sin tocar los botones ni los dropdowns de match manual todavía (eso se saca recién en la Fase 2).

**Importante:** esta tarea NO modifica `renderFechaCard_` (la tarjeta que ya usan los jugadores en "Ver Líneas") ni sus clases CSS `.fc-*`. Todo lo nuevo usa un prefijo distinto (`fca-`, de "fecha card admin") para no romper nada existente.

---

## 🎯 Tarea para Claude Code — Tarea 27 (Fase 1: tarjeta de línea para Admin)

### Parte A — CSS nuevo

En `index.html`, agregá este bloque de CSS nuevo inmediatamente después del bloque existente `.fc-*` (después de la línea `@media(max-width:380px){.fc-player{...}}`, alrededor de la línea 938). No modifiques ninguna línea existente de ese bloque `.fc-*`, solo agregá esto a continuación:

```css
/* ── Fecha Card ADMIN (grid 2x2 + matches colapsables) ── */
.fca-wrap{padding:10px 10px 6px;}
.fca-linea{border:1px solid var(--g2);margin-bottom:10px;}
.fca-linea-hdr{background:var(--navy);color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;}
.fca-lnum{font-family:'Roboto Slab',serif;font-size:14px;font-weight:900;color:#c9a84c;text-transform:uppercase;}
.fca-lmeta{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}
.fca-players{padding:7px;display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.fca-pill{display:flex;align-items:center;justify-content:space-between;gap:6px;border:1px solid var(--g2);border-left:3px solid var(--red);padding:6px 8px;min-height:38px;background:#fff;}
.fca-pill-empty{border:1px dashed var(--g2);min-height:38px;}
.fca-pname{font-weight:800;font-size:12px;letter-spacing:.03em;color:var(--navy);text-transform:uppercase;}
.fca-phcp{display:flex;align-items:center;gap:3px;font-size:11px;font-weight:700;white-space:nowrap;color:var(--g5);}
.fca-phcp .fca-p85{font-weight:800;color:var(--red);}
.fca-match-toggle{background:var(--g1);border:1px solid var(--g2);border-top:none;padding:6px 10px;font-size:9px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--navy);display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;}
.fca-match-arrow{transition:transform .15s;font-size:11px;}
.fca-match-toggle.open .fca-match-arrow{transform:rotate(180deg);}
.fca-matches{padding:7px;display:flex;flex-direction:column;gap:4px;}
.fca-match{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:#fff;border:1px solid var(--g2);border-left:3px solid #c9a84c;padding:7px 10px;font-size:12px;font-weight:800;color:var(--navy);text-transform:uppercase;}
.fca-match .fca-m1{justify-self:start;text-align:left;}
.fca-match .fca-m2{justify-self:end;text-align:right;}
.fca-match .fca-mvs{color:var(--red);font-weight:900;font-size:10px;letter-spacing:.05em;}
@media(max-width:380px){.fca-players{grid-template-columns:1fr}.fca-match{grid-template-columns:1fr;text-align:center;gap:2px;}.fca-match .fca-m1,.fca-match .fca-m2{justify-self:center;text-align:center;}}
```

Notá que reutiliza las mismas variables de color que ya existen en el proyecto (`--navy`, `--red`, `--g1` a `--g5`, `--off`) — no inventes colores nuevos.

---

### Parte B — Funciones JS nuevas

En `index.html`, agregá estas 3 funciones nuevas justo después de `calcTeeTime_` (termina alrededor de la línea 8115, antes del comentario `// ── TARJETA MODAL`). No modifiques `calcTeeTime_` ni `renderFechaCard_`, solo agregá código nuevo a continuación:

```js
// Normaliza el resultado crudo de armarLineas_ (matches con solo matriculas j1/j2,
// jugadores con hcp de juego sin el 85%) a la forma que consume renderFechaCardAdmin_.
function normalizeLineasArmado_(rawLines, horarioBase, hoyoSalida, colorTee){
  const total = rawLines.length;
  return rawLines.map(function(l, idx){
    const players = l.players.map(function(p){
      const hcp = p.hcp || 0;
      return { matricula: p.matricula, apodo: p.apodo, hcp: hcp, hcp85: Math.round(hcp * 0.85) };
    });
    const byMat = {};
    players.forEach(function(p){ byMat[p.matricula] = p; });
    const matches = l.matches.map(function(m){
      const p1 = byMat[m.j1] || { apodo: m.j1, hcp85: 0 };
      const p2 = byMat[m.j2] || { apodo: m.j2, hcp85: 0 };
      return { apodo1: p1.apodo, hcp85_1: p1.hcp85, apodo2: p2.apodo, hcp85_2: p2.hcp85 };
    });
    return {
      lineNum: l.lineNum || (idx + 1),
      horario: calcTeeTime_(horarioBase, idx, total),
      hoyo: hoyoSalida || 1,
      colorTee: colorTee || 'BLANCAS',
      players: players,
      matches: matches,
    };
  });
}

// Card de línea para pantallas de ADMIN: grid 2x2 de jugadores + matches colapsables.
// `lineas` ya viene normalizada (ver normalizeLineasArmado_). Si una línea tiene 3
// jugadores, el 4to casillero queda vacío (fca-pill-empty) para mantener el grid 2x2.
function renderFechaCardAdmin_(lineas){
  let html = '<div class="fca-wrap">';
  lineas.forEach(function(l, idx){
    const bodyId = 'fca-m-' + idx;
    html += '<div class="fca-linea">' +
      '<div class="fca-linea-hdr"><span class="fca-lnum">Línea ' + l.lineNum + '</span>' +
      '<span class="fca-lmeta">' + l.horario + ' · Hoyo ' + l.hoyo + ' · ' + l.colorTee + '</span></div>' +
      '<div class="fca-players">';

    for(let i = 0; i < 4; i++){
      const p = l.players[i];
      if(p){
        html += '<div class="fca-pill"><span class="fca-pname">' + p.apodo + '</span>' +
          '<span class="fca-phcp">' + p.hcp + ' → <span class="fca-p85">' + p.hcp85 + '</span></span></div>';
      } else {
        html += '<div class="fca-pill-empty"></div>';
      }
    }

    html += '</div>' +
      '<div class="fca-match-toggle open" onclick="toggleFcaMatches_(this,\'' + bodyId + '\')">' +
      '<span>⚔ Matches (' + l.matches.length + ')</span><span class="fca-match-arrow">▾</span></div>' +
      '<div class="fca-matches" id="' + bodyId + '">';

    l.matches.forEach(function(m){
      html += '<div class="fca-match">' +
        '<span class="fca-m1">' + m.apodo1 + ' hcp ' + m.hcp85_1 + '</span>' +
        '<span class="fca-mvs">VS.</span>' +
        '<span class="fca-m2">hcp ' + m.hcp85_2 + ' ' + m.apodo2 + '</span></div>';
    });

    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

// Muestra/oculta el bloque de matches de una línea (flecha rota al abrir/cerrar).
function toggleFcaMatches_(toggleEl, bodyId){
  const body = document.getElementById(bodyId);
  if(!body) return;
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  toggleEl.classList.toggle('open', hidden);
}
```

---

### Parte C — Conectarlo de forma temporal en el Paso 2 de Crear Fecha, para poder probarlo con datos reales

En `index.html`, dentro de `wizEjecutarArmarLineas_` (~línea 3721), buscá el bloque que arma el preview de texto plano (empieza en `const preview = document.getElementById('adm-s2-lineas-preview');` ~línea 3762, termina en `preview.style.display = 'block';` ~línea 3785, dentro del `.then(r => {...})`).

Mantené la primera parte (el cartel de arriba con el conteo de líneas/matches, el aviso de repetidos, y el botón "↻ Rearmar" — **no toques esa parte**, sigue funcionando igual). Reemplazá SOLO la parte de abajo, la que hoy arma el listado de texto plano línea por línea (`r.lines.forEach(l => { html += '<strong>L' + ...`) y la línea final `<span style="color:var(--g4)...">Podés modificar los matches abajo...`, por esto:

```js
const normalized = normalizeLineasArmado_(r.lines, data.horario, data.hoyoSalida, data.colorTee);
html += renderFechaCardAdmin_(normalized);
```

El resultado final de esa función debería quedar así (mostrando la estructura completa para que lo compares, el `if(preview){ ... }` completo):

```js
const preview = document.getElementById('adm-s2-lineas-preview');
if(preview){
  const repeats = r.repeatCount || 0;
  const repeatColor = repeats > 0 ? 'var(--red)' : 'var(--navy)';
  const repeatTxt = repeats > 0
    ? ' · <span style="color:var(--red);">⚠ ' + repeats + ' match' + (repeats > 1 ? 'es' : '') + ' repetido' + (repeats > 1 ? 's' : '') + '</span>'
    : ' · <span style="color:green;">✓ sin repeticiones</span>';
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
    '<strong style="color:' + repeatColor + ';">⚡ ' + r.lines.length + ' líneas · ' +
    r.lines.reduce((s,l) => s + l.matches.length, 0) + ' matches' + repeatTxt + '</strong>' +
    '<button onclick="wizRearmarLineas_()" style="padding:3px 10px;font-size:11px;border-radius:3px;border:1px solid var(--navy);background:var(--navy);color:#fff;cursor:pointer;">↻ Rearmar</button>' +
    '</div>';
  const normalized = normalizeLineasArmado_(r.lines, data.horario, data.hoyoSalida, data.colorTee);
  html += renderFechaCardAdmin_(normalized);
  preview.innerHTML = html;
  preview.style.display = 'block';
}
```

No toques nada más de esta función (el manejo del botón "⚡ Armar Líneas →", el guardado en `WIZ_LINEAS_RESULT`, ni el `r.lines.forEach(l => l.matches.forEach(m => { ... wizAddMatchRow_ ... }))` que carga los dropdowns de match manual debajo — eso sigue existiendo por ahora, se saca recién en la próxima fase).

---

## Cómo se prueba esto en la app (para Marco, después de que Code confirme)

1. Entrá a Admin → Crear Fecha.
2. Completá el Paso 1 (cancha, color de salida, hoyo de salida, horario, jugadores) y apretá "⚡ Armar Líneas →".
3. En el Paso 2 debería aparecer, en el mismo lugar donde antes veías el resumen de texto, la tarjeta nueva: una card por línea, con encabezado navy (línea + horario + hoyo + color), un grid de 2x2 con los jugadores como pills (nombre + hcp → hcp al 85%), y debajo un renglón "⚔ Matches (N)" que al tocarlo despliega o esconde los matches de esa línea, cada uno mostrando "NOMBRE hcp X VS. hcp Y NOMBRE".
4. El botón "↻ Rearmar" (arriba de las tarjetas) tiene que seguir funcionando igual que antes — vuelve a armar y refresca la tarjeta con otra combinación.
5. Los dropdowns de "editar match manualmente" que aparecen más abajo en la pantalla van a seguir estando por ahora — eso es esperado, se sacan en la próxima tarea.

---

## ❓ Preguntas de verificación

1. ¿Agregaste el CSS nuevo (Parte A) sin modificar ninguna clase `.fc-*` existente?

**R:** Sí. El bloque `.fca-*` se insertó inmediatamente después de `@media(max-width:380px){.fc-player{...}}` (línea 938) y antes de `@media(max-width:480px){`. No se tocó ninguna línea del bloque `.fc-*` existente.

2. ¿Agregaste las 3 funciones nuevas (Parte B) sin modificar `calcTeeTime_` ni `renderFechaCard_`?

**R:** Sí. Las 3 funciones (`normalizeLineasArmado_`, `renderFechaCardAdmin_`, `toggleFcaMatches_`) se insertaron exactamente entre el cierre de `calcTeeTime_` (línea 8115) y el comentario `// ── TARJETA MODAL ──`. `calcTeeTime_` y `renderFechaCard_` no se modificaron.

3. ¿Conectaste el render nuevo en `wizEjecutarArmarLineas_` (Parte C) manteniendo el cartel de arriba (conteo + botón Rearmar) intacto?

**R:** Sí. El bloque que genera `html` con el `<div>` de conteo de líneas/matches + `repeatTxt` + botón "↻ Rearmar" está intacto. Solo se reemplazaron las líneas que antes armaban el texto plano (`r.lines.forEach(l => { html += '<strong>L' + ...`) y la línea de "Podés modificar los matches..." por las dos líneas nuevas: `normalizeLineasArmado_` + `renderFechaCardAdmin_`. El `WIZ_LINEAS_RESULT`, los dropdowns de match manual, y el `wizRearmarLineas_` no se tocaron.

4. Probaste armar una fecha de prueba (o revisaste mentalmente el flujo) con una línea de 3 jugadores — ¿el 4to casillero queda vacío sin romper el grid?

**R:** Revisado mentalmente. `l.players.length === 3` → el `for(let i = 0; i < 4; i++)` itera 4 veces: para `i=0,1,2` hay un `p` válido → `<div class="fca-pill">...`, para `i=3` `p` es `undefined` → `<div class="fca-pill-empty"></div>`. El grid `grid-template-columns:1fr 1fr` sigue siendo 2x2 con 4 celdas: 3 pills + 1 vacía. No se rompe el layout.

5. Hash y mensaje del commit.

**R:** `1822e6e` — Tarea 27: tarjeta de linea para Admin (Fase 1)

6. ¿Alguna duda o algo que te pareció ambiguo de la consigna?

**R:** No, todo claro. Una observación: el `adm-s2-lineas-preview` tiene en su HTML un `style` inline con `font-family:'Barlow Condensed'` y `font-size:16px` — esos estilos afectan el texto que generaba la versión vieja, pero como `fca-*` define sus propias fuentes y tamaños internamente, no interfieren visualmente. Si se quiere limpiar ese container style en la Fase 2, se puede hacer sin riesgo.
