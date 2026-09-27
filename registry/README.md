# q9stack shadcn registry

## `changelog`

An in-app "Changelog" dialog for shadcn/ui on Tailwind 4. It shows the release notes your app bundles at build time from `changelog.json`, so there is no runtime fetch and no GitHub token. It uses only semantic tokens and logical direction classes, so it takes on your theme and works in RTL.

The item installs:

- `lib/changelog.ts`: the `Changelog` types and `parseChangelog`, which validates the file and sorts releases newest first.
- `components/changelog-dialog.tsx`: `ChangelogDialog`, which lists releases with their version, a localized date, and entries grouped by type (added, changed, fixed, removed, security).
- `hooks/use-changelog.ts`: `useChangelog`, which stores the last seen version in `localStorage` under `q9:changelog:last-seen` and returns `hasUnseen`, `latestVersion` and `markSeen`.

It depends on the shadcn `dialog` component, which the CLI adds if it is missing.

## Install

```sh
pnpm dlx shadcn@latest add https://raw.githubusercontent.com/Q9Labs/q9stack/main/registry/public/r/changelog.json
```

## Export the release notes before the build

`q9 changelog export` turns the released sections of `CHANGELOG.md` into `changelog.json` (no Unreleased, no Internal entries). Run it before the app build so the file is always current:

```json
{
  "scripts": {
    "changelog:export": "q9 changelog export --out src/generated/changelog.json",
    "prebuild": "pnpm changelog:export"
  }
}
```

## Usage

```tsx
const changelog = parseChangelog(changelogJson); // from "@/generated/changelog.json"

export function ChangelogMenuItem() {
  const [open, setOpen] = useState(false);
  const { hasUnseen, markSeen } = useChangelog(changelog);
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) markSeen();
  }
  return (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(true)}>
        Changelog
        {hasUnseen && (
          <span role="img" aria-label="Unseen updates" className="size-2 rounded-full bg-primary" />
        )}
      </Button>
      <ChangelogDialog data={changelog} open={open} onOpenChange={onOpenChange} />
    </>
  );
}
```

Pass `labels` with translated copy and `locale` to override the date locale, which defaults to `<html lang>`.

## Build this registry

```sh
pnpm registry:build
```

This runs `shadcn build` on `registry/registry.json` and writes `registry/public/r/`. Commit the built JSON, because consumers install from the raw GitHub URL.
