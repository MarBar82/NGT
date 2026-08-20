# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-20
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: la Tarea 22 corrigió las 4 funciones que leían TARJETAS con columnas viejas. Al deployar, Marco encontró un error nuevo: `canchaName is not defined`. Es un hotfix chiquito de una sola línea — se me escapó a mí también al revisar el commit, mis disculpas. Ver Tarea 23.

---

## 🎯 Tarea para Claude Code — Tarea 23 (hotfix, un solo cambio)

### `recalcularHcpFecha_` (`05_HCP.gs`, línea ~549): quedó una referencia a una variable que ya no existe

En la Tarea 22 Parte A se sacó la variable `canchaName` (ya no existe, porque TARJETAS no tiene columna de nombre de cancha) y se armó todo en base a `canchaId`. Pero al final de la función, en el `return`, quedó una línea que todavía usa `canchaName`:

```js
return {
  ok: true,
  data: {
    cancha: canchaName,   // ← esta variable ya no existe, tira ReferenceError
    ...
```

Como `canchaName` ya no está declarada en ningún lado de la función, JavaScript tira `canchaName is not defined` apenas la función intenta armar la respuesta — pasa siempre que la función llega hasta el final exitoso (es decir, ahora que el bug de la Tarea 22 ya no corta antes con el error de "no se encontró cancha", este es el próximo problema con el que se choca).

**Fix:** cambiá esa línea para que use el nombre real de la cancha buscándolo por `canchaId` (así el panel admin sigue mostrando un nombre legible en vez del ID):

```js
cancha: lookupCanchaName_(canchaId) || canchaId,
```

(`lookupCanchaName_` ya existe en el proyecto — se usa en varios otros lados, por ejemplo en `getFechaDetalle_`, `03_Reads.gs`.)

Antes de dar por terminado, buscá si queda alguna otra referencia suelta a `canchaName` en esta función o en las otras 3 que tocamos en la Tarea 22 (`getFechaColors2026_`, la rama "modo gestionar" de `armarLineas_`, `setDoblesFecha_`) — para no repetir el mismo descuido.

---

## ❓ Preguntas de verificación

1. ¿Hiciste el cambio de `canchaName` a `lookupCanchaName_(canchaId) || canchaId`?

**R:** Sí. `05_HCP.gs` línea 549: `cancha: lookupCanchaName_(canchaId) || canchaId,`.

2. ¿Buscaste y confirmaste que no queda ninguna otra referencia suelta a `canchaName` en las 4 funciones de la Tarea 22?

**R:** Sí. Busqué `canchaName` en los 3 archivos modificados en la Tarea 22: `05_HCP.gs` — cero referencias; `06_ArmarLineas.gs` — una referencia en línea 36 (`params.canchaName`) pero es el modo wizard (rama `if`, no tocada en Tarea 22) leyendo un parámetro del frontend, no la variable eliminada; `04_Writes.gs` — referencias en `crearFecha_` (líneas 13-147), función completamente distinta a `setDoblesFecha_`. Ninguna referencia suelta en las 4 funciones corregidas.

3. Hash y mensaje del commit.

**R:** `e2210c4` — Tarea 23: hotfix canchaName is not defined en recalcularHcpFecha_

4. ¿Alguna duda?

**R:** No.
