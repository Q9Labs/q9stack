import {
  Analytics01Icon,
  DashboardSquare01Icon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import {
  AppShell,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
} from "../../../src/index";
import { definePreview, knob } from "../../../src/preview/index";

const NAV = [
  { label: "Dashboard", icon: DashboardSquare01Icon },
  { label: "People", icon: UserGroupIcon },
  { label: "Reports", icon: Analytics01Icon },
  { label: "Settings", icon: Settings02Icon },
];

export const shellPreview = definePreview({
  title: "App shell",
  scenarios: [
    {
      name: "Full frame",
      knobs: {
        active: knob.select("active", ["Dashboard", "People", "Reports", "Settings"], "Dashboard"),
        collapsed: knob.boolean("collapsed", false),
      },
      render: ({ active, collapsed }) => (
        <div className="h-[42rem] overflow-hidden rounded-lg border border-border">
          <AppShell
            className="h-full"
            defaultCollapsed={collapsed}
            sidebar={
              <Sidebar>
                <SidebarHeader>q9 labs</SidebarHeader>
                <SidebarNav>
                  <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                  {NAV.map((item) => (
                    <SidebarNavItem
                      key={item.label}
                      href="#"
                      icon={item.icon}
                      active={item.label === active}
                    >
                      {item.label}
                    </SidebarNavItem>
                  ))}
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
            topbar={
              <Topbar
                title={active}
                actions={
                  <>
                    <Badge variant="secondary" className="hidden sm:inline-flex">
                      v2.0
                    </Badge>
                    <Button size="sm">New project</Button>
                  </>
                }
              />
            }
          >
            <Main>
              <div className="grid gap-4 sm:grid-cols-2">
                {["Open tickets", "Spend this month"].map((title) => (
                  <Card key={title}>
                    <CardHeader>
                      <CardTitle>{title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-medium tabular-nums">
                        {title === "Open tickets" ? "18" : "$22,350"}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Main>
          </AppShell>
        </div>
      ),
    },
  ],
});
