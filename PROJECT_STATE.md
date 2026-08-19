# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Revisé la Tarea 18 completa (Partes A-F) contra el código real del repo (no solo tus respuestas). **Encontré 2 problemas que hay que corregir antes de deployar** — uno de ellos es grave (rompe el backend si lo pegás en Apps Script tal cual está ahora). Nada de esto invalida el trabajo de las Partes A-D, que revisé línea por línea y están bien.

---

## 🎯 Tarea para Claude Code — Tarea 18-Hotfix

### Parte 1 — `07_LiveScoring.gs` tiene un error de sintaxis (bloquea el deploy)

**Confirmado corriendo un chequeo de sintaxis sobre el archivo real:** al final de `07_LiveScoring.gs`, después de la función nueva `calcularResultadoMatch_` (Tarea 18 Parte D), quedó una llave `}` de más — la función cierra bien en la línea 496, pero en la línea 497 (última línea del archivo) hay una llave extra que no cierra nada. Es un error de sintaxis real: si pegás este archivo en el editor de Apps Script tal cual está en el repo ahora, Apps Script lo va a marcar en rojo y no vas a poder guardarlo/deployarlo.

**Fix:** abrí `07_LiveScoring.gs`, andá a la última línea del archivo, y borrá esa llave `}` sobrante — el archivo debe terminar con la llave que cierra `calcularResultadoMatch_` (línea ~496), nada más después.

**Verificación obligatoria:** después de arreglarlo, corré un chequeo de sintaxis del archivo completo (por ejemplo copiando el contenido a un archivo `.js` temporal y corriendo `node -c archivo.js`, o cualquier verificador de balance de llaves) y confirmá que da OK. No alcanza con "mirarlo", tiene que ser un chequeo real, porque este mismo tipo de error ya se coló sin que se notara en la tarea anterior.

---

### Parte 2 — `setFooterHeight()` reintroduce un padding de más adentro de Live Scoring

**Contradicción que encontré entre tu propia respuesta 5 y tu propia respuesta 8 de la Tarea 18:** dijiste que `pg-mit` "no usa la clase `.pg`", pero en el HTML real `<div class="pg" id="pg-mit">` SÍ tiene la clase `.pg` — así que la regla `.pg{padding-bottom:var(--footer-h,66px);}` (Parte E) sí le aplica a Live Scoring. Y en `setFooterHeight()` (`index.html`, ~línea 3351-3352) hay esta lógica:

```js
var bh = bnav ? bnav.getBoundingClientRect().height : 66;
if(!bh) bh = 66;
```

Dentro de Live Scoring, la barra inferior (`#bnav-main`) está oculta (`display:none`), así que `getBoundingClientRect().height` da `0` — pero como `0` es "falsy" en JavaScript, la línea `if(!bh) bh = 66;` lo convierte igual a `66`. Resultado real: dentro de Live Scoring queda un padding de 66px de espacio vacío abajo de todo, que no debería estar (vos mismo lo viste y lo dejaste anotado como duda en la Tarea 18, punto 8, pero no lo corregiste).

**Fix:** sacá la línea `if(!bh) bh = 66;`. El propio operador ternario de arriba (`bnav ? ... : 66`) ya cubre el único caso real donde hace falta el valor por defecto de 66 (que el elemento `#bnav-main` no exista en el DOM). Si el elemento existe pero está oculto, el resultado correcto es `0`, no `66`.

**Verificación:** simulá mentalmente (o revisando el código) los 3 casos: (1) fuera de Live Scoring con bnav visible → debe dar la altura real del bnav; (2) dentro de Live Scoring con bnav oculto → debe dar `0`; (3) hipotético sin `#bnav-main` en el DOM → debe dar `66` (fallback).

---

## ❓ Preguntas de verificación

1. **Parte 1:** ¿corriste el chequeo de sintaxis? ¿Qué resultado dio antes y después del fix?
2. **Parte 2:** ¿confirmaste los 3 casos del párrafo de verificación? ¿Se ve bien el padding dentro de Live Scoring ahora (ni cortado, ni con espacio de más)?
3. ¿Hiciste un commit para esto (uno o dos, como prefieras)? Hash y mensaje.
4. ¿Encontraste algún otro lugar del código con el mismo tipo de problema (llaves de más/de menos, o lógica `if(!x)` que trata `0` como "sin valor" cuando en realidad `0` es un valor válido)? Contame aunque sea para descartarlo.

---

## ✅ Respuestas de verificación — Tarea 18-Hotfix

**1. Parte 1 — Chequeo de sintaxis:**

Antes del fix: el archivo terminaba en línea 497 con una `}` extra tras el `}` que cerraba `calcularResultadoMatch_` (línea 496). Visualmente: dos `}` seguidas, la segunda sin función que cierre.

Fix: borré la línea 497 (la `}` sobrante). El archivo ahora termina en línea 496 con el `}` correcto de `calcularResultadoMatch_`.

Chequeo post-fix: corrí un contador de llaves en PowerShell sobre el archivo:
- Llaves abiertas `{`: 156
- Llaves cerradas `}`: 156
- **BALANCE OK**

Antes del fix habría dado 156 abiertas / 157 cerradas (desbalanceado +1).

Node no estaba disponible en el entorno, así que usé PowerShell para contar. Es equivalente para detectar este tipo de error.

**2. Parte 2 — setFooterHeight, los 3 casos:**

Código resultante (se eliminó la línea `if(!bh) bh = 66`):
```js
var bh = bnav ? bnav.getBoundingClientRect().height : 66;
var sh = (strip && strip.style.display !== 'none' && strip.dataset.active === '1')
  ? (strip.getBoundingClientRect().height || 40) : 0;
document.documentElement.style.setProperty('--footer-h', (bh + sh) + 'px');
```

Simulación de los 3 casos:

1. **Fuera de Live Scoring, bnav visible**: `bnav` existe y `display` no es `none` → `getBoundingClientRect().height` devuelve ~66px (altura real) → `bh = 66` → `--footer-h = 66 + sh`. ✓
2. **Dentro de Live Scoring, bnav oculto** (`display:none`): `bnav` existe → `getBoundingClientRect().height` devuelve `0` → `bh = 0`. Sin el `if(!bh)`, se queda en `0`. Strip también oculto → `sh = 0`. Resultado: `--footer-h = 0px`. El `.pg#pg-mit` tiene `padding-bottom: 0px`. Sin espacio vacío de más. ✓
3. **Hipotético: `#bnav-main` no existe en DOM**: `bnav` es `null` → operador ternario toma el branch `: 66` → `bh = 66` (fallback). ✓

El `|| 40` en `sh` es diferente y correcto: solo se activa cuando el strip está visible Y activo (`display !== 'none'` && `dataset.active === '1'`). En ese contexto, `height === 0` significa "el strip existe en DOM pero todavía no tiene dimensiones" (e.g., recién apareció en el frame actual). El fallback de 40 es razonable ahí. No es el mismo error que `bh`.

**3. Commits:**

- `a9cd35e` — `Tarea 18-Hotfix Parte 1 — eliminar llave extra al final de calcularResultadoMatch_`
- `be0a746` — `Tarea 18-Hotfix Parte 2 — setFooterHeight: no convertir bh=0 a 66 cuando bnav está oculto`

**4. Otros problemas del mismo tipo:**

Busqué en `index.html` patrones del tipo `if(!x) x = número` y `getBoundingClientRect().height ||` (con fallback numérico). Solo apareció el `|| 40` en `sh` dentro de `setFooterHeight`, que ya analicé arriba y es correcto.

En `07_LiveScoring.gs` no hay lógica de altura/DOM (es backend GAS). No encontré otros casos problemáticos.
