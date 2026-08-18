# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: ✅ logo duplicado, ✅ código muerto de admin key, ✅ `fecha.html` dinámico, ✅ `Code37.gs` dividido en 10 módulos (ya deployado y probado). Esta es la tarea 5 — dos limpiezas chicas de prioridad media, antes de pasar a lo visual/UX.

---

## 🎯 Tarea para Claude Code

Son dos limpiezas independientes. Hacelas en este orden y no mezcles los commits (un commit por cada una).

### A) Confirmar si `fecha-3.html` es un archivo huérfano

1. Buscá cualquier referencia a `fecha-3.html` (o `fecha-3`) en todo el proyecto: `index.html`, todos los `.gs`, `fecha.html`, `fecha-4.html`, `fecha-5.html`, `fecha-6.html`, y cualquier `.md` del repo.
2. Fijate si `fecha-3.html` tiene la constante `FECHA_NUM` (las otras versiones sí la tienen) y compará su estructura contra `fecha-4.html` para entender si es una versión más vieja/distinta o algo aparte.
3. Si confirmás que no lo referencia nada del proyecto y que quedó reemplazado por el patrón `fecha.html?f=N`, borralo (`git rm fecha-3.html`) y hacé commit solo con ese cambio.
4. Si encontrás algo que sí lo usa, o algo que te genere dudas, **no lo borres** — dejalo como está y explicá qué encontraste en la respuesta de verificación.

### B) Limpieza automática de sesiones vencidas

Contexto: cada login guarda una sesión en `PropertiesService.getDocumentProperties()` con clave `SES_<token>` y expiración de 90 días (ver `guardarSesion_` y `validarSesion_` en `02_Auth.gs`), pero nada borra las que ya vencieron — se acumulan para siempre. `PropertiesService` tiene un límite total de almacenamiento por documento, así que esto puede convertirse en un problema con el tiempo.

1. En `02_Auth.gs`, agregá una función `limpiarSesionesVencidas_()` que:
   - Recorra todas las propiedades del documento (`getProperties()`).
   - Filtre las que empiezan con `SES_`.
   - Parsee cada una como JSON y compare su campo `exp` contra `Date.now()`.
   - Borre (`deleteProperty`) las que ya vencieron.
   - Registre en el log (`Logger.log` o similar) cuántas borró, para poder revisarlo en las ejecuciones del trigger.
2. Agregá una función instaladora `instalarTriggerLimpiezaSesiones()` que cree un trigger diario para `limpiarSesionesVencidas_`, siguiendo el mismo patrón que ya usa `instalarTriggerWarmup()` en `01_Utils.gs` (primero borrar cualquier trigger existente con ese handler para no duplicar, después crear el nuevo). No hace falta que corra a una hora específica, cualquier hora del día está bien.
3. No toques `guardarSesion_`, `validarSesion_` ni ninguna otra función de autenticación — esta tarea es puramente agregar la limpieza, no cambiar cómo se crean o validan las sesiones.

---

## ❓ Preguntas de verificación

Respondé esto al terminar, agregando las respuestas al final de este mismo archivo:

1. ¿`fecha-3.html` se borró o se dejó? ¿Qué evidencia encontraste para esa decisión (o qué duda te generó)?
2. ¿Cuántas propiedades `SES_` había hoy en el documento al momento de escribir/probar `limpiarSesionesVencidas_()` (si pudiste consultarlo), y cuántas eran de sesiones ya vencidas?
3. ¿`instalarTriggerLimpiezaSesiones()` sigue el mismo patrón que `instalarTriggerWarmup()` (evita duplicar triggers si se ejecuta más de una vez)?
4. ¿Hace falta que yo ejecute manualmente `instalarTriggerLimpiezaSesiones()` una vez desde el editor de Apps Script para que el trigger quede activo (como hicimos en su momento con el trigger de HCP)? Confirmalo.
5. ¿Hiciste dos commits separados (uno por cada limpieza) y el push correspondiente?

---

## ✅ Respuestas de verificación — Tarea 5 (2026-08-18)

**1. `fecha-3.html`: se borró**

Evidencia para la decisión:
- Búsqueda en todos los `.html`, `.gs` y `.md` del repo: ninguna referencia funcional.
- `index.html:3413` menciona `fecha-3` solo en un comentario que explica el routing interno del SPA (`// Dynamic fecha routing: id like "fecha-3" → use the single "pg-fecha" page`) — el SPA usa IDs de página internos, no rutas a archivos `.html`.
- `requerimiento-live-scoring.md` la menciona solo como contexto histórico de documentación.
- `fecha-3.html` **no tiene la constante `FECHA_NUM`** (las versiones 4/5/6 sí la tienen) — es una versión anterior al patrón, con 423 líneas y sin media queries responsive, estructuralmente distinta e incompatible con `fecha.html?f=3`.
- Conclusión: archivo huérfano, reemplazado por `fecha.html?f=3`. Eliminado con `git rm`.

**2. Propiedades `SES_` consultadas**

No fue posible consultar `PropertiesService` desde el repo local — eso requiere ejecutar código en el entorno de Apps Script. El conteo real de sesiones activas/vencidas solo lo podés ver vos corriendo `limpiarSesionesVencidas_()` manualmente desde el editor de Apps Script (verás el log inmediatamente después de ejecutarla).

**3. Patrón anti-duplicado**

Sí. `instalarTriggerLimpiezaSesiones()` sigue exactamente el mismo patrón que `instalarTriggerWarmup()`:

```js
ScriptApp.getProjectTriggers().forEach(function(t) {
  if (t.getHandlerFunction() === 'limpiarSesionesVencidas_') ScriptApp.deleteTrigger(t);
});
ScriptApp.newTrigger('limpiarSesionesVencidas_').timeBased().everyDays(1).create();
```

Si la ejecutás más de una vez, borra el trigger existente antes de crear el nuevo — no se duplica.

**4. ¿Hay que ejecutarla manualmente una vez?**

**Sí.** Apps Script no crea triggers automáticamente al deployar — requieren ser instalados explícitamente con permisos del propietario del script. El flujo es el mismo que usaste para `instalarTriggerWarmup`:

1. Abrí el proyecto en script.google.com.
2. Seleccioná la función `instalarTriggerLimpiezaSesiones` en el dropdown.
3. Ejecutá y autorizá permisos si se solicitan.
4. Verificá en *Triggers* (reloj) que aparece `limpiarSesionesVencidas_` con frecuencia diaria.

Una vez instalado, corre solo todos los días sin más acción de tu parte.

**5. Commits y push**

Sí, dos commits separados pusheados a `main`:
- `037ae08` — Remove fecha-3.html (orphan file)
- `00f4604` — Add session cleanup: limpiarSesionesVencidas_ + trigger installer
