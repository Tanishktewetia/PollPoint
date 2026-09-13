import { parentPort, workerData } from "node:worker_threads";
import yauzl from "yauzl";
import { SaxesParser } from "saxes";
const bytes = Buffer.from(workerData.bytes),
  maxChars = 50000;
function validate(text) {
  if (!text.trim())
    throw new Error(
      "No readable text. Image-only PDFs require OCR before upload.",
    );
  if (text.length > maxChars)
    throw new Error("Document exceeds 50,000 extracted characters.");
  return text.trim();
}
async function docx() {
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true },
      (e, z) => (e ? reject(e) : resolve(z)),
    ),
  );
  let expanded = 0,
    entries = 0,
    xml,
    contentTypes = false;
  await new Promise((resolve, reject) => {
    const fail = (e) => {
      zip.close();
      reject(e);
    };
    zip.on("error", fail);
    zip.on("end", resolve);
    zip.on("entry", (entry) => {
      expanded += entry.uncompressedSize;
      entries++;
      if (
        expanded > 20 * 1024 * 1024 ||
        entries > 2000 ||
        entry.generalPurposeBitFlag & 1
      )
        return fail(new Error("DOCX is encrypted or too large when expanded."));
      if (/vbaProject/i.test(entry.fileName))
        return fail(new Error("Macro documents are not supported."));
      if (entry.fileName === "[Content_Types].xml") contentTypes = true;
      if (entry.fileName !== "word/document.xml") {
        zip.readEntry();
        return;
      }
      if (xml) return fail(new Error("Duplicate document part."));
      zip.openReadStream(entry, (error, stream) => {
        if (error) return fail(error);
        const chunks = [];
        let size = 0;
        stream.on("data", (chunk) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) {
            stream.destroy();
            fail(new Error("DOCX exceeds extraction limits."));
          } else chunks.push(chunk);
        });
        stream.on("error", fail);
        stream.on("end", () => {
          xml = Buffer.concat(chunks).toString("utf8");
          zip.readEntry();
        });
      });
    });
    zip.readEntry();
  });
  if (!xml || !contentTypes)
    throw new Error("This is not a valid DOCX document.");
  let text = "",
    inside = false;
  const parser = new SaxesParser({ xmlns: true });
  const append = (value) => {
    text += value;
    if (text.length > maxChars)
      throw new Error("Document exceeds 50,000 extracted characters.");
  };
  parser.on("doctype", () => {
    throw new Error("Document entities are not supported.");
  });
  parser.on("opentag", (tag) => {
    if (tag.local === "t") inside = true;
    if (tag.local === "tab") append(" ");
  });
  parser.on("text", (value) => {
    if (inside) append(value);
  });
  parser.on("closetag", (tag) => {
    if (tag.local === "t") inside = false;
    if (tag.local === "p") append("\n");
  });
  parser.write(xml).close();
  return validate(text);
}
async function pdf() {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let doc;
  try {
    doc = await task.promise;
    if (doc.numPages > 100) throw new Error("PDF exceeds 100 pages.");
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
      page.cleanup();
      if (text.length > maxChars)
        throw new Error("Document exceeds 50,000 extracted characters.");
    }
    return validate(text);
  } finally {
    await task.destroy();
  }
}
try {
  let text;
  if (workerData.kind === "txt") {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\x00-\x08\x0e-\x1f]/.test(text))
      throw new Error("TXT must contain UTF-8 plain text.");
    text = validate(text);
  } else text = await (workerData.kind === "docx" ? docx() : pdf());
  parentPort.postMessage({ text });
} catch {
  parentPort.postMessage({
    error:
      "Unable to extract readable text. Use an unencrypted DOCX, text PDF (up to 100 pages), or UTF-8 TXT within the stated limits.",
  });
}
