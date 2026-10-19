// Internal preview transport. Its scope contains /preview/ clients only.
const failedExports = new Set();
const failExportOnce = (clientId, scenario) => {
  if (scenario !== "export-error" || failedExports.has(clientId)) {
    return false;
  }
  failedExports.add(clientId);
  return true;
};
const createdUsers = new Map();
const updatedUsers = new Map();
const getCreatedUsers = (clientId) => createdUsers.get(clientId) ?? [];
const previewUsers = (scenario, clientId) => {
  const users =
    scenario === "empty"
      ? []
      : Array.from({ length: 27 }, (_, index) => ({
          id: `preview-user-${index + 1}`,
          name:
            [
              "Alex Morgan",
              "Jordan Lee",
              "Taylor Reed",
              "Sam Rivera",
              "Casey Chen",
              "Jamie Park",
              "Riley Brooks",
              "Avery Scott",
              "Drew Wilson",
            ][index % 9] + (index > 8 ? ` ${Math.floor(index / 9) + 1}` : ""),
          email: `user${String(index + 1).padStart(2, "0")}@example.com`,
          role: index % 7 === 0 ? "admin" : "user",
          emailVerified: index % 3 !== 0,
          banned: index % 11 === 0,
          createdAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
        }));
  users.push(...getCreatedUsers(clientId));
  return users.map((user) => ({
    ...user,
    updatedAt: user.createdAt,
    banReason: null,
    banExpires: null,
    ...updatedUsers.get(clientId)?.get(user.id),
  }));
};
const updatePreviewUser = async (request, clientId, scenario) => {
  const { userId, data } = await request.json();
  const users = previewUsers(scenario, clientId);
  const existing = users.find((user) => user.id === userId);
  if (!existing) {
    return Response.json({ code: "USER_NOT_FOUND" }, { status: 404 });
  }
  if (
    users.some(
      (user) => user.id !== userId && user.email === data.email.toLowerCase()
    )
  ) {
    return Response.json(
      {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "Email already exists.",
      },
      { status: 400 }
    );
  }
  const user = {
    ...existing,
    name: data.name,
    email: data.email.toLowerCase(),
    updatedAt: new Date().toISOString(),
  };
  const updates = updatedUsers.get(clientId) ?? new Map();
  updates.set(userId, user);
  updatedUsers.set(clientId, updates);
  return Response.json(user);
};
const createPreviewUser = async (request, clientId, scenario) => {
  const input = await request.json();
  const existing = createdUsers.get(clientId) ?? [];
  if (
    previewUsers(scenario, clientId).some(
      (user) => user.email === input.email.toLowerCase()
    )
  ) {
    return Response.json(
      {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "Email already exists.",
      },
      { status: 400 }
    );
  }
  const user = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email.toLowerCase(),
    role: input.role,
    emailVerified: false,
    banned: false,
    createdAt: new Date().toISOString(),
  };
  createdUsers.set(clientId, [...existing, user]);
  return Response.json({ user });
};
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting())
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const usersRequest =
    url.pathname.startsWith("/api/trpc/") &&
    url.pathname
      .slice("/api/trpc/".length)
      .split(",")
      .every((path) => path === "admin.users" || path === "admin.user");
  const usersExport = url.pathname === "/api/admin/users/export";
  if (
    url.origin !== self.location.origin ||
    !(url.pathname.startsWith("/api/auth/") || usersRequest || usersExport)
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      const client = await self.clients.get(event.clientId);
      if (!client || !new URL(client.url).pathname.startsWith("/preview/")) {
        return fetch(event.request);
      }
      const scenario = new URL(client.url).searchParams.get("scenario");
      if (usersExport && failExportOnce(event.clientId, scenario)) {
        return Response.error();
      }
      if (scenario === "network") {
        return Response.error();
      }
      if (scenario === "pending") {
        return new Promise(() => {
          // Intentionally never settles to preview the pending login state.
        });
      }
      if (url.pathname === "/api/auth/admin/create-user") {
        return createPreviewUser(event.request, event.clientId, scenario);
      }
      if (url.pathname === "/api/auth/admin/update-user") {
        return updatePreviewUser(event.request, event.clientId, scenario);
      }
      if (usersRequest || usersExport) {
        // CSV previews simulate work so the action's progress animation is visible.
        // Explicit delays still control slow-query checks; real routes bypass this worker.
        const delay = Number(
          new URL(client.url).searchParams.get("delay") ??
            (usersExport ? 800 : 0)
        );
        if (Number.isFinite(delay) && delay > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, Math.min(delay, 1000));
          });
        }
        const users = previewUsers(scenario, event.clientId);
        const batch = url.searchParams.get("batch") === "1";
        const raw = JSON.parse(url.searchParams.get("input") || "{}");
        const inputs = usersExport
          ? [{ json: Object.fromEntries(url.searchParams) }]
          : batch
            ? Object.values(raw)
            : [raw];
        const procedures = url.pathname.slice("/api/trpc/".length).split(",");
        const results = inputs.map((entry, index) => {
          const input = entry?.json || {};
          if (!usersExport && procedures[index] === "admin.user") {
            const user = users.find((item) => item.id === input.id);
            return user
              ? { result: { data: { json: user } } }
              : {
                  error: {
                    json: {
                      message: "User not found.",
                      code: -32_004,
                      data: {
                        code: "NOT_FOUND",
                        httpStatus: 404,
                        path: "admin.user",
                      },
                    },
                  },
                };
          }
          const search = (input.search || "").toLowerCase();
          const filtered = users.filter(
            (user) =>
              [user.name, user.email, user.id].some((value) =>
                value.toLowerCase().includes(search)
              ) &&
              (!input.role ||
                input.role === "all" ||
                user.role.split(",").includes(input.role))
          );
          const sortBy = ["name", "email", "createdAt"].includes(input.sortBy)
            ? input.sortBy
            : "createdAt";
          const direction = input.sortDirection === "asc" ? 1 : -1;
          filtered.sort(
            (left, right) =>
              direction * left[sortBy].localeCompare(right[sortBy]) ||
              left.id.localeCompare(right.id)
          );
          if (usersExport) {
            return filtered;
          }
          const perPage = [10, 20, 50, 100].includes(input.perPage)
            ? input.perPage
            : 10;
          const page = Math.min(
            input.page || 1,
            Math.max(1, Math.ceil(filtered.length / perPage))
          );
          const offset = (page - 1) * perPage;
          const result = {
            result: {
              data: {
                json: {
                  ...input,
                  page,
                  perPage,
                  users: filtered.slice(offset, offset + perPage),
                  total: filtered.length,
                },
              },
            },
          };
          return result;
        });
        if (usersExport) {
          const rows = [
            [
              "ID",
              "Name",
              "Email",
              "Role",
              "Email verified",
              "Status",
              "Created at",
            ],
            ...results[0].map((user) => [
              user.id,
              user.name,
              user.email,
              user.role,
              user.emailVerified ? "Verified" : "Unverified",
              user.banned ? "Banned" : "Active",
              user.createdAt,
            ]),
          ];
          const csv = `\uFEFF${rows.map((row) => `${row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")}\r\n`).join("")}`;
          return new Response(csv, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="users-preview.csv"',
              "Cache-Control": "no-store",
            },
          });
        }
        return Response.json(batch ? results : results[0]);
      }
      return Response.json(
        {
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Preview request rejected.",
        },
        { status: 401 }
      );
    })()
  );
});
