/**
 * Path arithmetic shared between the frontend and the Rust side's own
 * conventions. Kept dependency-free (no Tauri imports) so it can be unit
 * tested directly in Node.
 *
 * Both POSIX (`/home/x/a.md`) and Windows (`C:\Users\x\a.md`,
 * `\\server\share\a.md`) absolute forms are supported: `payload.dir` comes
 * straight from Rust's `PathBuf::to_string_lossy()`, which is native per
 * platform, while a Markdown author's link `src`/`href` is always written
 * with `/`.
 */

/** `\\server\share` — a Windows UNC root. */
const UNC_ROOT = /^\\\\[^\\]+\\[^\\]+/;
/** `C:\` or `C:/` — a Windows drive root. */
const DRIVE_ROOT = /^[A-Za-z]:[\\/]/;

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || DRIVE_ROOT.test(path) || UNC_ROOT.test(path);
}

/**
 * Splits an absolute path into its root (`/`, `C:\` or `\\server\share`) and
 * the separator the rest of the string is written with, so relative
 * segments can be rejoined the way the path arrived.
 */
function splitRoot(path: string): { root: string; sep: "/" | "\\" } {
  const sep: "/" | "\\" = path.includes("\\") ? "\\" : "/";

  const unc = path.match(UNC_ROOT);
  if (unc) return { root: `${unc[0]}${sep}`, sep };
  if (DRIVE_ROOT.test(path)) return { root: `${path.slice(0, 2)}${sep}`, sep };
  if (path.startsWith("/")) return { root: "/", sep };
  return { root: "", sep };
}

/**
 * Joins a document's directory with a path a Markdown link or image `src`
 * points at, resolving `.`/`..`. `relative` may itself be absolute (an
 * author linking with a leading `/` or a full `C:\...`/`\\server\...` path),
 * in which case it is returned unchanged.
 */
export function joinPath(dir: string, relative: string): string {
  if (isAbsolutePath(relative)) return relative;

  const { root, sep } = splitRoot(dir);
  const segments = `${dir.slice(root.length)}/${relative}`
    .split(/[\\/]/)
    .filter((part) => part !== "" && part !== ".");

  const stack: string[] = [];
  for (const part of segments) {
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return `${root || "/"}${stack.join(sep)}`;
}

export function dirName(path: string): string {
  const { root } = splitRoot(path);
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSlash < root.length) return root || "/";
  return path.slice(0, lastSlash);
}

/**
 * Strips a `file://` scheme off a path, mirroring Rust's
 * `strip_file_scheme` — `file:///C:/Users/x/a.md` must become
 * `C:/Users/x/a.md`, not the `/C:/Users/x/a.md` a plain `slice(7)` would
 * leave.
 */
export function stripFileScheme(value: string): string {
  if (!value.startsWith("file://")) return value;
  try {
    return decodeURIComponent(new URL(value).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  } catch {
    return value.slice(7);
  }
}
