import { isCancel } from "@clack/prompts";

export class CancelledError extends Error {
  name = "CancelledError";
}

export function answer<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new CancelledError();
  }
  return value as T;
}
