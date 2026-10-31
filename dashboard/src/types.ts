import type { Role } from "@nenv/policy";

export type { Role };

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
  publicKey: string | null;
};

export type Environment = {
  name: string;
  publicKey: string;
  hasKey: boolean;
};

export type Project = {
  id: string;
  repo: string;
  name: string;
  role: Role;
  secretCount: number;
  updatedAt: string | null;
  environments: Environment[];
  members: string[];
};

export type SecretRow = {
  name: string;
  version: number;
  author: string;
  updatedAt: string;
};

export type VersionRow = {
  version: number;
  author: string;
  restoredFrom: number | null;
  createdAt: string;
};

export type Member = {
  id: string;
  email: string;
  role: Role;
  hasPublicKey: boolean;
  environments: string[];
};

export type User = {
  id: string;
  email: string;
  isAdmin: boolean;
  hasPublicKey: boolean;
  createdAt: string;
  projects: { repo: string; role: Role; missingKeys: string[] }[];
};

export type FileReport = {
  path: string;
  status: string;
};

export type Device = {
  id: string;
  email: string;
  name: string;
  cliVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  compliance: { repo: string; environment: string; compliant: boolean; files: FileReport[]; reportedAt: string }[];
};
