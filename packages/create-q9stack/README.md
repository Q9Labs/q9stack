# create-q9stack

`create-q9stack` scaffolds a q9labs application from the published q9stack
templates. The package ships a `create-q9stack` binary, so both
`pnpm create q9stack <name>` and `pnpm dlx create-q9stack <name>` are supported.

## Usage

```sh
pnpm create q9stack customer-portal --convex
pnpm create q9stack customer-portal --postgres --license mit
```

The data variant is prompted when neither `--convex` nor `--postgres` is
provided. The app name is also prompted when it is omitted. The default license
is proprietary, and the default product theme is the generated slug.

Supported flags are:

- `--convex` or `--postgres` selects the data variant.
- `--dir <parent>` chooses the parent directory, defaulting to the current directory.
- `--license mit|proprietary` chooses the generated license.
- `--product <value>` sets the `data-theme` product token.
- `--no-install` skips `pnpm install`.
- `--no-git` skips `git init` and the initial commit.
- `--link-local <path>` rewrites every `@q9labsai/*` dependency to a `link:` path in that q9stack checkout.
- `--pm pnpm` is accepted; other package managers are rejected.

The engine copies `templates/base`, overlays the selected variant, merges
directories, applies `.q9-remove`, replaces tokens in text files, and renames
paths that contain tokens. Invalid UTF-8 files stay byte-for-byte unchanged.
After writing the target, it initializes Git and installs dependencies unless
the corresponding `--no-*` flag is set. It prints `pnpm dev`, `pnpm gate:full`,
and the OpenTofu development-stack command as next steps.

## Template development

The source checkout keeps templates at the repository root, outside this
package. The `templates:copy` script copies that tree into the package, and
both `build` and `prepack` run it because npm package files cannot include a
directory outside the package. Published packages therefore include the
copied `templates/` directory. A local build tolerates an absent root template
tree so isolated builder worktrees can still compile; `prepack` remains strict
and refuses to package without the templates.

To add a variant, create a directory under the repository `templates/` tree,
add only files that differ from `base`, and include a `.q9-remove` file when a
base path must be deleted. The CLI variant names are `with-convex` and
`without-convex`.
