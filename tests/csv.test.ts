import { expect, test } from "bun:test";

import { createCsvResponse, csvRow } from "../catalog/trpc/csv.ts";
import { usersExportQuerySchema } from "../catalog/trpc/users-query.ts";

async function* sampleRows() {
  yield ["ID", "Name"];
  yield ["1", "José"];
}
async function* brokenRows() {
  yield ["header"];
  throw new Error("private database details");
}

test("CSV uses semicolons and preserves quotes, Unicode and embedded line breaks", () => {
  expect(
    csvRow(["José; Ana", 'A "quoted" name', "first\r\nsecond", null, true])
  ).toBe('"José; Ana";"A ""quoted"" name";"first\r\nsecond";"";"true"\r\n');
});

test("CSV treats user-controlled spreadsheet formulas as text", () => {
  expect(
    csvRow(["=1+1", " +cmd", "\t=HYPERLINK()", "-1", "@SUM(1)", "normal"])
  ).toBe(
    '"\'=1+1";"\' +cmd";"\'\t=HYPERLINK()";"\'-1";"\'@SUM(1)";"normal"\r\n'
  );
});

test("CSV responses download with UTF-8 BOM, CRLF and private no-store headers", async () => {
  const response = createCsvResponse(sampleRows(), "users.csv");
  expect(response.headers.get("Content-Disposition")).toBe(
    'attachment; filename="users.csv"'
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(bytes.slice(0, 3)).toEqual(new Uint8Array([239, 187, 191]));
  expect(new TextDecoder().decode(bytes)).toBe('"ID";"Name"\r\n"1";"José"\r\n');
});

test("CSV cancellation closes the producer and stream failures are sanitized", async () => {
  let closed = false;
  async function* rows() {
    try {
      yield ["header"];
      yield ["data"];
    } finally {
      closed = true;
    }
  }
  const reader = createCsvResponse(rows(), "users.csv").body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(closed).toBe(true);
  await expect(
    createCsvResponse(brokenRows(), "users.csv").text()
  ).rejects.toThrow("Unable to export CSV.");
});

test("user export accepts search, role and order but strips page and perPage", () => {
  expect(
    usersExportQuerySchema.parse({
      search: "  Alex  ",
      role: "admin",
      sortBy: "name",
      sortDirection: "asc",
      page: 3,
      perPage: 10,
    })
  ).toEqual({
    search: "Alex",
    role: "admin",
    sortBy: "name",
    sortDirection: "asc",
  });
  expect(usersExportQuerySchema.safeParse({ sortBy: "password" }).success).toBe(
    false
  );
  expect(usersExportQuerySchema.safeParse({ role: "superadmin" }).success).toBe(
    false
  );
});
