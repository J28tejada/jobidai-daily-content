# Instrucciones para Claude Code — Setup "Ideas Diarias"

Este documento es para que Claude Code lo lea y ejecute el setup completo del proyecto
"Ideas Diarias" en la PC de Windows que corre n8n. Sigue los pasos en orden y valida cada uno
antes de continuar al siguiente. No asumas que un paso funcionó — verifica el output.

## Contexto del proyecto

Josue (full-stack developer, IT admin, fundador de Jobidai) está construyendo su marca personal
como experto en "automatización + IA aplicada a negocios reales". Este workflow es una máquina
de generación de ideas de contenido: todos los días a las 7am busca temas trending en tech/IA/
automatización, genera resúmenes y ángulos de contenido con Claude, guarda todo en Supabase, y
manda un resumen por WhatsApp.

**Stack usado:**
- n8n corriendo en una PC con Windows (PC de servicios, dedicada a este tipo de tareas — ya corre
  ahí un bot de WhatsApp para Jobidai)
- Supabase como base de datos (proyecto ya existe, se accede vía MCP en Claude o directo)
- Claude API (Anthropic) para generar los resúmenes/ángulos
- Bot de WhatsApp ya existente (el mismo que usa Jobidai) para el envío del mensaje diario
- Acceso a la PC vía SSH (ya configurado previamente, usado para el bot de WhatsApp)

**Repo del proyecto:** ya está armado con esta estructura (clonarlo o crearlo si no existe):

```
ideas-diarias/
├── README.md
├── workflows/
│   └── ideas-diarias.json      # Workflow de n8n, listo para importar
├── supabase/
│   └── schema.sql               # Tabla ideas_diarias + RLS
├── prompts/
│   └── generacion-ideas.md      # System/user prompt del nodo de IA, versionado
├── scripts/
│   └── setup.md                 # Guía detallada de configuración (referencia adicional)
└── .env.example                 # Variables necesarias, sin valores reales
```

## Objetivo de esta sesión

Dejar el workflow corriendo end-to-end en la PC de Windows: desde el cron de las 7am hasta el
mensaje de WhatsApp, pasando por las 3 fuentes de datos, Claude generando ángulos, y el guardado
en Supabase.

## Pasos a ejecutar

### 1. Confirmar acceso y entorno

- Verificar conexión SSH a la PC de Windows (usar el mismo método ya configurado para el bot de
  WhatsApp existente).
- Confirmar que n8n está instalado y corriendo: `n8n --version` (mínimo recomendado 1.6+).
- Si no hay acceso SSH configurado en esta sesión, pedir a Josue las credenciales/host antes de
  continuar — no asumir ni inventar valores.

### 2. Clonar o ubicar el repo

- Si el repo ya existe en GitHub, clonarlo en la PC de Windows.
- Si aún no se ha subido, pedir a Josue la URL del repo, o ayudarlo a crearlo primero
  (`git init`, `git remote add origin`, `git push`) antes de continuar.

### 3. Aplicar el schema de Supabase

- Ejecutar el contenido de `supabase/schema.sql` contra el proyecto de Supabase.
- Si el MCP de Supabase está disponible en esta sesión de Claude Code, usarlo directamente
  (`apply_migration` o `execute_sql`) en lugar de pedirle a Josue que lo pegue manualmente.
- Confirmar que la tabla `ideas_diarias` se creó correctamente (`list_tables` o `execute_sql`
  con un `select` de prueba).

### 4. Crear credenciales en n8n

Dentro de n8n (Settings → Credentials), guiar la creación de:

- **Anthropic API** — pedir la API key a Josue si no está ya en variables de entorno o gestor de
  secretos. Nombre sugerido: `Anthropic API`.
- **Supabase** — URL del proyecto + `service_role` key (NO la `anon` key). Nombre sugerido:
  `Supabase - ideas_diarias`.
- **WhatsApp** — reutilizar la credencial/nodo que ya existe del bot de Jobidai. Preguntar a
  Josue dónde está configurado si no es evidente.

No hardcodear ninguna key directamente en el JSON del workflow ni en archivos versionados —
usar el sistema de credenciales de n8n.

### 5. Importar el workflow

- Importar `workflows/ideas-diarias.json` en n8n (Workflows → Import from File).
- **Verificar manualmente** que el nodo `Unir todas las fuentes` (tipo Merge) tenga 3 inputs
  habilitados — n8n a veces importa este nodo con solo 2 por defecto. Ajustar si es necesario.
- Asignar las credenciales del paso 4 a los nodos correspondientes:
  - `Claude - Generar ángulos` → credencial Anthropic API
  - `Guardar en Supabase` → credencial Supabase
  - `Enviar por WhatsApp` → reemplazar el nodo placeholder (`noOp`) por el nodo real del bot de
    WhatsApp existente, usando `{{ $json.mensaje }}` como texto a enviar

### 6. Completar el system prompt

- El nodo `Claude - Generar ángulos` tiene un placeholder en el campo `system`.
- Copiar el contenido completo de la sección "System prompt" en `prompts/generacion-ideas.md`
  (versión v1) y pegarlo en ese campo dentro de n8n.

### 7. Prueba end-to-end

- Ejecutar el workflow manualmente en n8n ("Execute Workflow").
- Validar en orden:
  1. Las 3 fuentes (HN, Reddit, Google News) devuelven datos — revisar output de cada nodo
     normalizador.
  2. Claude devuelve JSON válido — revisar el nodo "Parsear respuesta IA". Si muchos items salen
     con `descartable: true` o `error: parse_error`, reportarlo a Josue antes de continuar (puede
     requerir ajustar el prompt).
  3. Se insertan filas nuevas en la tabla `ideas_diarias` de Supabase (confirmar con una query).
  4. Llega el mensaje de WhatsApp con formato correcto y legible.
- Si algún paso falla, diagnosticar el error específico (revisar logs del nodo en n8n) antes de
  reintentar — no repetir ejecuciones a ciegas.

### 8. Activar el workflow

- Una vez validado el paso 7 sin errores, activar el workflow (toggle "Active" en n8n).
- Confirmar que el cron está configurado para las 7am hora de Santo Domingo (verificar timezone
  de la instancia de n8n, ya que el cron expression `0 7 * * *` depende de la timezone del server).

### 9. Verificar disponibilidad

- Confirmar si n8n está configurado para iniciar automáticamente con Windows (Task Scheduler o
  como servicio). Si no lo está, preguntar a Josue si quiere configurarlo así, dado que el cron
  diario depende de que la PC esté encendida.
- Informar a Josue que, si hay cortes de luz frecuentes, el cron no correrá ese día — no
  implementar un catch-up automático sin confirmarlo con él primero (es una decisión de diseño,
  no algo a asumir).

## Qué NO hacer sin confirmar con Josue

- No modificar el prompt de generación de ideas sin avisar (está versionado en
  `prompts/generacion-ideas.md` — cualquier cambio debería reflejarse ahí también).
- No exponer puertos ni configurar acceso externo a la PC sin confirmar (mencionó preocupación
  por CGNAT/ISP en conversaciones previas).
- No commitear archivos `.env` ni credenciales reales al repo.
- No activar el cron (paso 8) hasta que el paso 7 pase sin errores.

## Estado esperado al finalizar

- Tabla `ideas_diarias` creada en Supabase.
- Workflow importado, con credenciales asignadas y system prompt completo.
- Prueba manual exitosa: datos de las 3 fuentes → Claude → Supabase → WhatsApp.
- Workflow activado con cron diario a las 7am.
- Josue informado de cualquier limitación encontrada (timezone, disponibilidad de la PC, etc.).
