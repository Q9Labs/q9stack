const roles = ["admin", "member", "viewer"] as const;
export type Role = (typeof roles)[number];

export interface MockAccount {
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

export interface RoleNavigationItem {
  readonly id: "shell.admin" | "shell.member" | "shell.viewer";
  readonly href: string;
}

export const defaultDevAccount: MockAccount = {
  email: "member@dev.local",
  name: "Dev Member",
  role: "member",
};

export const adminDevAccount: MockAccount = {
  email: "admin@dev.local",
  name: "Dev Admin",
  role: "admin",
};

export const viewerDevAccount: MockAccount = {
  email: "viewer@dev.local",
  name: "Dev Viewer",
  role: "viewer",
};

export const devAccounts: readonly MockAccount[] = [
  adminDevAccount,
  defaultDevAccount,
  viewerDevAccount,
];

export const roleNavigation = (role: Role): readonly RoleNavigationItem[] => {
  if (role === "admin") {
    return [
      { id: "shell.admin", href: "/admin" },
      { id: "shell.member", href: "/workspace" },
    ];
  }

  if (role === "member") {
    return [{ id: "shell.member", href: "/workspace" }];
  }

  return [{ id: "shell.viewer", href: "/read-only" }];
};
