import { account, session, user, verification } from "./auth-schema";

// Export application tables here too, and include them in schema.
// biome-ignore lint/performance/noBarrelFile: Drizzle Kit discovers auth tables through this schema entry point.
export { account, session, user, verification } from "./auth-schema";
export const schema = { account, session, user, verification };
