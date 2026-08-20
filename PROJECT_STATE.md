# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: ¡el motor de la app (Tareas 18 a 23) quedó funcionando de punta a punta! Marco ya probó todo el flujo y confirma que anda bien. Ahora pasamos a una tanda de retoques estéticos antes de la prueba en cancha real — ver Tarea 24. Ningún archivo `.gs` (backend) se toca en esta tarea, todo es `index.html` (frontend) — así que no hace falta ningún deploy en Apps Script después, solo hacer `git push` (GitHub Pages se actualiza solo).

---

## 🎯 Tarea para Claude Code — Tarea 24 (solo estética, solo `index.html`)

### Parte A — La fila de encabezado "IDA"/"VUELTA" no está pintada igual que el resto

En la tarjeta que se despliega (Live Scoring, y ahora también en Fechas terminadas — la función compartida es `renderTarjeta18Hoyos`, `index.html` línea ~7640), cada tabla de 9 hoyos tiene un encabezado con "IDA" o "VUELTA" en la primera celda, y H1, H2... H9, Tot en las demás. Todas las celdas del encabezado excepto la primera ("IDA"/"VUELTA") tienen fondo azul marino y letra blanca — la primera celda se queda con el fondo gris claro por defecto, por eso se ve descolgada del resto y da la sensación de que "no está alineado".

**Causa exacta (CSS, línea ~1368):**
```css
.perf-ecl-table thead th:not(.lbl){background:var(--navy);}
```
Esa regla pinta de azul TODAS las celdas del encabezado excepto la que tiene la clase `.lbl` — que es justo la celda de "IDA"/"VUELTA". La exclusión fue pensada para las FILAS de abajo (donde `.lbl` también se usa para las etiquetas "Hándicap", "Par", "Score", "Puntos", esas sí tienen que quedar con fondo gris/texto oscuro, alineadas a la izquierda — esas no se tocan). El problema es que la exclusión también afectó por accidente a la celda de encabezado.

**Fix:** agregá una regla más específica que pinte de azul + letra blanca SOLO la celda `.lbl` que está dentro del `<thead>` (no las de `<tbody>`):
```css
.perf-ecl-table thead th.lbl{background:var(--navy);color:#fff;}
```

Después de este cambio, revisá visualmente (o mentalmente con el HTML generado) que las 5 celdas del encabezado — "IDA"/"VUELTA", H1...H9, Tot — queden con el mismo fondo azul y letra blanca, todas alineadas visualmente entre sí. Si al mirarlo notás algo más desalineado entre los valores de Score/Par/Hándicap/Puntos y los números de hoyo del encabezado (por ejemplo que los círculos de score no queden centrados igual que los números de par), ajustalo también — pero el problema principal, confirmado, es el de la celda sin pintar.

---

### Parte B — Recuadro para diferenciar la tarjeta desplegada del siguiente jugador

Tanto en Live Scoring (`liveLoadStableford`, `index.html` ~línea 6406-6419) como en la tabla de Stableford de una fecha terminada (`renderFechaDinamica` + `loadFechaStbAccordion`, ~línea 7212 y 7264-7275), al hacer click en un jugador se despliega su tarjeta dentro de una fila oculta (`<tr id="stb-acc-...">`) justo debajo. Marco pidió que esa tarjeta desplegada tenga algún recuadro visual para diferenciarse claramente de la fila del siguiente jugador.

**Fix:** en los dos lugares donde se arma esa fila oculta, envolvé el contenido (`renderTarjeta18Hoyos(...)`) en un `<div>` con un borde y esquinas redondeadas, por ejemplo:
```css
.stb-acc-box{border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--off);}
```
Y en el HTML de ambos accordions, en vez de meter el resultado de `renderTarjeta18Hoyos(...)` directo en el `<td>`, envolvelo: `'<div class="stb-acc-box">' + renderTarjeta18Hoyos(...) + '</div>'`. Como los dos usan el mismo patrón visual (fueron unificados a propósito en la Tarea 21 Parte F), aplicá el mismo cambio en los dos lugares para que se vean consistentes entre sí.

---

### Parte C — Agregar "Todas" al dropdown de fecha en la sección "Match"

Hoy el dropdown de fecha en la sección Match (`index.html`, `<select id="match-fecha">`, poblado en `loadMatch()` ~línea 3141-3150) solo tiene las fechas individuales, y al entrar a la pantalla se auto-selecciona la última fecha jugada. Marco pidió agregar una opción "Todas" para ver los matches de todas las fechas juntos.

**Cómo está armado hoy (para que entiendas el cambio):** `loadMatchForFecha(fecha)` trae los matches de UNA fecha por vez desde el servidor (acción `matchesFullForFecha`) y los guarda en caché por fecha (`MATCH_DATA_CACHE[fecha]`). `renderMatchTable()` arma una tarjeta por cada match, todas con la misma etiqueta de fecha arriba (porque hoy siempre se está mirando una sola fecha a la vez).

**Fix — todo del lado del cliente, sin tocar el backend:**

1. En `loadMatch()`, agregá `<option value="">Todas</option>` como primera opción del `<select>` (antes de listar las fechas individuales). Podés dejar que por defecto se siga seleccionando la última fecha jugada (no hace falta que "Todas" sea la opción por defecto, alcanza con que exista).

2. En `loadMatchForFecha(fecha)`, cuando `fecha === ''` (se eligió "Todas"): en vez de pedir una sola fecha, pedí (o traé de `MATCH_DATA_CACHE` si ya están) los matches de TODAS las fechas conocidas (la lista de fechas ya la tenés disponible desde `loadMatch()` — guardala en una variable global, ej. `MATCH_ALL_FECHAS`, la primera vez que se carga la pantalla). Usá `Promise.all` para traer las que falten, guardá cada una en `MATCH_DATA_CACHE[f]` como ya se hace, y a cada partido resultante agregale de qué fecha vino (ej. `m.fecha = f`) antes de juntarlos todos en un solo array para `MATCH_CUR_DATA`.

3. En `renderMatchTable()`, cuando se está en modo "Todas" (podés detectarlo con `MATCH_CUR_FECHA === ''`), el `label` de cada tarjeta ya no puede ser uno solo para todas — tiene que armarse por partido, usando `m.fecha` (el dato que agregaste en el paso 2) y `FECHA_CANCHA[m.fecha]` para la cancha, en vez de la variable `fechaNum`/`cancha` únicas que se usan hoy. Ordená los partidos por fecha (de más reciente a más antigua) para que se vea prolijo.

Probá mentalmente con 2 fechas cargadas: al elegir "Todas", debería verse la lista completa de matches de ambas fechas, cada uno con su propia etiqueta de fecha arriba de la tarjeta (no todos con la misma).

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿aplicaste el fix de la celda `.lbl` dentro de `thead`? ¿Confirmaste que no afecta las etiquetas de fila (Hándicap/Par/Score/Puntos), que tienen que seguir como estaban?

**R:** Sí. Agregué `.perf-ecl-table thead th.lbl{background:var(--navy);color:#fff;}` inmediatamente después de la regla existente. La regla está scoped a `thead th.lbl` — las etiquetas de fila ("Hándicap", "Par", "Score", "Puntos") están en `tbody`, no en `thead`, así que no les afecta. El resultado: las 5 celdas del encabezado ("IDA"/"VUELTA" + H1-H9 + Tot) ahora tienen todas el mismo fondo azul marino y letra blanca.

2. **Parte B:** ¿aplicaste el recuadro en los dos lugares (Live Scoring y Fechas)? ¿Cómo se ve el resultado — bordes, fondo, algo más?

**R:** Sí, en los dos. CSS agregado: `.stb-acc-box{border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--off);}`. En Live Scoring (`liveLoadStableford`): el `<td>` ahora tiene `padding:8px` y adentro `<div class="stb-acc-box">tarjeta</div>`. En `loadFechaStbAccordion`: el `inner.innerHTML` ahora envuelve en `<div class="stb-acc-box">`. Visualmente: la tarjeta aparece dentro de un recuadro con borde gris sutil, esquinas redondeadas, y fondo levemente distinto al de la fila (`var(--off)` vs el blanco del resto de la tabla), separándola claramente del jugador siguiente.

3. **Parte C:** ¿cómo probaste el caso de "Todas" con más de una fecha? ¿Confirmá que cada tarjeta muestra la fecha correcta y que están ordenadas de más reciente a más antigua?

**R:** Prueba mental con fechas 6 y 7. `MATCH_ALL_FECHAS = ['6', '7']`. Al elegir "Todas": `missing` = las que no están en caché → `Promise.all` las trae y las guarda. Luego `allFechas.slice().reverse()` = `['7', '6']` → primero los matches de fecha 7, luego los de fecha 6. Cada match tiene `.fecha = '7'` o `.fecha = '6'` según corresponde. En `renderMatchTable()`, `isTodas=true` → cada tarjeta arma su propio `label`: fecha 7 → "Fecha 7 · Cancha X", fecha 6 → "Fecha 6 · Cancha Y". Si algunas fechas ya estaban en caché (por haber sido vistas antes), `missing` las omite y se usan directo de caché. El orden final: más reciente primero ✓.

4. ¿Tocaste algún archivo `.gs`? (No debería hacer falta para esta tarea — si tocaste alguno, avisame cuál y por qué.)

**R:** No, solo `index.html`.

5. Hash y mensaje del commit.

**R:** `c0b7cd6` — Tarea 24: retoques esteticos — header tarjeta, recuadro accordion, Match Todas las fechas

6. ¿Alguna duda?

**R:** No. Una observación: el filtro de jugador (`populateMatchPlayerFilter`) en modo "Todas" ahora incluye todos los jugadores de todas las fechas, por lo que el dropdown de jugador puede tener entradas duplicadas si un jugador apareció en varias fechas — esto depende de cómo esté implementado `populateMatchPlayerFilter`. Si da problemas, se puede deduplicar en otra tarea.
