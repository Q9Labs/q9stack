import { DashboardSquare01Icon, Shield01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useLingui } from "@lingui/react/macro";
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
import { useMemo, useState } from "react";

import {
  defaultDevAccount,
  devAccounts,
  roleNavigation,
  type MockAccount,
  type RoleNavigationItem,
  viewerDevAccount,
} from "../auth/mock-auth.js";
import { runtimeAppEnvironment } from "../env.js";
import { useLocale } from "../i18n/locale-provider.js";
import { ChangelogMenuItem } from "./changelog-menu-item.js";
import { LocaleSwitcher } from "./locale-switcher.js";

const ROLE_ICONS = {
  "shell.admin": Shield01Icon,
  "shell.member": DashboardSquare01Icon,
  "shell.viewer": ViewIcon,
} satisfies Record<RoleNavigationItem["id"], IconSvgElement>;

const appName = "__APP_NAME__";

export function LocalizedShell() {
  const { direction } = useLocale();
  const { t } = useLingui();
  const [currentAccount, setCurrentAccount] = useState<MockAccount>(defaultDevAccount);
  const isProduction = runtimeAppEnvironment() === "prod";
  const navigation = useMemo(() => roleNavigation(currentAccount.role), [currentAccount.role]);
  const currentAccountLabel = t({ id: "shell.account", message: "Current account" });
  const navigationLabels = {
    "shell.admin": t({ id: "shell.admin", message: "Admin workspace" }),
    "shell.member": t({ id: "shell.member", message: "Member workspace" }),
    "shell.viewer": t({ id: "shell.viewer", message: "Read-only workspace" }),
  };

  const switchAccount = (email: string): void => {
    const account = devAccounts.find((candidate) => candidate.email === email);
    if (account !== undefined) {
      setCurrentAccount(account);
    }
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
          onSignOut={() => setCurrentAccount(viewerDevAccount)}
        />
      ) : null}
    </ThemeProvider>
  );
}
