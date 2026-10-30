import type { NextConfig } from "next";

// Static export: the Worker (dashboard/src/worker.js) serves out/ as its assets and owns /api.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  devIndicators: false,
};

export default config;
