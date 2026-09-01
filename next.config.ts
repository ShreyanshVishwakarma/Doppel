import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solari SDKs bundle patchright-core which pulls optional chromium-bidi — keep them external on server
  serverExternalPackages: ["@solarisdk/browser", "@solarisdk/sandbox", "@solarisdk/desktop", "@solarisdk/core", "patchright-core", "chromium-bidi"],
};

export default nextConfig;
