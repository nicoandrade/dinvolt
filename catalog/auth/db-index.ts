import "server-only";

// biome-ignore lint/performance/noBarrelFile: This entry point guards the shared connection with server-only.
export { getDb } from "./connection";
