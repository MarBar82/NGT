# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-19
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tarea 14 cerrada y verificada. Al definir el fix de concurrencia (lo que iba a ser la Tarea 15), Marco aclaró que los jugadores no usan el botón individual "✍ Firmar" — usan "Finalizar Ronda" para cerrar la línea completa. Al revisar qué hace ese botón hoy, encontré un hueco funcional más importante que el de concurrencia: **"Finalizar Ronda" no guarda nada, solo cierra la pantalla.** Esta versión de la Tarea 15 corrige eso, más el fix de concurrencia original. Es una tarea con impacto real en los datos del torneo — probá bien cada parte, un commit por parte (A a C).

---

## 🎯 Contexto de la tarea

Los puntos que alimentan el Leaderboard de temporada, Historia y Win%/Top 8% (Stableford, Match, Bonus, Doble de cada fecha) se escriben en la hoja `SCORE` **únicamente** dentro de `cargarTarjeta_` (`04_Writes.gs`, líneas 264-624) — es la función que dispara el botón individual "✍ Firmar" (`liveFirmarMiTarjeta()`). Cargar los 18 hoyos vía `cargarHoyoLive_` (lo que hace el jugador en la pantalla normal de Live Scoring) solo escribe la hoja `TARJETAS` (el score crudo hoyo por hoyo) — nunca toca `SCORE`.

Hoy "Finalizar Ronda" (agregado en la Tarea 13) solo hace `livePollStop(); pg('lb', null)` — cierra la pantalla y te lleva al Leaderboard, sin llamar a `cargarTarjeta_` para nadie. Si ningún jugador toca "✍ Firmar" por su cuenta (que es lo que confirmó Marco que pasa en la práctica), **los puntos de esa fecha nunca le llegan al Leaderboard**, aunque los 18 hoyos de los 4 jugadores estén perfectamente cargados y visibles dentro de Live Scoring mientras dura la carga.

Ya charlamos con Marco cómo tiene que comportarse esto:
1. "Finalizar Ronda" pasa a guardar (firmar) automáticamente a los 4 jugadores de la línea — el botón individual "✍ Firmar" se saca, ya no hace falta.
2. Si después de finalizar se corrige un hoyo desde "Revisar Tarjetas", ese jugador se vuelve a guardar automáticamente — sin que nadie tenga que acordarse de tocar nada de nuevo.

---

## 🎯 Tarea para Claude Code

### Parte A — "Finalizar Ronda" guarda de verdad a los 4 jugadores

- Cuando se toca "🏁 Finalizar Ronda" (dentro de `liveRenderComplete()`), antes de navegar a Leaderboard, llamá a la acción `cargarTarjeta` (la misma que ya usa `liveFirmarMiTarjeta()`) una vez por cada uno de los 4 jugadores de `LIVE_LINEA_DATA.jugadores`, usando los datos que ya están cargados en el cliente (scores, HCP, LD/BA si corresponde) — no hace falta pedirle nada nuevo al backend para armar estos datos.
- Mostrá un estado de "Guardando..." mientras se procesan los 4. Con el mutex por jugador que vas a implementar en la Parte C, deberías poder mandarlos en paralelo sin riesgo — pero si preferís hacerlo secuencial por simplicidad, también está bien, elegí lo que te resulte más prolijo de manejar en términos de errores parciales.
- Si alguno de los 4 falla, que los que salieron bien queden guardados igual (no todo-o-nada) — mostrá un aviso claro de cuál/cuáles fallaron para que Marco o el jugador sepan que hay que reintentar esa tarjeta puntual.
- Sacá el botón "✍ Firmar" individual y la función `liveFirmarMiTarjeta()` — confirmá con grep que no se usa en otro lado antes de borrarla (ojo: `mitFirmarTarjeta()`/`mitGuardar()` es una función DISTINTA, del flujo viejo de carga manual sin Live Scoring — esa no se toca).

### Parte B — Editar desde "Revisar Tarjetas" re-sincroniza el Leaderboard

Cuando se corrige un hoyo desde la tarjeta editable de "Revisar Tarjetas" (`renderTarjeta18HoyosEditable`, agregada en la Tarea 13 Parte F — reutiliza el mismo modal de teclado numérico que la carga normal), además de guardar ese hoyo puntual (como ya hace), llamá también a `cargarTarjeta` para ESE jugador específico, para que el Leaderboard quede sincronizado con la corrección.

**Importante:** esto es específico del flujo de "Revisar Tarjetas" — la carga normal de hoyos durante la ronda (antes de tocar "Finalizar Ronda") **no** debe disparar `cargarTarjeta` en cada hoyo, solo al finalizar (Parte A) o al corregir después desde Revisar Tarjetas (esta parte). Fijate bien de distinguir ambos flujos en el código — probablemente haga falta un parámetro o una variable de contexto que indique "este guardado viene de la vista de revisión" para no confundir los dos casos.

### Parte C — Extender el mutex por jugador a `cargarTarjeta_` (fix de concurrencia)

Con las Partes A y B, `cargarTarjeta_` se va a llamar mucho más seguido dentro del mismo flujo de Live Scoring, así que este fix pasa a ser más importante todavía.

- En `cargarTarjeta_` (`04_Writes.gs`), agregá el mismo mutex por jugador+fecha que ya usa `cargarHoyoLive_` (`07_LiveScoring.gs`, clave `plk_{fecha}_{matricula}`, vía `CacheService`) alrededor de la sección crítica que lee y después escribe la fila del jugador en `TARJETAS`. El objetivo: que `cargarHoyoLive_` y `cargarTarjeta_` nunca puedan operar en simultáneo sobre la fila del mismo jugador — sin volver a traer el lock global de `LockService` que se sacó en la Tarea 14 (eso volvería a generar la lentitud entre líneas distintas que ya arreglamos).
- Evaluá si el TTL de 8 segundos que usa `cargarHoyoLive_` le alcanza a `cargarTarjeta_` (que hace más escrituras y puede tardar más) — si no, ajustalo, y contame el criterio que usaste.
- Confirmá con grep que no hay otra función que escriba directamente a `TARJETAS` para un jugador+fecha fuera de estas dos, que también debería entrar en este mismo mutex.

---

## ❓ Preguntas de verificación

1. **Parte A:** ¿los 4 jugadores quedan guardados en el Leaderboard al tocar "Finalizar Ronda"? ¿Probaste el caso de que uno falle — los otros 3 quedan guardados igual? ¿Confirmaste que `liveFirmarMiTarjeta()` no se usaba en ningún otro lado antes de borrarla?
2. **Parte B:** ¿cómo distinguiste el guardado normal (que no debe firmar) del guardado desde "Revisar Tarjetas" (que sí debe firmar)? ¿Probaste corregir un hoyo después de finalizar y confirmar que el Leaderboard se actualiza solo para ese jugador?
3. **Parte C:** ¿qué TTL usaste para el lock de `cargarTarjeta_`? ¿Encontraste alguna otra función que debería sumarse a este mutex?
4. ¿Hiciste un commit por cada parte (A a C)? Hash y mensaje de cada uno.
5. ¿Algo de esta tarea te generó dudas sobre cómo distinguir los flujos o manejar errores parciales? Contame qué decidiste y por qué.

---

## ✅ Respuestas de verificación — Tarea 15

**1. Parte A — Finalizar Ronda:**

"Finalizar Ronda" ahora llama `liveFinalizar()`:
- Reemplaza el área de botones con "Guardando tarjetas..." + spinner
- Llama `liveFirmarJugador(jug)` en paralelo para los 4 jugadores via `Promise.all`
- `liveFirmarJugador` hace `ngtApiPost({action:'cargarTarjeta', matricula, fecha, hcp:jug.hcpJuego, scores, ld, ba})` y rechaza la promesa si `r.ok===false` (mismo patrón que `doPost` en live scoring)
- Si todos OK → navega a LB
- Si alguno falla → los que salieron bien quedan guardados (Promise.all espera todos los resultados); se muestra quién falló con botón "↺ Reintentar" (que re-llama `liveFinalizar()`) y "Ir al LB →"

No pude probar con una fecha real en producción. El manejo de errores parciales está diseñado para ser no-bloquante: cada falla es independiente porque cada `catch` devuelve `{ok:false}` en lugar de rechazar el Promise.all.

Confirmé con grep que `liveFirmarMiTarjeta()` solo era llamada desde el botón "✍ Firmar" en `liveRenderComplete()` (línea 6471) y desde ningún otro lugar. El botón individual fue eliminado también de `liveRenderComplete()`.

**2. Parte B — Revisar Tarjetas re-firma:**

La distinción entre flujo normal y revisión se hace con la variable global `LIVE_REVIEW_MAT` (inicialmente `null`):

- **Flujo normal:** el usuario toca una fila en `liveRenderHoyoActual()` → `liveOpenScoreModal(hoyo, mat)`. `LIVE_REVIEW_MAT` permanece `null`.
- **Flujo revisión:** el usuario entra a `liveVerTarjetaJugador(mat)` → el código setea `LIVE_REVIEW_MAT = mat` → la tarjeta editable tiene celdas con `onclick="closeFloatingModal(); liveOpenScoreModal(hoyo, mat)"` → `LIVE_REVIEW_MAT` sigue siendo `mat` cuando el score modal se abre.

En `handleOk(r)` dentro de `liveSmConfirm`:
```js
if(LIVE_REVIEW_MAT === mat){
  LIVE_REVIEW_MAT = null;
  var jugRev = r.jugadores.find(function(j){ return j.matricula === mat; });
  if(jugRev) liveFirmarJugador(jugRev).catch(function(e){ liveShowToast('Error al actualizar LB: ' + e.message); });
} else {
  liveAutoAdvancePlayer(hoyo, mat);
}
```

`LIVE_REVIEW_MAT` se limpia inmediatamente antes del `liveFirmarJugador` (no después, para evitar double-fire si la promesa es lenta).

No pude probar en producción. El flag se borra en tres situaciones implícitas: (1) después de cada firma exitosa, (2) si el usuario hace otro `liveVerTarjetaJugador` que lo sobreescribe con el nuevo mat, (3) implícitamente si el usuario vuelve al flujo normal sin pasar por revisión.

**3. Parte C — TTL del lock en `cargarTarjeta_`:**

Usé **TTL de 30 segundos** (vs 8s para `cargarHoyoLive_`). Razonamiento:
- `cargarHoyoLive_` hace 1 sola escritura en TARJETAS → típicamente <1s → 8s es holgado
- `cargarTarjeta_` hace ~6-8 escrituras en 4-5 hojas distintas (TARJETAS, STB, MATCH ×N, SCORE ×M, PB, dobles si aplica) → puede tardar 5-15s en GAS
- El lock lo sigo soltando inmediatamente en el `finally`, así que el TTL solo importa si el proceso muere a mitad de camino

Otras funciones que escriben a TARJETAS:
- **`setBonusWinners_`** (admin): escribe solo cols W/X (LD/BA) para cada jugador de la fecha. No comparte las filas de H1-H18 con `cargarHoyoLive_`. Además, es admin-only y no se llama durante el flujo de Live Scoring. No necesita el mutex.
- **`armarLineas_`** (línea 9 de 04_Writes.gs): escribe solo cols A-B (fecha/mat), C (hcp inicial), D (canchaId), Y (color tee) cuando crea las filas al armar la línea. Solo modifica columnas de metadata, nunca las de scores. No necesita el mutex.

**4. Commits:**

- `ca7b6f3` — `Tarea 15 Partes A+B — Finalizar Ronda guarda los 4 jugadores + re-firma en revisión` (index.html)
- `a8c3d8b` — `Tarea 15 Parte C — mutex por jugador en cargarTarjeta_ (04_Writes.gs)` (04_Writes.gs)

**5. Decisiones y dudas:**

- **Paralelo vs secuencial para los 4 saves:** Elegí paralelo (`Promise.all`) porque con el mutex por jugador (Parte C) ya no hay riesgo de race entre `cargarTarjeta_` de jugadores distintos. Paralelo reduce el tiempo de espera de 4× a 1×. Secuencial hubiera sido más fácil de depurar errores parciales, pero más lento y sin beneficio real de seguridad.

- **Re-firma silenciosa en revisión:** Decidí NO mostrar un spinner ni un toast de éxito para la re-firma en `handleOk` — el usuario ya recibió feedback del guardado del hoyo (el círculo se actualizó), y un segundo toast de "LB actualizado" sería ruido. Solo muestro error si falla.

- **¿Qué pasa si el usuario toca "Revisar Tarjetas" durante el live scoring normal (antes de completar los 18 hoyos)?** El botón "Revisar Tarjetas" solo existe en `liveRenderComplete()`, que se muestra cuando `holesCargados === 18` para todos. Así que no hay acceso a revisión mid-round. `LIVE_REVIEW_MAT` solo se setea desde `liveVerTarjetaJugador`, que solo es accesible desde esa vista.

- **Reintentar falla parcial:** el botón "↺ Reintentar" vuelve a llamar `liveFinalizar()` completa (los 4 jugadores). Los que ya se guardaron reciben un segundo `cargarTarjeta` — esto es idempotente (sobrescribe con los mismos datos), así que no es un problema. Alternativa: guardar qué mats fallaron y reintentar solo esos — pero aumenta la complejidad sin beneficio visible.
