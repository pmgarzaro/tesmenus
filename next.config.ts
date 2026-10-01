import type { NextConfig } from "next";

// tesseract.js runs its OCR in a worker thread loaded by path: the file tracer
// cannot follow it, so the package and its whole dependency tree are listed.
const OCR_PACKAGES = [
  "tesseract.js",
  "tesseract.js-core",
  "bmp-js",
  "idb-keyval",
  "is-url",
  "node-fetch",
  "whatwg-url",
  "tr46",
  "webidl-conversions",
  "regenerator-runtime",
  "wasm-feature-detect",
  "zlibjs",
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp", "tesseract.js"],
  outputFileTracingIncludes: {
    "/api/import/photo": [
      "./node_modules/@tesseract.js-data/fra/4.0.0_best_int/**",
      ...OCR_PACKAGES.map((p) => `./node_modules/${p}/**`),
    ],
  },
};

export default nextConfig;
