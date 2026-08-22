/*
 * Typings for the markdown-it plugins that ship none.
 *
 * Inline `import(...)` types are used so this file stays a global script and
 * the `declare module` blocks below register as ambient declarations.
 */

declare module "markdown-it-abbr" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-deflist" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-footnote" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-ins" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-mark" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-sub" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-sup" {
  const plugin: import("markdown-it").PluginSimple;
  export default plugin;
}
declare module "markdown-it-emoji" {
  export const full: import("markdown-it").PluginSimple;
  export const light: import("markdown-it").PluginSimple;
  export const bare: import("markdown-it").PluginSimple;
}
declare module "markdown-it-container" {
  interface ContainerOptions {
    validate?: (params: string) => boolean;
    render?: (
      tokens: import("markdown-it").Token[],
      idx: number,
      options: import("markdown-it").Options,
      env: unknown,
      self: import("markdown-it").Renderer,
    ) => string;
    marker?: string;
  }
  const plugin: import("markdown-it").PluginWithParams;
  export default plugin;
  export type { ContainerOptions };
}
declare module "markdown-it-task-lists" {
  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: import("markdown-it").PluginWithOptions<TaskListOptions>;
  export default plugin;
  export type { TaskListOptions };
}
