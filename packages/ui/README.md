# @q9labsai/ui

The q9 design system: Tailwind 4 tokens, [Base UI](https://base-ui.com) primitives, a Hugeicons wrapper, an app shell, theming, presentational auth screens, and a preview gallery. Every component ships RTL-correct and works in both colour schemes at WCAG AA.

## Install

```sh
pnpm add @q9labsai/ui
```

`react`, `react-dom` and `tailwindcss` are peer dependencies. React 19 or newer, Tailwind 4.1 or newer.

## Tailwind wiring

The package ships CSS variables and an `@theme inline` mapping, not a Tailwind preset. Your app owns `@import "tailwindcss"`, so import the tokens after it and point `@source` at the built package so Tailwind sees the class names inside `dist`.

```css
/* app/globals.css */
@import "tailwindcss";
@import "@q9labsai/ui/tokens.css";
@source "../node_modules/@q9labsai/ui/dist";
```

Self-hosted Geist is optional and separate. Import it once at the app entry, before the stylesheet that pulls in the tokens; skip it and the `--font-sans` / `--font-mono` stacks fall back to system UI.

```ts
import "@q9labsai/ui/fonts.css";
```

`tokens.css` also declares `@custom-variant dark (&:is(.dark *))`, so `dark:` utilities follow the `.dark` class that `ThemeProvider` writes on `<html>`.

## Theming

Three things vary independently: the colour scheme (`light`, `dark`, `system`), the product palette (`data-theme`), and the writing direction (`dir`). `ThemeProvider` owns all three, mirrors them onto `<html>`, persists the scheme to `localStorage`, and feeds Base UI's `DirectionProvider`.

```tsx
import { ThemeProvider } from "@q9labsai/ui/theme";

<ThemeProvider defaultScheme="system" defaultProductTheme="recruiter" dir="rtl">
  <App />
</ThemeProvider>;
```

| Prop                   | Default             | Effect                                        |
| ---------------------- | ------------------- | --------------------------------------------- |
| `defaultScheme`        | `"system"`          | Scheme used until storage is read             |
| `defaultProductTheme`  | `"q9"`              | Value of `<html data-theme>`                  |
| `dir`                  | `"ltr"`             | Value of `<html dir>` and Base UI's direction |
| `storageKey`           | `"q9-color-scheme"` | Where the scheme is persisted                 |
| `enableSystemListener` | `true`              | Follows `prefers-color-scheme` changes        |

`useTheme()` returns `{ scheme, resolvedScheme, productTheme, dir, setScheme, setProductTheme, setDir }` and throws `ThemeProviderMissingError` outside a provider. Use `useThemeOptional()` when an unthemed fallback is sensible.

A React-only provider paints the wrong scheme on the first frame. `themeInitScript()` returns the body of a blocking inline script that fixes the flash:

```tsx
import { themeInitScript } from "@q9labsai/ui/theme";

<head>
  <script dangerouslySetInnerHTML={{ __html: themeInitScript({ productTheme: "kaadr" }) }} />
</head>;
```

### Adding a product palette

A product palette overrides ten variables and nothing else: `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring`, and the five `--sidebar-*` equivalents. Neutral surfaces, borders and status colours stay shared, so every product inherits the same contrast guarantees; `test/tokens.test.ts` fails the build if a palette touches anything outside that set.

Write both schemes in your own CSS, after the tokens import:

```css
[data-theme="atlas"] {
  --primary: oklch(0.45 0.13 150);
  --primary-foreground: oklch(0.99 0 0);
  --accent: oklch(0.94 0.02 150);
  --accent-foreground: oklch(0.33 0.1 150);
  --ring: oklch(0.5 0.12 150);
  --sidebar-primary: oklch(0.45 0.13 150);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.93 0.02 150);
  --sidebar-accent-foreground: oklch(0.33 0.1 150);
  --sidebar-ring: oklch(0.5 0.12 150);
}

.dark [data-theme="atlas"],
.dark[data-theme="atlas"] {
  /* lighter primary, dimmer accent */
}
```

Then pass `defaultProductTheme="atlas"`. Ship the palette with a contrast check of your own: foreground on primary must clear 4.5:1 in both schemes.

`q9`, `recruiter` and `kaadr` are built in.

## RTL

The system is RTL-first, not RTL-patched. Components use logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-*`, `border-s-*`); physical utilities (`ml-`, `pr-`, `left-`, `text-right` and friends) are banned and `test/logical-direction.test.ts` scans every source file and fails on one. The single exception is a deliberate mirror written as `rtl:-scale-x-100`.

Directional icons opt into mirroring:

```tsx
<Icon icon={ArrowRight01Icon} flipInRtl />
```

Switch the whole tree with `<ThemeProvider dir="rtl">`. Base UI positioning follows automatically because the provider wraps `DirectionProvider`.

## Icons

`Icon` is the only icon surface. It takes a Hugeicons `IconSvgElement` data array, not a component, and renders at 16, 20 or 24 pixels.

```tsx
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@q9labsai/ui/icon";

<Icon icon={Settings02Icon} size="sm" />; // decorative: aria-hidden
<Icon icon={Settings02Icon} label="Settings" />; // labelled: role="img"
```

Icons are decorative by default. Pass `label` only when the icon carries meaning that no adjacent text repeats, such as an icon-only button.

## App shell

`AppShell` is a two-column frame: a 16rem sidebar on the inline start and a scrolling content column. The sidebar collapses to a 4rem icon rail from `md` up; below `md` it moves into a Base UI dialog drawer that always renders expanded, and `Topbar` renders the trigger.

```tsx
import {
  AppShell,
  Main,
  Sidebar,
  SidebarFooter,
  SidebarFooterDescription,
  SidebarFooterLabel,
  SidebarFooterText,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  Topbar,
} from "@q9labsai/ui/shell";

<AppShell
  sidebar={
    <Sidebar>
      <SidebarHeader>q9 labs</SidebarHeader>
      <SidebarNav>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarNavItem href="/" icon={DashboardSquare01Icon} active>
          Dashboard
        </SidebarNavItem>
      </SidebarNav>
      <SidebarFooter>
        <Avatar size="sm">
          <AvatarFallback>DI</AvatarFallback>
        </Avatar>
        <SidebarFooterLabel>
          <SidebarFooterText>Dana Ito</SidebarFooterText>
          <SidebarFooterDescription>Admin</SidebarFooterDescription>
        </SidebarFooterLabel>
      </SidebarFooter>
    </Sidebar>
  }
  topbar={<Topbar title="Dashboard" actions={<Button size="sm">New project</Button>} />}
>
  <Main>{children}</Main>
</AppShell>;
```

`AppShell` is `h-dvh` and clips its own overflow, so put it at the root of a route rather than inside a scrolling container.

The sidebar collapses via the toggle that `Topbar` renders on desktop, or programmatically: `useAppShell()` returns `{ mobileNavOpen, setMobileNavOpen, collapsed, setCollapsed }`. Pass `defaultCollapsed` to `AppShell` to start collapsed. When the rail is collapsed, nav items hide their labels and show a tooltip instead — supply a `label` prop (or string children) to name the tooltip, and any `SidebarFooterLabel` content is hidden. `useSidebarCollapsed()` reads the collapse flag for custom sidebar content.

## Primitives

Everything below comes from the root entry, `@q9labsai/ui`. There is no `asChild`: to render a different element, pass Base UI's `render` prop.

| Component                 | Parts                                                                                                                                                                                                                                                           | Notes                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Button`                  |                                                                                                                                                                                                                                                                 | `variant` default/secondary/outline/ghost/destructive/link, `size` sm/md/lg/icon, `loading` |
| `Badge`                   |                                                                                                                                                                                                                                                                 | `variant` default/secondary/outline/success/destructive                                     |
| `Avatar`                  | `AvatarImage`, `AvatarFallback`                                                                                                                                                                                                                                 | `size` sm/md/lg                                                                             |
| `Card`                    | `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`                                                                                                                                                                                       |                                                                                             |
| `Field`                   | `FieldLabel`, `FieldControl`, `FieldDescription`, `FieldError`, `FieldValidity`                                                                                                                                                                                 | Wires `aria-describedby` and `aria-invalid` for you                                         |
| `Input`, `Textarea`       |                                                                                                                                                                                                                                                                 | Style-only wrappers over the native controls                                                |
| `Label`                   |                                                                                                                                                                                                                                                                 | Standalone label for controls outside a `Field`                                             |
| `Checkbox`, `Switch`      |                                                                                                                                                                                                                                                                 | Controlled or uncontrolled                                                                  |
| `RadioGroup`              | `RadioGroupItem`                                                                                                                                                                                                                                                |                                                                                             |
| `Select`                  | `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`, `SelectGroupLabel`, `SelectItem`, `SelectSeparator`                                                                                                                                             | Takes `items`; groups need `SelectGroup`                                                    |
| `Tabs`                    | `TabsList`, `TabsTab`, `TabsPanel`                                                                                                                                                                                                                              |                                                                                             |
| `Table`                   | `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`                                                                                                                                                                 |                                                                                             |
| `Dialog`                  | `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`                                                                                                                                             |                                                                                             |
| `Sheet`                   | `SheetTrigger`, `SheetContent`, `SheetTitle`, `SheetDescription`, `SheetClose`                                                                                                                                                                                  | Dialog with a `side` of start/end/top/bottom                                                |
| `Popover`                 | `PopoverTrigger`, `PopoverContent`, `PopoverTitle`, `PopoverDescription`, `PopoverClose`                                                                                                                                                                        |                                                                                             |
| `Tooltip`                 | `TooltipProvider`, `TooltipTrigger`, `TooltipContent`                                                                                                                                                                                                           | Wrap the app once in `TooltipProvider`                                                      |
| `DropdownMenu`            | `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSeparator`, `DropdownMenuSub`, `DropdownMenuSubTrigger` | `DropdownMenuLabel` must sit inside a `DropdownMenuGroup`                                   |
| `Toaster`, `toast`        |                                                                                                                                                                                                                                                                 | Sonner, themed from `useThemeOptional()`                                                    |
| `EmptyState`              |                                                                                                                                                                                                                                                                 | `icon`, `title`, `description`, `action`                                                    |
| `Spinner`, `Skeleton`     |                                                                                                                                                                                                                                                                 |                                                                                             |
| `Separator`, `ScrollArea` |                                                                                                                                                                                                                                                                 |                                                                                             |
| `Kbd`                     |                                                                                                                                                                                                                                                                 |                                                                                             |
| `cn`                      |                                                                                                                                                                                                                                                                 | `tailwind-merge` wrapper; later classes win                                                 |

Every interactive primitive has a visible `focus-visible` ring, honours `prefers-reduced-motion`, and exposes a `data-slot` attribute for app-level styling.

## Auth screens

`@q9labsai/ui/auth` is presentational only. It has no dependency on any auth library: you pass callbacks in and get typed values back. Every string comes from a `labels` prop with English defaults, so apps translate with Lingui by passing translated labels.

```tsx
import { AuthLayout, SignInForm } from "@q9labsai/ui/auth";

<AuthLayout logo={<Wordmark />} footer={<Legal />}>
  <SignInForm
    onSubmit={({ email, password }) => signIn(email, password)}
    onForgotPassword={() => router.push("/forgot")}
    onSignUp={() => router.push("/sign-up")}
    error={error}
    submitting={pending}
  />
</AuthLayout>;
```

`AuthLayout`, `SignInForm`, `SignUpForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `VerifyEmailNotice`, `ProfileForm`, and `DevAccountSwitcher` are exported with their value and label types. Optional links only render when you supply the matching handler, so a product without self-serve sign-up simply omits `onSignUp`.

`DevAccountSwitcher` is a floating pill at the bottom inline start that expands into a list of seeded accounts. Mount it behind a development flag:

```tsx
{
  import.meta.env.DEV ? (
    <DevAccountSwitcher
      accounts={SEED_ACCOUNTS}
      current={session.email}
      onSwitch={impersonate}
      onSignOut={signOut}
    />
  ) : null;
}
```

## Preview gallery

`@q9labsai/ui/preview` is a small gallery for building components in isolation. Declare scenarios with `definePreview`, declare their controls with `knob`, and render everything with `PreviewGallery`.

```tsx
import { definePreview, knob } from "@q9labsai/ui/preview";

export const actionsPreview = definePreview({
  title: "Actions",
  scenarios: [
    {
      name: "Button",
      knobs: {
        variant: knob.select("variant", ["default", "outline"], "default"),
        loading: knob.boolean("loading", false),
        label: knob.text("label", "Create project"),
        radius: knob.number("radius", 8, { min: 0, max: 24, step: 1 }),
      },
      render: ({ variant, loading, label }) => (
        <Button variant={variant} loading={loading}>
          {label}
        </Button>
      ),
    },
  ],
});
```

`render` receives values typed by that scenario's own knob declarations: `variant` narrows to the union of its options, `loading` is a boolean, `radius` a number.

```tsx
import { PreviewGallery } from "@q9labsai/ui/preview";

<PreviewGallery
  previews={[actionsPreview, formsPreview]}
  tweaker={{
    locales: ["en", "ar"],
    roles: ["owner", "member"],
    productThemes: ["q9", "recruiter"],
  }}
/>;
```

The gallery is a nav of previews and scenarios on the inline start, a resizable stage in the middle (no iframe), and the Tweaker panel on the inline end. The Tweaker holds the global environment: locale (which sets the direction), an explicit direction override, a compare toggle that renders LTR beside RTL, colour scheme, product palette, role, and viewport presets of 360/768/1024/1440 plus a free width. Scenario knobs appear underneath.

All of that state lives in the URL query, so a link to a scenario carries its knobs, palette and viewport with it.

## Package scripts

```sh
pnpm -F @q9labsai/ui preview        # gallery on a dev server
pnpm -F @q9labsai/ui preview:shot   # Playwright screenshots into preview/shots
pnpm -F @q9labsai/ui typecheck
pnpm -F @q9labsai/ui test
pnpm -F @q9labsai/ui build
```

Screenshots are build artifacts and stay out of git.
