import "server-only";
import Busboy from "busboy";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

export async function readUpload(request: Request) {
  if (!request.body) throw new Error("Choose a document.");
  const fields: Record<string, string> = {};
  let bytes: Buffer | undefined,
    filename = "",
    mime = "",
    failed = "",
    fileCount = 0;
  const parser = Busboy({
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    limits: {
      files: 1,
      fileSize: 4 * 1024 * 1024 + 1,
      fields: 2,
      fieldSize: 100,
      parts: 4,
    },
  });
  parser.on("file", (name, file, info) => {
    fileCount++;
    filename = info.filename;
    mime = info.mimeType;
    const chunks: Buffer[] = [];
    if (name !== "file") failed = "Choose one document.";
    file.on("limit", () => {
      failed = "File exceeds 4 MiB.";
    });
    file.on("error", () => {
      failed = "Document upload was interrupted.";
    });
    file.on("data", (chunk) => chunks.push(chunk));
    file.on("end", () => {
      bytes = Buffer.concat(chunks);
      if (bytes.length > 4 * 1024 * 1024) failed = "File exceeds 4 MiB.";
    });
  });
  parser.on("field", (name, value, info) => {
    if (
      !["reward_points", "request_id"].includes(name) ||
      name in fields ||
      info.valueTruncated
    )
      failed = "Invalid upload form.";
    fields[name] = value;
  });
  for (const event of ["filesLimit", "fieldsLimit", "partsLimit"] as const)
    parser.on(event, () => {
      failed = "Choose one document and a reward.";
    });
  let size = 0;
  const bound = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      callback(
        size > 4 * 1024 * 1024 + 16384
          ? new Error("Upload exceeds 4 MiB.")
          : null,
        chunk,
      );
    },
  });
  await pipeline(
    Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
    bound,
    parser,
    { signal: AbortSignal.timeout(15000) },
  );
  if (failed) throw new Error(failed);
  if (!bytes?.length || fileCount !== 1 || filename.length > 160)
    throw new Error(
      "Choose one nonempty document with a filename of at most 160 characters.",
    );
  const kind = filename.toLowerCase().split(".").at(-1);
  const types = {
    txt: "text/plain",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  if (kind !== "txt" && kind !== "pdf" && kind !== "docx")
    throw new Error("Upload a .docx, .pdf or .txt file.");
  if (mime !== types[kind] && mime !== "application/octet-stream")
    throw new Error("File type does not match its extension.");
  if (kind === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Invalid PDF signature.");
  if (
    kind === "docx" &&
    !bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  )
    throw new Error("Invalid DOCX signature.");
  if (!/^[0-9]{1,10}$/.test(fields.reward_points ?? ""))
    throw new Error("Enter a whole-number reward.");
  const reward = z
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .parse(Number(fields.reward_points));
  const requestId = z.uuid().parse(fields.request_id);
  return {
    bytes,
    filename,
    mime: types[kind],
    kind: kind as "txt" | "pdf" | "docx",
    reward,
    requestId,
  };
}
