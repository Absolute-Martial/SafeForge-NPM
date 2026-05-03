import test from "node:test";
import assert from "node:assert/strict";

import { describeEvent } from "../../src/render.ts";

test("describeEvent formats advisory matches for terminal output", () => {
  const line = describeEvent(
    {
      type: "advisory_match",
      advisory: {
        severity: "high",
        sourceIds: ["GHSA-xxxx-yyyy"],
        packageName: "minimist",
        packageVersion: "0.0.8",
      },
    },
    true,
  );

  assert.equal(line, "> ADVISORY: HIGH GHSA-xxxx-yyyy on minimist@0.0.8");
});

test("describeEvent suppresses low-risk cli command noise", () => {
  const line = describeEvent(
    {
      type: "cli_command_result",
      result: {
        risk: "low",
      },
    },
    true,
  );

  assert.equal(line, null);
});

test("describeEvent formats staged investigation updates", () => {
  const line = describeEvent(
    {
      type: "investigation_stage_completed",
      stage: "call_chain_expansion",
      family: "network_exfiltration",
      summary: "Observed outbound POST after env access",
    },
    true,
  );

  assert.equal(line, "> network exfiltration: Observed outbound POST after env access");
});
