import "server-only";
import { after } from "next/server";

import { getDb } from "@/db";

import { createAuth } from "./auth-config";

const authCache: { instance?: ReturnType<typeof createAuth> } = {};

const getAuth = () => {
  authCache.instance ??= createAuth(getDb(), (task) => after(task));
  return authCache.instance;
};

export { getAuth };
export type Session = ReturnType<typeof getAuth>["$Infer"]["Session"];
