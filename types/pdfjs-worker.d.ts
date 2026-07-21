/**
 * types/pdfjs-worker.d.ts
 * -----------------------------------------------------------------------------
 * DEPRECATED / UNUSED. This ambient declaration supported an earlier
 * pdfjs-dist + node-canvas PDF rasterization implementation, which was
 * replaced by `mupdf` in app/api/analyze/route.ts (pdfjs-dist + node-canvas
 * has a known unresolved upstream bug rendering PDFs with embedded raster
 * images — see the license/rationale comment at the top of that route file).
 * pdfjs-dist and canvas have been removed from package.json.
 *
 * This file is kept as an empty, harmless no-op (rather than deleted) because
 * this environment couldn't remove it. It has no effect on the build.
 * -----------------------------------------------------------------------------
 */
export {};
