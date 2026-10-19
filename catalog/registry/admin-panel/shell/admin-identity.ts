interface AdminIdentity {
  id: string;
  name: string;
  email: string;
}

const adminIdentityQueryKey = ["admin-identity"] as const;

export { adminIdentityQueryKey };
export type { AdminIdentity };
