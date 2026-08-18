# PROJECT_STATE.md — NGT

**Última actualización:** 2026-08-18
**Repo:** MarBar82/NGT — rama `main`
**Contexto:** Cada tarea nueva se define acá con instrucciones técnicas y preguntas de verificación. Abrí Claude Code en `C:\Users\marco\NGT` y decile que lea este archivo y ejecute la tarea.

Progreso: Tareas 1 a 8 completadas — toda la auditoría original (estructura, seguridad, y los 10 puntos de responsive) está resuelta. Esta es la Tarea 9, la última: unificar el sistema de diseño entre `index.html` y `fecha.html`.

**Nota de corrección:** el diagnóstico original decía que `fecha.html` usaba una tipografía distinta (Roboto Slab) a `index.html` (Oswald) para el número de fecha. Al revisar el código con más detalle, eso era impreciso: los dos archivos usan Roboto Slab en `.fc-num`/`.fc-lnum` — es consistente. El problema real, al revés de lo que se pensaba, es que **`index.html` nunca carga la tipografía Roboto Slab** desde Google Fonts, así que esos elementos caen a una fuente serif genérica en vez de mostrarse como Roboto Slab. Esta tarea corrige eso, más la diferencia real de colores.

Es una tarea **solo frontend**, no toca `Code37.gs` ni módulos `.gs`, no requiere deploy en Apps Script, solo `git push`.

---

## 🎯 Tarea para Claude Code

### A) Agregar Roboto Slab al `<link>` de Google Fonts de `index.html`

`index.html` línea 19 tiene:
```html
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Barlow:wght@400;500;600&family=Oswald:wght@400;700&display=swap" rel="stylesheet">
```

Agregale `&family=Roboto+Slab:wght@700;900` (mismos pesos que ya carga `fecha.html`), para que `.fc-num` y `.fc-lnum` (líneas ~894 y ~908) rendericen la tipografía que su propio CSS ya pide, en vez de caer al serif genérico del navegador.

### B) Unificar las variables de color de `fecha.html` con las de `index.html`

`index.html` (línea 21-26) define:
```css
:root{
  --navy:#00234b;--navy2:#001533;--red:#c8102e;--gold:#c9a84c;
  --white:#fff;--off:#f7f6f3;--g1:#f0eeea;--g2:#e3e0d8;
  --g3:#bbb8b0;--g4:#8a8780;--g5:#3d3c38;--text:#1a1918;
  --border:1px solid #e3e0d8;
}
```

`fecha.html` (línea 10-14) define un `:root` distinto, con valores más genéricos y variables faltantes:
```css
:root {
  --navy:#00234B; --red:#C8102E; --gold:#C9A84C;
  --white:#fff; --off:#F5F5F5; --g1:#F0F0F0; --g2:#E0E0E0; --g4:#888; --g5:#333;
  --blue-bg:#dbe7f5;
}
```

Reemplazá el `:root` de `fecha.html` por el mismo bloque exacto que usa `index.html` (mismos valores hex), **agregando** `--blue-bg:#dbe7f5;` al final (esa variable es específica de `fecha.html`, para el fondo de "salida Azules" — no está en `index.html` y no hace falta que esté, solo agregala ahí).

Después de cambiar el `:root`, revisá que no se rompa nada: `fecha.html` va a empezar a usar `--g3`, `--text` y `--border` si en algún lado los referencia (probablemente no, ya que no los tenía definidos antes — si encontrás algún selector que los necesite y no los tenía, decime qué encontraste).

### C) Confirmar que no queden más divergencias de tipografía

Buscá todos los `font-family` distintos que usa cada archivo y confirmá que la lista de fuentes cargadas en el `<link>` de Google Fonts de cada uno cubra exactamente lo que su CSS usa (ni de más ni de menos). Si encontrás alguna otra fuente declarada en CSS pero no cargada (como pasaba con Roboto Slab en `index.html`), decime cuál.

---

## ❓ Preguntas de verificación

Respondé esto al terminar, agregando las respuestas al final de este mismo archivo:

1. ¿Agregaste Roboto Slab al `<link>` de `index.html`? Confirmá los pesos que quedaron.
2. ¿Reemplazaste el `:root` de `fecha.html` por el de `index.html` + `--blue-bg`? ¿Encontraste algún selector en `fecha.html` que dependiera de los valores viejos y se vea distinto ahora (aunque sea sutil)?
3. Del punto C: ¿encontraste alguna otra fuente usada en CSS pero no cargada en el `<link>`, en cualquiera de los dos archivos?
4. ¿Probaste visualmente (o por lectura de código) que el número de fecha en `index.html` (modal "Ver Líneas") ahora se vea con Roboto Slab y no con el serif genérico de antes?
5. ¿Hiciste `git commit` y `push`? Confirmá que no tocaste ningún archivo `.gs`.

---

## ✅ Respuestas de verificación — Tarea 9 (2026-08-18)

**1. ¿Agregaste Roboto Slab al `<link>` de `index.html`?**

Sí. El link quedó:
```
family=Barlow+Condensed:wght@400;500;600;700;800
&family=Barlow:wght@400;500;600
&family=Oswald:wght@400;700
&family=Roboto+Slab:wght@700;900
&display=swap
```
Pesos de Roboto Slab: **700 y 900** — los mismos que ya cargaba `fecha.html` y que corresponden a las declaraciones `font-weight:900` en `.fc-num` y `font-weight:700` en `.fc-lnum`.

**2. ¿Reemplazaste el `:root` de `fecha.html`? ¿Se ve algo distinto?**

Sí, reemplazado. El `:root` de `fecha.html` ahora es idéntico al de `index.html` más `--blue-bg:#dbe7f5`.

Diferencias de color que cambian visualmente (todas muy sutiles — mismo tono, paleta más cálida):

| Variable | Antes | Después | Usado en `fecha.html` |
|----------|-------|---------|----------------------|
| `--off` | `#F5F5F5` (neutro) | `#f7f6f3` (levemente cálido) | `body`, info boxes, footer |
| `--g1` | `#F0F0F0` | `#f0eeea` | bordes tenues |
| `--g2` | `#E0E0E0` | `#e3e0d8` | bordes de cards |
| `--g4` | `#888` | `#8a8780` | textos secundarios (label, icon) |
| `--g5` | `#333` | `#3d3c38` | texto info-box |

El impacto visual es mínimo — ningún contraste que se rompe ni color que cambia de categoría. Las cajas de info (`.fc-inf-box`) van a tener un borde `#e3e0d8` en vez de `#E0E0E0`, lo que las hace levemente más cálidas, consistente con el resto del sistema.

Las variables nuevas (`--navy2`, `--g3`, `--text`, `--border`) están definidas pero no son referenciadas por ningún selector de `fecha.html` — confirmado por grep que devolvió vacío.

**3. Punto C — ¿otras fuentes usadas pero no cargadas?**

`index.html` usa estas `font-family` en CSS/JS:
- `'Barlow Condensed'` → ✅ cargada (400–800)
- `'Barlow'` → ✅ cargada (400–600)
- `'Oswald'` → ✅ cargada (400, 700)
- `'Roboto Slab'` → ✅ **ahora cargada** (700, 900) — era la brecha que corrige esta tarea
- `Barlow Condensed` sin comillas y `\'Barlow Condensed\'` → misma familia, en strings JS

`fecha.html` usa:
- `'Barlow Condensed'` → ✅ cargada (400, 600–900)
- `'Roboto Slab'` → ✅ cargada (700, 900)

No se encontraron otras fuentes usadas en CSS pero no cargadas en ninguno de los dos archivos.

**4. ¿El número de fecha en `index.html` ahora se ve con Roboto Slab?**

Sí, por construcción: `.fc-num` (línea ~908) y `.fc-lnum` (línea ~904) declaran `font-family:'Roboto Slab',serif`. Antes, como Roboto Slab no estaba en el `<link>`, el navegador caía al `serif` genérico (Times New Roman o similar según el SO). Ahora que está cargada, los números de fecha y línea en el modal "Ver Líneas" dentro de `index.html` van a renderizar con Roboto Slab — igual que en `fecha.html`.

**5. Commit y push**

- ✅ Commit: `65ec742` — "Unify design system: Roboto Slab font + color tokens (Task 9)"
- ✅ Push a `origin/main` exitoso
- ✅ Solo se modificaron `index.html`, `fecha.html` y `PROJECT_STATE.md` — ningún `.gs` fue tocado

---

## Roadmap — con esta tarea se completa el roadmap original completo

Con la Tarea 9 se cierra el roadmap completo que armamos en la auditoría inicial: estructura, seguridad, rendimiento, y diseño. No hay más tareas pendientes de esa auditoría — lo que siga después es lo que Marco quiera sumar de nuevo.
