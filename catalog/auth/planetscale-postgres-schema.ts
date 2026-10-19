import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "./auth-schema";

// Export application tables here too, and include them and their relations in schema.
// biome-ignore lint/performance/noBarrelFile: Drizzle Kit discovers auth tables through this schema entry point.
export { account, session, user, verification } from "./auth-schema";
export const schema = {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
};
