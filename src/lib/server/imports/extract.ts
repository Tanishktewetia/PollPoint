import "server-only";
import { Worker } from "node:worker_threads";
import path from "node:path";

export function extractText(
  bytes: Buffer,
  kind: "docx" | "pdf" | "txt",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(process.cwd(), "src/lib/server/imports/extract-worker.mjs"),
      {
        workerData: { bytes, kind },
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Extraction timed out. Try a smaller document."));
    }, 15000);
    worker.once("message", (result: { text?: string; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.text) resolve(result.text);
      else reject(new Error(result.error));
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Unable to read this document."));
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Document extraction stopped."));
    });
  });
}
