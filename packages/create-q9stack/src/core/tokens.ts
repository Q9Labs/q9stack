import { cloneFileContent, type FileContent, type FileMap } from "./files.js";

export const TEMPLATE_TOKEN_NAMES = [
  "__APP_NAME__",
  "__APP_SLUG__",
  "__PRODUCT__",
  "__YEAR__",
  "__LICENSE_BLOCK__",
] as const;

export type TemplateTokenName = (typeof TEMPLATE_TOKEN_NAMES)[number];

export interface TemplateTokens {
  readonly appName: string;
  readonly appSlug: string;
  readonly product: string;
  readonly year: string;
  readonly licenseBlock: string;
}

const tokenPattern = /__(?:APP_NAME|APP_SLUG|PRODUCT|YEAR|LICENSE_BLOCK)__/gu;

function replacementFor(token: string, values: TemplateTokens): string {
  switch (token) {
    case "__APP_NAME__":
      return values.appName;
    case "__APP_SLUG__":
      return values.appSlug;
    case "__PRODUCT__":
      return values.product;
    case "__YEAR__":
      return values.year;
    case "__LICENSE_BLOCK__":
      return values.licenseBlock;
    default:
      return token;
  }
}

function replaceText(text: string, values: TemplateTokens): string {
  return text.replace(tokenPattern, (token) => replacementFor(token, values));
}

export function replaceTokens(files: FileMap, values: TemplateTokens): Map<string, FileContent> {
  const result = new Map<string, FileContent>();
  for (const [path, content] of files) {
    const renamedPath = replaceText(path, values);
    if (result.has(renamedPath)) {
      throw new Error(`Token replacement created duplicate path: ${renamedPath}`);
    }

    result.set(
      renamedPath,
      typeof content === "string" ? replaceText(content, values) : cloneFileContent(content),
    );
  }

  return result;
}

export function hasTemplateTokens(value: string): boolean {
  tokenPattern.lastIndex = 0;
  return tokenPattern.test(value);
}
