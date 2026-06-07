import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moss uses a native N-API binding. Keep it external so Vercel includes the
  // correct Linux binary instead of trying to bundle the binding into JS.
  serverExternalPackages: ["@moss-dev/moss", "@moss-dev/moss-core"],
};

export default nextConfig;
