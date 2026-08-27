# Setup — Ideas Diarias

Guía para dejar el workflow corriendo en la PC de Windows que hostea n8n.
Los pasos 1–3 se pueden hacer desde cualquier lado; del 4 en adelante hay que estar en la PC.

---

## 0. Prerrequisitos

- n8n 1.6+ corriendo en la PC de Windows (`n8n --version`)
- Node 18+ si vas a correr los scripts de este repo
- Acceso al proyecto de Supabase
- API key de Anthropic
- El bot de WhatsApp de Jobidai andando

---

## 1. Clonar el repo en la PC

```bash
git clone https://github.com/J28tejada/jobidai-daily-content.git
cd jobidai-daily-content
cp .env.example .env      # llenar con los valores reales; .env NO se commitea
```

---

## 2. Aplicar el schema en Supabase

Opción A — desde Claude Code con el MCP de Supabase:

```
apply_migration(project_id=<ref>, name="ideas_diarias_v1", query=<contenido de supabase/schema.sql>)
```

Opción B — manual: pegar `supabase/schema.sql` en el SQL Editor del proyecto y ejecutar.

El script es idempotente: correrlo dos veces no rompe nada.

Verificar:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'ideas_diarias'
order by ordinal_position;
```

Deben salir 16 columnas y la tabla debe tener RLS activo.

---

## 3. Crear las credenciales en n8n

`Settings → Credentials → Add credential`:

| Nombre                     | Tipo      | Qué lleva |
|----------------------------|-----------|-----------|
| `Anthropic API`            | Anthropic | La API key de Anthropic |
| `Supabase - ideas_diarias` | Supabase  | Host del proyecto + **service_role** key |

> La `anon` key **no sirve**: la tabla tiene RLS y ninguna policy permite escritura a `anon`.
> El workflow escribe con `service_role`, que hace bypass de RLS.

Nunca pongas llaves dentro del JSON del workflow ni en archivos versionados.

---

## 4. Importar el workflow

`Workflows → Import from File → workflows/ideas-diarias.json`

Después de importar, revisar en orden:

1. **`Unir todas las fuentes`** debe tener **3 inputs**. n8n a veces importa el nodo Merge con 2.
   Si pasa: abrir el nodo, poner *Number of Inputs* = 3, y reconectar el normalizador que
   quedó suelto (HN→input 1, Reddit→input 2, Google News→input 3).
2. **`Claude - Generar ángulos`** → asignar la credencial `Anthropic API`.
3. **`Guardar en Supabase`** → asignar `Supabase - ideas_diarias`.
4. **`Enviar por WhatsApp`** es un placeholder (`noOp`). Reemplazarlo por el nodo real del bot
   de Jobidai y usar `{{ $json.mensaje }}` como texto del mensaje. Borrar el noOp y reconectar
   `Formatear mensaje → <nodo real>`.

### El system prompt ya viene incluido

A diferencia de versiones anteriores, **no hay que pegar el prompt a mano**. Vive en la constante
`SYSTEM_PROMPT` del nodo Code `Preparar lote para Claude`, y `prompts/generacion-ideas.md` es la
copia versionada. Si cambias uno, cambia el otro en el mismo commit.

---

## 5. Prueba end-to-end

`Execute Workflow` y validar **en orden** — no pasar al siguiente hasta que el anterior dé bien:

1. **Fuentes.** Los 3 normalizadores deben devolver items.
   - `Normalizar HN` vacío → revisar si Algolia respondió 200.
   - `Normalizar Reddit` vacío o con 429 → el header `User-Agent` se perdió al importar. Reddit
     bloquea User-Agents genéricos.
   - `Normalizar Google News` vacío → probar la URL del RSS en el navegador; Google cambia el
     formato de `ceid`/`hl` cada tanto.
2. **Claude.** `Parsear respuesta IA` no debe traer `error: parse_error`. Si muchos items salen
   con `parse_error` o `descartable: true`, **parar y avisar** — hay que ajustar el prompt, no
   reintentar a ciegas.
3. **Supabase.**
   ```sql
   select fecha, count(*), count(*) filter (where error is not null) as con_error
   from ideas_diarias group by fecha order by fecha desc limit 5;
   ```
4. **WhatsApp.** El mensaje debe llegar legible, con negritas (`*texto*`) e itálicas (`_texto_`)
   renderizadas.

Volver a ejecutar el workflow el mismo día es seguro: el índice único `(fecha, url_hash)` evita
duplicados, y el nodo de Supabase está en `onError: continue` para que un choque no mate la corrida.

---

## 6. Activar

Solo después de que el paso 5 pase limpio: toggle **Active**.

**Verificar la timezone antes.** El cron dispara a las 7:00 de la timezone de *la instancia* de
n8n, no la del workflow:

```
Settings → General → Timezone = America/Santo_Domingo
```

O por variable de entorno al arrancar n8n: `GENERIC_TIMEZONE=America/Santo_Domingo`.
Si la instancia está en UTC, las 7:00 del cron son las 3:00 AM en Santo Domingo.

---

## 7. Disponibilidad

El cron solo corre si la PC está encendida y n8n levantado.

- Confirmar que n8n arranca solo con Windows (Task Scheduler con trigger *At startup*, o como
  servicio con nssm/pm2).
- Si hay cortes de luz, ese día simplemente no corre. **No hay catch-up automático** — es una
  decisión de diseño pendiente, no un bug.

---

## Desarrollo

Los code nodes viven en `workflows/nodes/*.js` (fuente de verdad). El JSON importable es
**generado**:

```bash
node scripts/build-workflow.js     # regenera workflows/ideas-diarias.json
node scripts/test-pipeline.js      # 29 checks de la lógica, sin n8n ni red
```

Si editas un code node desde la UI de n8n, copia el cambio de vuelta a `workflows/nodes/` y
regenera — si no, el próximo build lo pisa.
