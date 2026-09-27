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

import { roleNavigation, type RoleNavigationItem } from "../auth/mock-auth.js";
import { runtimeAppEnvironment } from "../env.js";
import { useLocale } from "../i18n/locale-provider.js";
import { auth } from "../lib/auth-client.js";
import { ChangelogMenuItem } from "./changelog-menu-item.js";
import { LocaleSwitcher } from "./locale-switcher.js";

interface ShellAccount extends AuthAccount {
  readonly name: string;
}

const fallbackAccount: ShellAccount = {
  email: "member@dev.local",
  id: "anonymous",
  name: "Dev Member",
  role: "member",
};

const toShellAccount = (account: AuthAccount | DevAccount): ShellAccount => ({
  ...account,
  name: account.email.split("@")[0] ?? account.email,
});

const ROLE_ICONS = {
  "shell.admin": Shield01Icon,
  "shell.member": DashboardSquare01Icon,
  "shell.viewer": ViewIcon,
} satisfies Record<RoleNavigationItem["id"], IconSvgElement>;

const appName = "__APP_NAME__";

export function LocalizedShell() {
  const { direction } = useLocale();
  const { t } = useLingui();
  const isProduction = runtimeAppEnvironment() === "prod";
  const [currentAccount, setCurrentAccount] = useState<ShellAccount>(fallbackAccount);
  const [devAccounts, setDevAccounts] = useState<readonly ShellAccount[]>([]);
  const navigation = useMemo(() => roleNavigation(currentAccount.role), [currentAccount.role]);
  const currentAccountLabel = t({ id: "shell.account", message: "Current account" });
  const navigationLabels = {
    "shell.admin": t({ id: "shell.admin", message: "Admin workspace" }),
    "shell.member": t({ id: "shell.member", message: "Member workspace" }),
    "shell.viewer": t({ id: "shell.viewer", message: "Read-only workspace" }),
  };

  useEffect(() => {
    let cancelled = false;
    void auth.getSession().then((result) => {
      if (cancelled || !result.ok || result.value.status !== "authenticated") {
        return;
      }
      setCurrentAccount(toShellAccount(result.value.session.account));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isProduction) {
      void auth.listDevAccounts().then((result) => {
        if (cancelled || !result.ok) {
          return;
        }
        setDevAccounts(result.value.map(toShellAccount));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isProduction]);

  const switchAccount = (email: string): void => {
    const account = devAccounts.find((candidate) => candidate.email === email);
    if (account === undefined) {
      return;
    }

    void auth.switchDevAccount({ accountId: account.id }).then((result) => {
      if (result.ok) {
        setCurrentAccount(toShellAccount(result.value.account));
      }
    });
  };

  const signOut = (): void => {
    void auth.signOut().then((result) => {
      if (result.ok) {
        setCurrentAccount(fallbackAccount);
      }
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
          <Outlet />
        </div>
      </AppShell>
      {!isProduction ? (
        <DevAccountSwitcher
          accounts={devAccounts}
          current={currentAccount.email}
          onSwitch={switchAccount}
          onSignOut={signOut}
        />
      ) : null}
    </ThemeProvider>
  );
}
