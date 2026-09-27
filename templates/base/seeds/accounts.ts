import { createSeededFaker } from "./faker.js";

export const ACCOUNT_ROLES = ["admin", "member", "viewer"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export interface SeedAccount {
  readonly id: string;
  readonly email: string;
  readonly password: "dev-password";
  readonly role: AccountRole;
}

const ACCOUNT_DEFINITIONS = [
  { email: "admin@dev.local", role: "admin" },
  { email: "member@dev.local", role: "member" },
  { email: "viewer@dev.local", role: "viewer" },
] as const;

export const createAccounts = (seed: number): readonly SeedAccount[] => {
  const faker = createSeededFaker(seed);

  return ACCOUNT_DEFINITIONS.map(({ email, role }) => ({
    email,
    id: faker.string.uuid(),
    password: "dev-password",
    role,
  }));
};
