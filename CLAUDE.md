# Contexto del proyecto — Ideas Diarias

Lee esto antes de tocar nada. Resume en qué estado quedó el proyecto y qué falta,
para no repetir trabajo ya hecho ni re-descubrir decisiones ya tomadas.

## Qué es

Workflow de n8n que todos los días a las 7am (hora de Santo Domingo) busca temas en
Hacker News, Reddit y Google News, le pide a Gemini resúmenes y ángulos de contenido,
guarda en Supabase y manda un resumen por WhatsApp.

Dueño: Josue Tejada (Jobidai). Marca personal: "automatización + IA aplicada a negocios reales".

## Estado real

| Pieza | Estado |
|---|---|
| Tabla `ideas_diarias` en Supabase | **Aplicada y verificada** — proyecto **Contaller** (`thxyfinqkzxjkjbrdbsp`) |
| `workflows/ideas-diarias.json` | Generado, importable. 14 nodos, Merge con 3 inputs |
| Lógica del pipeline | 31 checks pasando (`node scripts/test-pipeline.js`) |
| Credenciales en n8n | **Pendiente** |
| Workflow importado en n8n | **Pendiente** |
| Nodo de WhatsApp | **Pendiente — es el hueco real**, ver abajo |
| Prueba end-to-end | **Pendiente** |
| Cron activo | **Pendiente** |

Las fuentes (HN/Reddit/Google News) **nunca se probaron en vivo**: el entorno donde se armó
esto tenía la red restringida. La lógica que procesa sus respuestas sí está probada contra el
formato real de cada API, pero que las URLs respondan hoy está sin confirmar. Es lo primero
que hay que ver al ejecutar el workflow.

## El hueco: WhatsApp

El nodo `Enviar por WhatsApp` es un `noOp` de relleno. El bot que se pensaba reutilizar
probablemente vivía en un VPS que Josue ya no usa, así que puede que no haya nada que reutilizar.

Antes de decidir, correr `scripts/inventario-pc.ps1` (solo lectura) para ver qué bots hay vivos
en esta PC. Josue sabe de uno de "registro de finanzas"; la pregunta es si hay otro y si tiene
una sesión de WhatsApp autenticada aprovechable.

Las dos opciones, ya discutidas con él y **sin decidir**:
- **WhatsApp Cloud API (oficial):** encaja como un HTTP Request más, no depende de la PC.
  Requiere número dedicado, verificación de negocio, y **plantilla aprobada** — el mensaje de
  las 7am lo inicia el sistema, así que cae fuera de la ventana de 24h.
- **Bot no oficial (Baileys / whatsapp-web.js):** se levanta hoy con su número, pero se
  desautentica cada tanto, depende de que la PC esté encendida, y Meta puede banear el número.

No elijas por él. Es una decisión de diseño con costos distintos.

## Decisiones ya tomadas (no revertir sin hablarlo)

- **El JSON del workflow es generado.** La fuente son `workflows/nodes/*.js` +
  `scripts/build-workflow.js`. Si editas un code node desde la UI de n8n, copia el cambio de
  vuelta a `workflows/nodes/` y regenera, o el próximo build lo pisa.
- **El modelo se nombra en un solo lugar:** constante `MODELO` en `workflows/nodes/prep.js`
  (`gemini-3.5-flash`). La URL del nodo HTTP lo interpola. **Verificar el id exacto en AI Studio**
  antes de correr: si difiere, la API responde 404.
- **El system prompt vive en dos lugares** — el nodo `Preparar lote para el modelo` y
  `prompts/generacion-ideas.md`. Se mueven juntos, en el mismo commit.
- **Gemini se llama por HTTP Request plano** con Header Auth (`x-goog-api-key`), no con la
  credencial "Google Gemini" de n8n. A propósito: funciona igual sin importar la versión de n8n.
- **Nada se pierde si el modelo falla.** JSON inválido → `error = 'parse_error'`. 200 sin texto
  (filtro de seguridad o corte por `MAX_TOKENS`) → `error = 'sin_respuesta:<motivo>'`. Son
  distintos a propósito, para diagnosticar sin adivinar.
- **Re-ejecutar el mismo día es seguro:** índice único `(fecha, url_hash)`, y el nodo de Supabase
  va en `onError: continue`.
- **No hay catch-up.** Si la PC está apagada a las 7am, ese día no corre. Decisión pendiente,
  no un bug — Josue pidió no implementarlo sin confirmarlo.

## Trampas conocidas

- **El cron depende de la timezone de la instancia de n8n**, no de la del workflow. Si la
  instancia está en UTC, `0 7 * * *` dispara a las 3:00 AM en Santo Domingo. Verificar antes de activar.
- **El nodo Merge** a veces se importa con 2 inputs en vez de 3. El JSON dice 3; verificar igual.
- **Supabase necesita la `service_role` key.** La `anon` no pasa el RLS y el insert falla.
- **Reddit devuelve 429** si se pierde el header `User-Agent` al importar.

## Reglas de trabajo

- No commitear `.env` ni llaves reales. Las credenciales van en n8n, nunca en el JSON versionado.
- No activar el cron hasta que la prueba manual pase limpia.
- Si muchos items salen con `parse_error` o `descartable: true`, parar y avisar a Josue —
  es el prompt, no algo que se arregle reintentando.
- Rama de trabajo: `claude/code-setup-execution-prw0vg`.

## Comandos

```bash
node scripts/test-pipeline.js       # 31 checks, sin n8n ni red
node scripts/build-workflow.js      # regenera workflows/ideas-diarias.json
powershell -ExecutionPolicy Bypass -File scripts\inventario-pc.ps1 > inventario.txt
```

Guía completa de despliegue: `scripts/setup.md`.
