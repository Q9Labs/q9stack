import { installTemplates } from "../adapters/template-installer.js";
import { writeLine } from "../adapters/terminal.js";

export async function initCommand(repoRoot: string, force: boolean): Promise<number> {
  const result = await installTemplates(repoRoot, force);
  for (const file of result.written) {
    writeLine(`wrote ${file}`);
  }
  if (result.lefthookSnippet !== undefined) {
    writeLine("lefthook.yml already exists. Merge this snippet manually:\n");
    writeLine(result.lefthookSnippet.trimEnd());
  }
  return 0;
}
