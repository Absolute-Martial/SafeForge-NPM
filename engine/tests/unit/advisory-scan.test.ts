import test from "node:test";
import assert from "node:assert/strict";
import { withPatchedEnv } from "../helpers/env.ts";

const advisoryModuleUrl = new URL("../../src/phases/advisory-scan.ts", import.meta.url).href;

async function loadFreshAdvisoryModule() {
  return await import(`${advisoryModuleUrl}?t=${Date.now()}-${Math.random()}`);
}

test("scanAdvisories deduplicates OSV matches, enriches CVEs, and warns when GHSA token is missing", async () => {
  const originalFetch = global.fetch;

  try {
    const mod = await withPatchedEnv(
      {
        SAFEFORGE_NPM_GITHUB_TOKEN: undefined,
        SAFEFORGE_NPM_NVD_API_KEY: undefined,
      },
      async () => await loadFreshAdvisoryModule(),
    );

    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("api.osv.dev")) {
        return new Response(JSON.stringify({
          results: [
            {},
            {
              vulns: [
                {
                  id: "OSV-2026-1",
                  summary: "Prototype pollution in minimist",
                  details: "Known dangerous version with command-line parsing issue.",
                  aliases: ["GHSA-vh95-rmgr-6w4m", "CVE-2021-44906"],
                  severity: [{ type: "CVSS_V3", score: "HIGH" }],
                  affected: [
                    {
                      package: { ecosystem: "npm", name: "minimist" },
                      ranges: [{ events: [{ introduced: "0" }, { fixed: "1.2.6" }] }],
                    },
                  ],
                  references: [{ url: "https://osv.dev/example" }],
                },
              ],
            },
          ],
        }), { status: 200 });
      }

      if (url.includes("services.nvd.nist.gov")) {
        return new Response(JSON.stringify({
          vulnerabilities: [
            {
              cve: {
                descriptions: [{ lang: "en", value: "NVD-enriched description" }],
                metrics: {
                  cvssMetricV31: [{ cvssData: { baseSeverity: "HIGH" } }],
                },
                references: [{ url: "https://nvd.nist.gov/example" }],
              },
            },
          ],
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    const result = await mod.scanAdvisories({
      packageName: "fixture",
      packageVersion: "1.0.0",
      nodeCount: 2,
      directCount: 1,
      maxDepth: 1,
      nodes: [
        {
          id: "fixture@1.0.0::node_modules/fixture",
          name: "fixture",
          version: "1.0.0",
          depth: 0,
          dependencyType: "root",
          path: "node_modules/fixture",
          parents: [],
          direct: false,
        },
        {
          id: "minimist@1.2.5::node_modules/fixture/node_modules/minimist",
          name: "minimist",
          version: "1.2.5",
          depth: 1,
          dependencyType: "prod",
          path: "node_modules/fixture/node_modules/minimist",
          parents: ["fixture@1.0.0::node_modules/fixture"],
          direct: true,
        },
      ],
    });

    assert.equal(result.advisories.length, 1);
    assert.equal(result.summary.total, 1);
    assert.equal(result.summary.dangerousCount, 1);
    assert.equal(result.advisories[0]?.fixedVersion, "1.2.6");
    assert.deepEqual(result.advisories[0]?.dependencyPaths[0], ["fixture", "minimist"]);
    assert.ok(result.warnings.some((warning) => warning.code === "GHSA_TOKEN_MISSING"));
  } finally {
    global.fetch = originalFetch;
  }
});
