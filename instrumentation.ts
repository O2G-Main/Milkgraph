import * as Sentry from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";

export async function register() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
    registerOTel({ serviceName: "milkgraph-front" });
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
