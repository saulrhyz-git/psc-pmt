/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: Next.js 14 keeps this option under `experimental`; it was promoted to a
  // top-level `serverExternalPackages` key in Next.js 15. Keep this in sync if you
  // upgrade the `next` dependency in package.json.
  experimental: {
    serverComponentsExternalPackages: ["canvas", "pdfjs-dist"],
  },
};

module.exports = nextConfig;
