export { cloneFileContent, cloneFileMap, type FileContent, type FileMap } from "./core/files.js";
export { applyOverlay, OverlayError, parseRemovalList } from "./core/overlay.js";
export {
  hasTemplateTokens,
  replaceTokens,
  TEMPLATE_TOKEN_NAMES,
  type TemplateTokenName,
  type TemplateTokens,
} from "./core/tokens.js";
export { renderLicenseBlock, type LicenseKind } from "./core/license.js";
export {
  createScaffoldPlan,
  type ScaffoldPlan,
  type ScaffoldPlanOptions,
  type TemplateVariant,
} from "./core/plan.js";
export { DependencyRewriteError, rewriteLinkedDependencies } from "./core/dependencies.js";
export {
  readTemplateDirectory,
  writeFileMap,
  FilesystemTemplateError,
} from "./adapters/filesystem.js";
export {
  scaffoldProject,
  ScaffoldProjectError,
  type ScaffoldProjectOptions,
  type ScaffoldProjectResult,
} from "./adapters/scaffold.js";
export { main, runCli } from "./cli.js";
