/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: Next.js 14 keeps this option under `experimental`; it was promoted to a
  // top-level `serverExternalPackages` key in Next.js 15. Keep this in sync if you
  // upgrade the `next` dependency in package.json.
  // `mupdf` ships a WASM binary internally — marking it external tells webpack
  // to leave it alone and let Node's native `import()`/`require()` load it at
  // runtime instead of trying to bundle the .wasm file.
  experimental: {
    serverComponentsExternalPackages: ["mupdf"],
  },
};

module.exports = nextConfig;
