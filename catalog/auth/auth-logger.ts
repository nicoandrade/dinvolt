// Provider errors can contain query parameters, including session tokens.
// Keep severity while deliberately omitting messages and attached objects.
const authLogger = {
  level: "warn" as const,
  log: (
    level: "debug" | "info" | "warn" | "error",
    _message: string,
    ..._details: unknown[]
  ) => {
    if (level === "error") {
      console.error("[auth] Authentication service error.");
    } else if (level === "warn") {
      console.warn("[auth] Authentication warning.");
    }
  },
};

export { authLogger };
