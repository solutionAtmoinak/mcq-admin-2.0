import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions POST back to the page URL and Next.js checks the
    // request's Origin header against Host/X-Forwarded-Host as CSRF
    // protection. Behind the production reverse proxy those don't match by
    // default, so every "use server" call (e.g. updateQuestion) 500s with
    // "Invalid Server Actions request." (error E80). Listing the public
    // domain here is the documented fix for reverse-proxy deployments.
    serverActions: {
      allowedOrigins: ["proexamadmin.dthlms.com"],
    },
  },
};

export default nextConfig;
