import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @libsql/client 带原生绑定，让它留在 node_modules 里由 Node 直接 require，别打包
  serverExternalPackages: ["@libsql/client", "libsql", "https-proxy-agent"],
};

export default nextConfig;
