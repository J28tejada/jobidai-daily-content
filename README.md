# jobidai-daily-content — Ideas Diarias

Máquina de generación de ideas de contenido. Todos los días a las 7am (hora de Santo Domingo)
busca lo que se está moviendo en tech/IA/automatización, le pide a Claude resúmenes y ángulos
de contenido, guarda todo en Supabase y manda un resumen por WhatsApp.

## Cómo funciona

```
Cron 7am
   ├── HN - Front page ───────→ Normalizar HN ──────────┐
   ├── Reddit - Top del día ──→ Normalizar Reddit ──────┤
   └── Google News - RSS ─────→ Normalizar Google News ─┤
                                                        ▼
                                        Unir todas las fuentes (Merge, 3 inputs)
                                                        ▼
                                        Preparar lote para Claude   ← dedupe + prompts
                                                        ▼
                                        Claude - Generar ángulos    ← Anthropic Messages API
                                                        ▼
                                        Parsear respuesta IA        ← JSON → filas
                                                        ▼
                                        Guardar en Supabase         ← ideas_diarias
                                                        ▼
                                        Formatear mensaje
                                                        ▼
                                        Enviar por WhatsApp
```

Por cada item, Claude devuelve un resumen, 2–3 ángulos de contenido con su gancho, un formato
sugerido y un `score_relevancia` de 0 a 10. Por WhatsApp salen las 5 mejores con score 5+; el
resto queda en la tabla.

## Estructura

```
├── workflows/
│   ├── ideas-diarias.json     # GENERADO — esto es lo que se importa en n8n
│   └── nodes/*.js             # fuente de verdad de los code nodes
├── supabase/schema.sql        # tabla ideas_diarias + índices + RLS
├── prompts/generacion-ideas.md# el prompt, versionado
├── scripts/
│   ├── setup.md               # guía paso a paso ← empieza aquí
│   ├── build-workflow.js      # nodes/*.js → ideas-diarias.json
│   └── test-pipeline.js       # 29 checks de la lógica, sin n8n ni red
└── .env.example
```

## Empezar

```bash
node scripts/test-pipeline.js    # verificar que la lógica pasa
```

Para el despliegue completo: **[`scripts/setup.md`](scripts/setup.md)**.

## Decisiones que conviene conocer

- **El JSON del workflow es generado.** Editá `workflows/nodes/*.js` y corré
  `node scripts/build-workflow.js`. Si editás un code node desde la UI de n8n, copiá el cambio
  de vuelta o el próximo build lo pisa.
- **El system prompt vive en dos lugares** (el nodo `Preparar lote para Claude` y
  `prompts/generacion-ideas.md`) y deben moverse juntos, en el mismo commit.
- **Modelo:** `claude-opus-5`, definido en `workflows/nodes/prep.js`. Para bajar costo,
  cambiarlo a `claude-sonnet-5` y regenerar.
- **Re-ejecutar es seguro.** El índice único `(fecha, url_hash)` evita duplicados del mismo día.
- **Nada se pierde por un fallo de la IA.** Si Claude no devuelve JSON válido, las filas se
  guardan igual con `error = 'parse_error'` para poder diagnosticar.
- **El cron depende de la timezone de la instancia de n8n**, no de la del workflow. Ver setup.
- **No hay catch-up.** Si la PC está apagada a las 7am, ese día no corre. Decisión pendiente.

## Estado

| Paso | Estado |
|------|--------|
| Repo y artefactos | listo |
| Lógica del pipeline (29 checks) | pasando |
| Schema aplicado en Supabase | listo — proyecto **Contaller** (`thxyfinqkzxjkjbrdbsp`) |
| Credenciales en n8n | pendiente — requiere la PC |
| Workflow importado | pendiente — requiere la PC |
| Prueba end-to-end | pendiente — requiere la PC |
| Cron activo | pendiente — requiere la PC |
