import { DashboardSquare01Icon, Shield01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useLingui } from "@lingui/react/macro";
import type { AuthAccount, DevAccount } from "@__APP_SLUG__/auth";
import {
  AppShell,
  Sidebar,
  SidebarFooter,
  SidebarFooterDescription,
  SidebarFooterLabel,
  SidebarFooterText,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarNav,
  SidebarNavItem,
  ThemeProvider,
  Topbar,
  type IconSvgElement,
} from "@q9labsai/ui";
import { DevAccountSwitcher } from "@q9labsai/ui/auth";
import { Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { authClient } from "../auth/auth-client.js";
import { defaultDevAccount, roleNavigation, type RoleNavigationItem } from "../auth/mock-auth.js";
import { runtimeAppEnvironment } from "../env.js";
import { useLocale } from "../i18n/locale-provider.js";
import { ChangelogMenuItem } from "./changelog-menu-item.js";
import { LocaleSwitcher } from "./locale-switcher.js";

interface ShellAccount extends AuthAccount {
  readonly name: string;
}

const defaultAccount: ShellAccount = {
  ...defaultDevAccount,
  id: "account-member",
};

const accountName = (email: string): string => {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

const shellAccount = (account: AuthAccount | DevAccount): ShellAccount => ({
  email: account.email,
  id: account.id,
  name: account.name ?? accountName(account.email),
  role: account.role,
});

const ROLE_ICONS = {
  "shell.admin": Shield01Icon,
  "shell.member": DashboardSquare01Icon,
  "shell.viewer": ViewIcon,
} satisfies Record<RoleNavigationItem["id"], IconSvgElement>;

const appName = "__APP_NAME__";

async function loadShellSession(isProduction: boolean): Promise<{
  readonly accounts: readonly ShellAccount[];
  readonly sessionAccount: ShellAccount | undefined;
}> {
  const sessionResult = await authClient.useSession();
  if (!sessionResult.ok) {
    throw new Error(sessionResult.error.message);
  }
  const sessionAccount =
    sessionResult.value.status === "authenticated"
      ? shellAccount(sessionResult.value.session.account)
      : undefined;
  if (isProduction) {
    return {
      accounts: sessionAccount === undefined ? [] : [sessionAccount],
      sessionAccount,
    };
  }

  const accountsResult = await authClient.listDevAccounts();
  if (!accountsResult.ok) {
    throw new Error(accountsResult.error.message);
  }
  return {
    accounts: accountsResult.value.map(shellAccount),
    sessionAccount,
  };
}

export function LocalizedShell() {
  const { direction } = useLocale();
  const { t } = useLingui();
  const [accounts, setAccounts] = useState<readonly ShellAccount[]>([defaultAccount]);
  const [currentAccount, setCurrentAccount] = useState<ShellAccount>(defaultAccount);
  const [shellError, setShellError] = useState<string | undefined>();
  const isProduction = runtimeAppEnvironment() === "prod";
  const navigation = useMemo(() => roleNavigation(currentAccount.role), [currentAccount.role]);
  const currentAccountLabel = t({ id: "shell.account", message: "Current account" });
  const navigationLabels = {
    "shell.admin": t({ id: "shell.admin", message: "Admin workspace" }),
    "shell.member": t({ id: "shell.member", message: "Member workspace" }),
    "shell.viewer": t({ id: "shell.viewer", message: "Read-only workspace" }),
  };

  useEffect(() => {
    let mounted = true;
    void loadShellSession(isProduction)
      .then(({ accounts: loadedAccounts, sessionAccount }) => {
        if (!mounted) {
          return;
        }
        setAccounts(loadedAccounts);
        if (sessionAccount !== undefined) {
          setCurrentAccount(sessionAccount);
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setShellError(error instanceof Error ? error.message : "Could not load the session.");
        }
      });
    return () => {
      mounted = false;
    };
  }, [isProduction]);

  const switchDevelopmentAccount = async (email: string): Promise<void> => {
    const account = accounts.find((candidate) => candidate.email === email);
    if (account === undefined) {
      setShellError("The development account was not found.");
      return;
    }
    setShellError(undefined);
    const result = await authClient.switchDevAccount({ accountId: account.id });
    if (result.ok) {
      setCurrentAccount(shellAccount(result.value.account));
    } else {
      setShellError(result.error.message);
    }
  };

  const switchAccount = (email: string): void => {
    void switchDevelopmentAccount(email);
  };

  const signOut = (): void => {
    void authClient
      .signOut()
      .then((result) => {
        if (result.ok) {
          setCurrentAccount(defaultAccount);
          setShellError(undefined);
        } else {
          setShellError(result.error.message);
        }
      })
      .catch((error: unknown) => {
        setShellError(error instanceof Error ? error.message : "Sign out failed.");
      });
  };

  return (
    <ThemeProvider defaultProductTheme="__PRODUCT__" dir={direction}>
      <AppShell
        navigationLabel={currentAccountLabel}
        sidebar={
          <Sidebar>
            <SidebarHeader className="px-3 font-semibold text-foreground">{appName}</SidebarHeader>
            <SidebarNav>
              <SidebarGroupLabel>{currentAccountLabel}</SidebarGroupLabel>
              {navigation.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  href={item.href}
                  icon={ROLE_ICONS[item.id]}
                  label={navigationLabels[item.id]}
                >
                  {navigationLabels[item.id]}
                </SidebarNavItem>
              ))}
              <ChangelogMenuItem />
            </SidebarNav>
            <SidebarFooter>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
                {currentAccount.name.slice(0, 2).toUpperCase()}
              </span>
              <SidebarFooterLabel>
                <SidebarFooterText>{currentAccount.name}</SidebarFooterText>
                <SidebarFooterDescription>{currentAccount.email}</SidebarFooterDescription>
              </SidebarFooterLabel>
            </SidebarFooter>
          </Sidebar>
        }
        topbar={
          <Topbar
            title={navigationLabels[`shell.${currentAccount.role}`]}
            actions={<LocaleSwitcher />}
          />
        }
      >
        <div className="min-w-0 flex-1 overflow-y-auto">
          {shellError === undefined ? null : (
            <p
              className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
              role="alert"
            >
              {shellError}
            </p>
          )}
          <Outlet />
        </div>
      </AppShell>
      {!isProduction ? (
        <DevAccountSwitcher
          accounts={accounts}
          current={currentAccount.email}
          onSwitch={switchAccount}
          onSignOut={signOut}
        />
      ) : null}
    </ThemeProvider>
  );
}
