# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 1 a 7 completadas (estructura, seguridad, y los 4 componentes responsive de mayor impacto). Esta es la Tarea 8: los 6 componentes restantes de la auditoría de responsive — todos de menor frecuencia de uso (panel de admin, wizard, perfil), salvo el último que es un bug de layout más serio (rompe el scroll de toda la página).

Esta tarea es **solo frontend** (`index.html`) — no toca `Code37.gs` ni ningún módulo `.gs`, no requiere deploy en Apps Script, solo `git push`. Probá cada punto achicando la ventana a ~360px y ~320px.

---

## 🎯 Tarea para Claude Code

### 1. Tabla ecléctica de perfil (`.perf-ecl-table`) — hacé este primero, es el más serio

**Archivo:** `index.html` ~línea 830 (sección "Perfil").

La tabla tiene 18 columnas de hoyos + nombre + totales, sin `overflow-x:auto` en su contenedor. En cualquier celular <680px fuerza scroll horizontal en el `<body>` entero — no solo la tabla, toda la página (topbar y bottom nav incluidos) queda más ancha que la pantalla.

Envolvé `.perf-ecl-table` en un contenedor con `overflow-x:auto; -webkit-overflow-scrolling:touch` (podés agregarlo al `<div>` padre existente si ya hay uno, o crear uno nuevo). No hace falta tocar el layout interno de la tabla.

### 2. Panel de administración — grilla de hoyos (`.adm-tar-grid` / clase equivalente)

**Archivo:** `index.html` ~línea 1100–1150 (sección "Admin").

`grid-template-columns:repeat(6,1fr)` deja los inputs de hoyo en ~46px en pantallas de 320px, insuficiente para tocar cómodo. Ya existe una solución para el mismo problema en la grilla de carga de tarjeta (`tcard-grid` o el nombre que corresponda) — replicá ese mismo criterio acá, con un `@media(max-width:380px)` que ajuste columnas o aumente altura de los inputs.

### 3. Panel de administración — fila de formulario (`.adm-row`)

**Archivo:** `index.html` ~línea 1120.

`grid-template-columns:1fr 1fr` corta labels y dropdowns de nombre completo en pantallas chicas. Agregá `@media(max-width:480px){ .adm-row{grid-template-columns:1fr} }` (una sola columna).

### 4. Panel de administración — fila de match (`.adm-match-row`)

**Archivo:** `index.html` ~línea 1130.

`grid-template-columns:1fr auto 1fr auto` deja los `<select>` de jugador en ~140px, insuficiente para nombres largos. En `@media(max-width:480px)`, pasá a un layout de 2 filas apiladas para los selects (por ejemplo `grid-template-columns:1fr 1fr` con el conector "VS" en su propia fila, o la solución que te parezca más prolija manteniendo la usabilidad).

### 5. Wizard "Crear fecha" — barra de pasos y botones (`.adm-steps`, `.adm-btn-row`)

**Archivo:** `index.html` líneas ~1382–1394.

- `.adm-steps`: en 320px los labels de paso no caben junto a los números. En `@media(max-width:380px)`, reducí el `font-size` del label a ~11px, o directamente ocultalo dejando solo los números de paso.
- `.adm-btn-row`: `grid-template-columns:1fr 2fr` deja el botón "Atrás" muy angosto (~97px en 320px). En el mismo `@media`, cambiá a `grid-template-columns:1fr 1fr` para equilibrar ambos botones.

### 6. Repaso general

Después de los 5 puntos, dale una repasada rápida a las otras pantallas de admin que no estén en esta lista pero usen los mismos patrones de grilla (`grid-template-columns` con valores fijos en px) — si encontrás algo obviamente roto en 320-360px con el mismo patrón, arreglalo también y contámelo en las respuestas. No hace falta una auditoría nueva completa, solo un vistazo.

---

## ❓ Preguntas de verificación

Respondé esto al terminar, agregando las respuestas al final de este mismo archivo:

1. ¿Aplicaste los 5 puntos numerados? Si dejaste alguno sin resolver, ¿cuál y por qué?
2. Para el punto 1 (tabla ecléctica): ¿confirmás que el scroll horizontal ahora queda contenido dentro de la tabla y no afecta al resto de la página?
3. Para el punto 4 (fila de match): ¿qué layout elegiste finalmente y por qué?
4. ¿Encontraste algo en el "repaso general" (punto 6) que arreglaste sin que estuviera en la lista original? Si sí, ¿qué?
5. ¿Probaste todo en ~360px y ~320px?
6. ¿Hiciste `git commit` y `push`? Confirmá que no tocaste ningún archivo `.gs`.

---

## Roadmap — con esta tarea se completa la auditoría original

Con la Tarea 8 se cierran los 10 puntos de la auditoría de responsive (Tarea 6). Después de esto, lo único que queda del roadmap original de UX es unificar el sistema de diseño entre `index.html` y `fecha.html` (hoy usan tipografías y variables de color ligeramente distintas — `fecha.html` usa Roboto Slab en vez de Oswald para los números). Lo definimos como Tarea 9 si Marco quiere seguir.
