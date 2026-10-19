// eslint-disable-next-line no-control-regex -- Spreadsheet formulas can begin after invisible control characters.
const formulaPrefix = /^[\s\u0000-\u001F]*[=+\-@]|^[\t\r\n]/u;

const csvRow = (cells: readonly unknown[]) =>
  `${cells
    .map((cell) => {
      const text = cell === null || cell === undefined ? "" : String(cell);
      const safe = formulaPrefix.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    })
    .join(";")}\r\n`;

// Pull one chunk at a time; cancel stops the producer before its next DB batch.
const createCsvResponse = (
  rows: AsyncIterable<readonly unknown[]>,
  filename: string
) => {
  const iterator = rows[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  let first = true;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(`${first ? "\uFEFF" : ""}${csvRow(next.value)}`)
        );
        first = false;
      } catch {
        controller.error(new Error("Unable to export CSV."));
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export { createCsvResponse, csvRow };
