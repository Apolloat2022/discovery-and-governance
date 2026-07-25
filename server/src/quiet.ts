/**
 * node:sqlite emits an experimental-feature warning the moment it is imported.
 * It is expected here and only adds noise to every command's output, so this
 * module drops that one warning and leaves every other warning intact.
 *
 * Import it *before* node:sqlite — ES modules evaluate imports in source order,
 * so the override has to be registered first to catch the warning.
 */
const emitWarning = process.emitWarning.bind(process);

process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (text.includes("SQLite is an experimental feature")) return;
  return (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

export {};
