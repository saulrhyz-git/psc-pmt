/**
 * types/pdfjs-worker.d.ts
 * -----------------------------------------------------------------------------
 * pdfjs-dist ships `pdf.worker.mjs` as a deep subpath import with no bundled
 * type declarations. app/api/analyze/route.ts dynamically imports it directly
 * (instead of relying on GlobalWorkerOptions.workerSrc resolution, which
 * proved unreliable across bundlers/runtimes) to register its
 * WorkerMessageHandler on globalThis.pdfjsWorker. This ambient declaration
 * just tells TypeScript the module exists and what it exports, matching
 * pdfjs-dist's own internal usage of this export.
 * -----------------------------------------------------------------------------
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const WorkerMessageHandler: any;
}
