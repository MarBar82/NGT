# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 15 cerrada y verificada (commits `ca7b6f3` y `a8c3d8b`) — "Finalizar Ronda" ya guarda de verdad a los 4 jugadores, "Revisar Tarjetas" re-sincroniza el Leaderboard, y `cargarTarjeta_` usa el mismo mutex por jugador que `cargarHoyoLive_`. Verificando esa tarea encontré un caso borde chico en la Parte B — esta Tarea 16 lo cierra. Es un fix de una línea, un solo archivo, no requiere deploy en Apps Script.

---

## 🎯 Contexto de la tarea

En la Tarea 15 Parte B se agregó la variable global `LIVE_REVIEW_MAT` (`index.html`, línea ~5638): se pone en `liveVerTarjetaJugador(mat)` para marcar "este guardado viene de Revisar Tarjetas, hay que re-firmar al jugador después", y se limpia (`LIVE_REVIEW_MAT = null`) únicamente dentro de `handleOk` en `liveSmConfirm`, cuando efectivamente se guarda un hoyo editado.

El problema: si el usuario entra a "Revisar Tarjetas", abre la tarjeta de un jugador solo para mirarla (sin tocar ningún hoyo) y la cierra con la X o tocando el fondo, `LIVE_REVIEW_MAT` nunca se limpia — queda "pegado" con la matrícula de ese jugador. Como es una variable de la página, no se resetea al cambiar de fecha. Entonces: si más adelante (fecha siguiente, línea distinta) ese mismo jugador carga un hoyo de forma normal durante Live Scoring, `liveSmConfirm` va a comparar `LIVE_REVIEW_MAT === mat`, encontrar que coincide (por la matrícula vieja pegada), y tratar ese guardado normal como si fuera una edición de revisión: no dispara `liveAutoAdvancePlayer` (así que no avanza automáticamente al siguiente jugador) y en cambio llama a `liveFirmarJugador` de forma innecesaria.

No corrompe datos ni pierde información — el hoyo se guarda igual — pero rompe la UX de auto-avance para ese jugador puntual, de forma confusa (parece un bug intermitente porque solo pasa si antes alguien miró su tarjeta en Revisar Tarjetas sin editar nada).

---

## 🎯 Tarea para Claude Code

En `openLiveView(fecha, cancha)` (`index.html`, ~línea 6064 — la función que arranca Live Scoring para una fecha/línea, donde ya se resetean `LIVE_LINEA_DATA`, `LIVE_MATCH_LINEA`, `LIVE_MATCH_DATA`, etc.), agregá una línea más:

```js
LIVE_REVIEW_MAT = null;
```

Así cada vez que se entra a Live Scoring de cero para una fecha, el flag de revisión arranca limpio, sin importar qué haya quedado pegado de una sesión anterior.

Confirmá con grep que no hay otro lugar donde `LIVE_REVIEW_MAT` debería resetearse también (por ejemplo, al cerrar la vista de Live Scoring por completo, si existe una función de "salir" separada de `openLiveView`).

No hace falta tocar nada más — `liveVerTarjetaJugador` y `handleOk` en `liveSmConfirm` quedan igual que en la Tarea 15.

---

## ❓ Preguntas de verificación

1. ¿Agregaste el reset en `openLiveView`? ¿Encontraste algún otro lugar donde convenga resetear `LIVE_REVIEW_MAT` (por ejemplo, al salir de Live Scoring)?
2. ¿Hiciste el commit? Hash y mensaje.
3. ¿Algo de esta tarea te generó dudas? Contame qué decidiste y por qué.

---

## ✅ Respuestas de verificación — Tarea 16

**1. Reset en `openLiveView` y otros lugares:**

Sí, agregué `LIVE_REVIEW_MAT = null;` en `openLiveView` (línea 6071 en index.html), junto con los otros resets de `LIVE_LINEA_DATA`, `LIVE_MATCH_LINEA` y `LIVE_MATCH_DATA`.

Evalué los otros candidatos:

- **`closeFloatingModal()`**: descartado. Esta función genérica también se llama cuando el usuario hace la transición tarjeta-revisión → score modal (línea 6583: `onclick="closeFloatingModal();liveOpenScoreModal(...)"`). Si reseteara `LIVE_REVIEW_MAT` ahí, lo limpiaría en el momento equivocado — justo antes de que el usuario edite el hoyo — convirtiendo el flujo de revisión en un guardado normal sin re-firma.

- **Salir de Live Scoring (`pg('lb')`, `LIVE_MODE=false`)**: no es necesario. Cuando el usuario sale de Live Scoring y después vuelve a entrar (nueva fecha, nueva línea), siempre pasa por `openLiveView` — que ahora ya limpia el flag. Agregar el reset también en la salida sería defensivo pero redundante.

- **Escenario within-session (mismo jugador, misma sesión)**: structuralmente imposible. "Revisar Tarjetas" solo aparece en `liveRenderComplete()`, que requiere `holesCargados === 18` para TODOS los jugadores. Una vez que se llega ahí, no hay más scoring normal disponible en esa sesión. El unique path real del bug es cross-session/cross-fecha, y `openLiveView` lo cubre completamente.

**2. Commit:**

`143106c` — `Tarea 16 — reset LIVE_REVIEW_MAT en openLiveView (index.html)`

**3. Dudas:**

La única duda fue si `closeFloatingModal` necesitaba el reset. Después de trazar el flujo (el mismo `closeFloatingModal` se llama en la transición tarjeta→score-modal), quedó claro que no. El fix de una línea en `openLiveView` es suficiente y no toca nada más, como pedía la tarea.
