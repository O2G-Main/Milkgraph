import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("telemetry config files exist for Next.js standalone", () => {
  for (const rel of [
    "instrumentation.ts",
    "sentry.client.config.ts",
    "sentry.server.config.ts",
    "next.config.ts",
    "Dockerfile",
  ]) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} must exist`);
  }

  const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /ARG NEXT_PUBLIC_SENTRY_DSN/);

  const nextCfg = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(nextCfg, /withSentryConfig/);
});
