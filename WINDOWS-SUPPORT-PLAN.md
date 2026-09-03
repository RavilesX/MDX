# Plan de acción — Compatibilidad con Windows

Estado actual: MDX compila y funciona solo en Linux (WebKitGTK, systemd, rutas
POSIX, Chromium por `PATH`). El objetivo es que el mismo árbol de código
produzca un binario e instalador funcional en Windows 10/11 x64 sin romper
Linux.

Referencias de código en este documento apuntan a `archivo:línea` del repo.

---

## Resumen de bloqueantes

| # | Área | Bloqueante | Severidad |
|---|------|-----------|-----------|
| 1 | Rust / rutas | `fs::canonicalize` devuelve rutas UNC `\\?\C:\...` | Alta |
| 2 | Rust / PDF | `pdf.rs` busca binarios Linux y arma `file://` inválido | Alta |
| 3 | Frontend | `joinPath` / `dirName` asumen `/` como separador | Alta |
| 4 | Bundle | `targets` sin `nsis`, `icon` sin `.ico` | Alta |
| 5 | Watcher | Comparación de rutas sensible a mayúsculas | Media |
| 6 | CLI | Prefijo `file://` mal recortado con letra de unidad | Media |
| 7 | Warm start | `--hidden` depende de systemd | Media |
| 8 | Scripts / CI | Solo `install-linux.sh`, sin build de Windows | Media |
| 9 | Docs | README y `package.json` dicen "for Linux" | Baja |

---

## Fase 0 — Entorno de compilación

Sin cambios de código. Requisitos para construir en Windows:

- Rust `stable-x86_64-pc-windows-msvc` (no GNU).
- Visual Studio Build Tools 2022 con la carga "Desarrollo para escritorio con C++".
- Node 20+.
- **WebView2 Runtime** — el equivalente de WebKitGTK en Windows. Preinstalado en
  Windows 11 y en Windows 10 actualizado; el instalador debe cubrir el resto
  (ver Fase 4).

Entregable: `scripts/install-deps.ps1` con `winget install Rustlang.Rustup
Microsoft.VisualStudio.2022.BuildTools OpenJS.NodeJS Microsoft.EdgeWebView2Runtime`.

---

## Fase 1 — Normalización de rutas en Rust ✅ hecho

### 1.1 Canonicalización UNC

`fs::canonicalize` en Windows devuelve el prefijo verbatim `\\?\C:\...`. Esa
cadena viaja al frontend y rompe el título, `convertFileSrc`, el scope del
protocolo `asset:` y la comparación del watcher.

Afecta a [document.rs:42](src-tauri/src/document.rs#L42),
[document.rs:170](src-tauri/src/document.rs#L170),
[document.rs:186](src-tauri/src/document.rs#L186),
[lib.rs:37](src-tauri/src/lib.rs#L37) y
[watcher.rs:104](src-tauri/src/watcher.rs#L104).

Acción: añadir `dunce = "1"` a `Cargo.toml` y sustituir todas las llamadas por
`dunce::canonicalize`, que devuelve la ruta simple cuando es representable.
Centralizarlo en un helper nuevo, `document::canonical(path) -> io::Result<PathBuf>`,
y que los cinco puntos lo usen.

### 1.2 Fallback de directorio raíz

[document.rs:68](src-tauri/src/document.rs#L68) usa `PathBuf::from("/")` cuando
el fichero no tiene padre. En Windows no es una raíz válida.

Acción: reemplazar por la raíz real derivada de `resolved` (`resolved.ancestors().last()`),
con `"/"` solo como último recurso en Unix.

### 1.3 Comparación de rutas

[watcher.rs:85](src-tauri/src/watcher.rs#L85) y
[watcher.rs:90](src-tauri/src/watcher.rs#L90) comparan `p == watched`. NTFS es
insensible a mayúsculas y `notify` (ReadDirectoryChangesW) puede emitir la ruta
con distinta capitalización que la canonicalizada, con lo que el auto-reload
nunca dispararía.

Acción: helper `same_path(a, b)` — igualdad exacta en Unix, comparación
`eq_ignore_ascii_case` sobre la forma normalizada en Windows. Usarlo en
`matches_event`, `is_removal` y en la comprobación de duplicado de
[watcher.rs:112](src-tauri/src/watcher.rs#L112).

### 1.4 Argumento `file://`

[lib.rs:35](src-tauri/src/lib.rs#L35) hace `strip_prefix("file://")`. En Windows
las URL de fichero son `file:///C:/x.md`, así que queda `/C:/x.md`, que no
existe. Además el shell puede pasar rutas percent-encoded.

Acción: función `path_from_arg(arg: &str) -> String` que quite `file://`,
descodifique `%XX` y, en Windows, elimine la barra inicial cuando lo que sigue
encaja con `letra + ':'`. Cubrir con tests unitarios.

---

## Fase 2 — Exportación a PDF (el cambio más grande) ✅ código hecho, sin verificar en Windows real

[pdf.rs](src-tauri/src/pdf.rs) es hoy código exclusivamente Linux:

- `CANDIDATES` ([pdf.rs:4-12](src-tauri/src/pdf.rs#L4-L12)) son nombres de
  binario de distro; en Windows los ejecutables no están en `PATH`.
- La detección ejecuta `--version` ([pdf.rs:16](src-tauri/src/pdf.rs#L16)). En
  Windows `chrome.exe --version` no escribe en stdout y su código de salida no
  es fiable como sonda.
- `format!("file://{}", temp_html.display())`
  ([pdf.rs:39](src-tauri/src/pdf.rs#L39)) produce `file://C:\Users\...`, que no
  es una URL válida.
- El proceso hijo abriría una ventana de consola.

Acción — reescribir `find_browser()` con `#[cfg]`:

```rust
#[cfg(windows)]
fn find_browser() -> Option<PathBuf> {
    // Rutas conocidas bajo %ProgramFiles%, %ProgramFiles(x86)% y %LOCALAPPDATA%
    // para msedge.exe, chrome.exe, brave.exe, chromium.exe.
    // Detección por existencia del fichero, no ejecutando --version.
    // Respaldo: HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe
}
```

Además:

- Construir la URL con `Url::from_file_path(&temp_html)` (crate `url`) en vez de
  concatenar, o normalizar a mano a `file:///C:/...` con `/` y percent-encoding.
- En Windows, añadir `CREATE_NO_WINDOW` (`0x0800_0000`) vía
  `std::os::windows::process::CommandExt::creation_flags` para que no parpadee
  una consola.
- Usar `--headless=new` (Edge y Chrome modernos lo requieren); mantener
  `--no-pdf-header-footer` y `--disable-gpu`.
- Mensaje de error específico por plataforma: en Windows, Edge está siempre
  presente, así que el fallo real solo debería ocurrir en instalaciones muy
  atípicas.

`--no-sandbox` puede quedarse; en headless de un solo uso no aporta riesgo nuevo
sobre HTML que nosotros mismos generamos.

---

## Fase 3 — Rutas en el frontend ✅ hecho

### 3.1 `joinPath` y `dirName`

[bridge.ts:185-200](src/app/bridge.ts#L185-L200) están escritos para POSIX:
detectan absoluto con `startsWith("/")`, parten por `/` y reconstruyen con
prefijo `/`. Con `C:\Users\x\notas` devuelven basura, y el webview de Windows
entrega rutas con `\` tanto en drag-and-drop como en los payloads de Rust.

Acción:
- Exportar `IS_WINDOWS` desde `bridge.ts` (usando `@tauri-apps/plugin-os` o, sin
  añadir dependencia, detectando `/^[A-Za-z]:[\\/]/` en la primera ruta recibida).
- Reescribir ambas funciones: normalizar `\` → `/` para operar, detectar
  absoluto con `/^([A-Za-z]:[\\/]|\\\\|\/)/`, preservar el prefijo de unidad o
  UNC (`\\servidor\recurso`) al reconstruir, y devolver con el separador nativo.
- Tests en `tests/` cubriendo: `C:\a\b` + `../c`, `\\srv\share\a` + `b.md`,
  y los casos POSIX actuales (no deben cambiar).

### 3.2 Recorte de `file://` en el viewer

[viewer.ts:264](src/app/viewer.ts#L264) hace `src.slice(7)`, mismo defecto que
1.4. Reutilizar un helper compartido en `bridge.ts`.

### 3.3 Detalles de UI

- Atajos: [main.ts:336](src/main.ts#L336) ya acepta `ctrlKey`, y las pistas del
  menú dicen "Ctrl". Sin cambios.
- [main.ts:210](src/main.ts#L210): la etiqueta "Show in file manager" puede
  pasar a "Show in Explorer" en Windows. Cosmético, opcional.
- `revealInFileManager` usa `opener:allow-open-path`, que en Windows abre el
  Explorador. Sin cambios de capacidades.

---

## Fase 4 — Empaquetado ✅ hecho

`bundle` en [tauri.conf.json](src-tauri/tauri.conf.json) solo declara `deb` y
`appimage`, y `bundle.icon` no incluye `icons/icon.ico` — obligatorio en
Windows (el fichero ya existe en `src-tauri/icons/`).

Acción — mover lo específico de plataforma a ficheros de configuración por
plataforma, que Tauri v2 fusiona automáticamente:

- `src-tauri/tauri.linux.conf.json`: `targets: ["deb", "appimage"]` y el
  `desktopTemplate` actual.
- `src-tauri/tauri.windows.conf.json`:
  - `targets: ["nsis"]` (opcionalmente `msi`; NSIS es el que soporta bien las
    asociaciones de archivo y la instalación por usuario).
  - `bundle.windows.webviewInstallMode: { "type": "downloadBootstrapper" }` —
    resuelve el WebView2 ausente sin inflar el instalador.
  - `bundle.windows.nsis.installMode: "currentUser"` — instala sin UAC.
- `tauri.conf.json` base: añadir `"icons/icon.ico"` al array `icon`.

Asociaciones de archivo: `fileAssociations` ya está declarado y el bundler NSIS
lo traduce a ProgIDs de Windows. `mimeType` se ignora fuera de Linux. Verificar
en QA que "Abrir con → MDX" y el doble clic funcionan tras instalar.

`main.rs` ya lleva `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`,
así que la build de release no abre consola. Sin cambios.

---

## Fase 5 — Instancia caliente (`--hidden`) ✅ hecho

El plugin `single-instance` ya funciona en Windows, así que el reenvío del
documento al proceso vivo ([lib.rs:92](src-tauri/src/lib.rs#L92)) no requiere
cambios. Lo que no existe es systemd.

Acción: sustituir `packaging/mdx.service` por, en Windows, un acceso directo
`MDX (warm).lnk` con argumento `--hidden` en la carpeta de Inicio
(`shell:startup`), creado opcionalmente por el instalador o por el script de la
Fase 6. Alternativa documentada: tarea programada "al iniciar sesión".

Nota: sin ese arranque, la primera apertura paga el coste de inicializar
WebView2 igual que hoy paga WebKitGTK en Linux; no es un bloqueante funcional.

---

## Fase 6 — Scripts ✅ hecho

- `scripts/install-deps.ps1` — dependencias de compilación (Fase 0).
- `scripts/install-windows.ps1` — build, copia a
  `%LOCALAPPDATA%\Programs\MDX`, añade al `PATH` del usuario y crea el acceso
  directo de arranque en caliente. Equivalente a `install-linux.sh`.
- `scripts/make-icons.py` — revisar que también emita `icon.ico` con los tamaños
  16/32/48/256.

`install-linux.sh` y `packaging/*` se quedan como están.

---

## Fase 7 — Integración continua ✅ hecho

Crear `.github/workflows/build.yml` con matriz:

| Runner | Artefactos |
|--------|-----------|
| `ubuntu-22.04` | `.deb`, `.AppImage` |
| `windows-latest` | instalador NSIS `.exe` |

Usando `tauri-apps/tauri-action`. Añadir un job de `npm test` y `cargo test` en
ambos sistemas, para que las regresiones de rutas se detecten solas.

---

## Fase 8 — Pruebas ✅ unitarias hechas, QA manual pendiente de máquina Windows real

Unitarias nuevas:
- `path_from_arg` — `file:///C:/a.md`, `file:///home/x/a.md`, rutas con `%20`.
- `same_path` — diferencias de capitalización y de separador.
- `joinPath` / `dirName` en TypeScript — casos Windows y POSIX.

Los tests actuales de [lib.rs:179-181](src-tauri/src/lib.rs#L179-L181) usan
literales `/tmp/a.MD`, pero solo ejercitan el parseo de extensión, así que
siguen siendo válidos en Windows. `finds_an_existing_file`
([lib.rs:160](src-tauri/src/lib.rs#L160)) ya usa `env::temp_dir()`: correcto.

QA manual en Windows 11:
1. Doble clic sobre un `.md` desde el Explorador.
2. `mdx notas.md` desde PowerShell con una instancia ya abierta.
3. Arrastrar y soltar un fichero en la ventana.
4. Imágenes locales relativas, incluyendo rutas con espacios y acentos.
5. Auto-reload al guardar desde VS Code y desde Bloc de notas.
6. Wiki-links `[[Nota]]` resueltos en subdirectorios.
7. Exportar HTML, exportar PDF (con enlaces clicables), imprimir.
8. Ficheros con CRLF y con BOM UTF-8.

---

## Fase 9 — Documentación ✅ hecho

- `README.md`: badge `platform-Linux` → `Linux%20%7C%20Windows`, título y
  primera línea, sección de instalación en Windows, nota sobre WebView2, y
  actualizar la mención a WebKitGTK para que cubra ambos motores.
- `package.json:6` — `"description": "Fast Markdown visualizer for Linux"` →
  quitar "for Linux".
- `tauri.conf.json` — `shortDescription` / `longDescription` son neutrales, sin
  cambios.

---

## Riesgos abiertos

- **WebView2 ausente** en Windows 10 sin actualizar. Mitigado con
  `downloadBootstrapper`, pero exige conexión durante la instalación.
- **Headless de Edge/Chrome**: los flags cambian entre versiones mayores.
  Conviene un fallback a `window.print()` con un mensaje claro si el proceso
  falla.
- **Rutas largas (>260 caracteres)**: al quitar el prefijo `\\?\` con `dunce` se
  pierde el soporte de rutas largas. `dunce` mantiene la forma verbatim cuando
  la ruta no es representable, así que el caso queda cubierto, pero merece un
  test.
- **Portable vs instalado**: las asociaciones de archivo solo existen si se pasa
  por el instalador NSIS. Un `.exe` suelto no las registra.

---

## Orden de ejecución sugerido

1. Fase 0 (entorno) — desbloquea todo lo demás.
2. Fase 4 (bundle) + Fase 1 (rutas Rust) — primera build que arranca.
3. Fase 3 (rutas frontend) — primera build usable.
4. Fase 2 (PDF) — última función que queda coja.
5. Fases 5, 6, 7, 8, 9 — pulido, distribución y documentación.

Las fases 1, 2 y 3 son independientes entre sí y se pueden repartir.
