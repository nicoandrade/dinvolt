import { isCancel } from "@clack/prompts";
import type { CANCEL_SYMBOL } from "@clack/prompts";

export class CancelledError extends Error {
  name = "CancelledError";
}

export function answer<T>(value: T): Exclude<T, typeof CANCEL_SYMBOL> {
  if (isCancel(value)) {
    throw new CancelledError();
  }
  return value as Exclude<T, typeof CANCEL_SYMBOL>;
}
