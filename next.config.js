/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: Next.js 14 keeps this option under `experimental`; it was promoted to a
  // top-level `serverExternalPackages` key in Next.js 15. Keep this in sync if you
  // upgrade the `next` dependency in package.json.
  // `mupdf` ships a WASM binary internally — marking it external tells webpack
  // to leave it alone and let Node's native `import()`/`require()` load it at
  // runtime instead of trying to bundle the .wasm file.
  // `pdfkit` (used by lib/plan-analysis-pdf.ts to generate the "Add to
  // Project" PDF report) similarly reads its standard-14-font metrics
  // (Helvetica.afm etc.) from a `data/` folder next to its own JS files via a
  // relative fs path at runtime. Webpack bundling it into
  // `.next/server/vendor-chunks/` leaves that `data/` folder behind, causing
  // "ENOENT ... vendor-chunks/data/Helvetica.afm" in production. Marking it
  // external keeps it loaded via a normal `require()` from node_modules,
  // where `data/` sits right where pdfkit expects it.
  experimental: {
    serverComponentsExternalPackages: ["mupdf", "pdfkit"],
  },
};

module.exports = nextConfig;
