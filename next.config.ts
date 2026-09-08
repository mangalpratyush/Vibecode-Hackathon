import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "pdfkit"],

  /*
    pdfkit reads the Adobe font metrics for its standard fourteen fonts off
    disk at runtime, by a path it computes itself. File tracing follows
    imports, not computed reads, so those .afm files are left out of the
    deployed bundle and the first request for a certificate or a paperbook
    fails with ENOENT on Helvetica.afm. It cannot reproduce locally, where
    node_modules is simply there, so it is pinned in explicitly.
  */
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
