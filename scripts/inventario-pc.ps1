# ============================================================================
# Inventario de la PC de servicios — SOLO LECTURA
#
# No instala, no detiene, no modifica nada. Solo mira y reporta.
#
# Uso (PowerShell como Administrador, para ver procesos de otros usuarios):
#   cd <carpeta del repo>
#   powershell -ExecutionPolicy Bypass -File scripts\inventario-pc.ps1 > inventario.txt
#
# Después pégame el contenido de inventario.txt.
# ============================================================================

function Seccion($t) { "`n" + ("=" * 70); "  $t"; ("=" * 70) }

Seccion "SISTEMA"
"Host      : $env:COMPUTERNAME"
"Usuario   : $env:USERNAME"
"Fecha     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
"Timezone  : $((Get-TimeZone).Id)  <-- importante: el cron de las 7am depende de esto"
"Uptime    : $((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime)"

Seccion "RUNTIMES"
foreach ($c in 'node','npm','n8n','pm2','python','git','docker') {
  $p = Get-Command $c -ErrorAction SilentlyContinue
  if ($p) {
    $v = try { & $c --version 2>&1 | Select-Object -First 1 } catch { '?' }
    "{0,-8} {1,-10} {2}" -f $c, $v, $p.Source
  } else {
    "{0,-8} NO INSTALADO" -f $c
  }
}

Seccion "PROCESOS NODE / PYTHON (aqui aparecen los bots)"
$procs = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match '^(node|python|pythonw)\.exe$' }
if (-not $procs) { "ninguno corriendo" }
foreach ($p in $procs) {
  "`nPID $($p.ProcessId)  [$($p.Name)]  iniciado $($p.CreationDate)"
  "  cmd: $($p.CommandLine)"
}

Seccion "PM2 (si se usa para mantener bots vivos)"
if (Get-Command pm2 -ErrorAction SilentlyContinue) { pm2 list 2>&1 } else { "pm2 no instalado" }

Seccion "SERVICIOS QUE NO SON DE WINDOWS"
Get-CimInstance Win32_Service |
  Where-Object { $_.PathName -and $_.PathName -notmatch 'C:\\Windows\\' } |
  Select-Object Name, State, StartMode, PathName |
  Format-Table -AutoSize -Wrap

Seccion "TAREAS PROGRAMADAS (excluye las de Microsoft)"
Get-ScheduledTask |
  Where-Object { $_.TaskPath -notlike '\Microsoft\*' } |
  Select-Object TaskName, State, @{n='Accion';e={ ($_.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' | ' }} |
  Format-Table -AutoSize -Wrap

Seccion "PUERTOS ESCUCHANDO (n8n suele estar en 5678)"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -notmatch '^(::1|127\.0\.0\.53)$' } |
  Select-Object LocalAddress, LocalPort,
    @{n='Proceso';e={ (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }},
    OwningProcess |
  Sort-Object LocalPort -Unique |
  Format-Table -AutoSize

Seccion "CARPETAS QUE HUELEN A BOT / AUTOMATIZACION"
$raices = @("$env:USERPROFILE\Documents", "$env:USERPROFILE\Desktop", "$env:USERPROFILE",
            'C:\bots', 'C:\proyectos', 'C:\apps', 'C:\srv') | Where-Object { Test-Path $_ }
foreach ($r in $raices) {
  Get-ChildItem $r -Directory -Depth 2 -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'bot|whatsapp|wa-|baileys|venom|n8n|automat|jobidai|finanz' } |
    ForEach-Object { "  $($_.FullName)   (modificado $($_.LastWriteTime.ToString('yyyy-MM-dd')))" }
}

Seccion "WORKFLOWS DE n8n INSTALADOS"
$db = "$env:USERPROFILE\.n8n\database.sqlite"
if (Test-Path $db) {
  "DB: $db  ($([math]::Round((Get-Item $db).Length/1MB,1)) MB, modificada $((Get-Item $db).LastWriteTime))"
  "(para listar los workflows por nombre hace falta sqlite3; si no lo tienes, se ven en la UI de n8n)"
} else {
  "no existe $db  -> n8n quiza corre con otro usuario, en Docker, o con N8N_USER_FOLDER distinto"
}

Seccion "SESIONES DE WHATSAPP GUARDADAS (indican un bot ya autenticado)"
$hits = Get-ChildItem $env:USERPROFILE -Recurse -Depth 4 -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(auth_info|auth_info_baileys|\.wwebjs_auth|tokens|session)$' }
if ($hits) { $hits | ForEach-Object { "  $($_.FullName)   (modificado $($_.LastWriteTime.ToString('yyyy-MM-dd')))" } }
else { "ninguna encontrada" }

"`n`n=== FIN — pegale esta salida a Claude ==="
