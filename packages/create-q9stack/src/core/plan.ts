import { rewriteLinkedDependencies, sortDependencySections } from "./dependencies.js";
import type { FileMap } from "./files.js";
import { renderLicenseBlock, type LicenseKind } from "./license.js";
import { applyOverlay } from "./overlay.js";
import { restorePackedTemplatePaths } from "./template-paths.js";
import { replaceTokens, type TemplateTokens } from "./tokens.js";

export type TemplateVariant = "with-convex" | "without-convex";

export interface ScaffoldPlanOptions {
  readonly variant: TemplateVariant;
  readonly appName: string;
  readonly appSlug: string;
  readonly product: string;
  readonly year: string;
  readonly license: LicenseKind;
  readonly linkLocal?: string;
}

export interface ScaffoldPlan {
  readonly variant: TemplateVariant;
  readonly tokens: TemplateTokens;
  readonly files: FileMap;
}

export function createScaffoldPlan(
  base: FileMap,
  overlay: FileMap,
  options: ScaffoldPlanOptions,
): ScaffoldPlan {
  const merged = restorePackedTemplatePaths(applyOverlay(base, overlay));
  const tokens: TemplateTokens = {
    appName: options.appName,
    appSlug: options.appSlug,
    product: options.product,
    year: options.year,
    licenseBlock: renderLicenseBlock(options.license, options.year),
  };
  let files = sortDependencySections(replaceTokens(merged, tokens));

  if (options.linkLocal !== undefined) {
    files = rewriteLinkedDependencies(files, options.linkLocal);
  }

  return {
    variant: options.variant,
    tokens,
    files,
  };
}
