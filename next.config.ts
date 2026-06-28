import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone (server.js +
  // only the traced node_modules). Lets the Docker image ship without a full
  // `npm install` or `next start` — see node_modules/next/dist/docs/.../output.md.
  output: "standalone",
};

export default nextConfig;
