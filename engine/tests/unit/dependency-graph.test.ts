import test from "node:test";
import assert from "node:assert/strict";

import { parseDependencyGraphFromLockfile } from "../../src/phases/dependency-graph.ts";

test("parseDependencyGraphFromLockfile classifies root, direct, optional, peer, and transitive dependencies", () => {
  const packageJson = {
    name: "fixture",
    version: "1.0.0",
    dependencies: {
      rimraf: "^3.0.2",
    },
    optionalDependencies: {
      kleur: "^4.1.5",
    },
    peerDependencies: {
      react: "^18.3.1",
    },
  };

  const lockfile = {
    packages: {
      "": {
        name: "sandbox-project",
        version: "0.0.0",
      },
      "node_modules/fixture": {
        name: "fixture",
        version: "1.0.0",
        dependencies: {
          rimraf: "3.0.2",
        },
        optionalDependencies: {
          kleur: "4.1.5",
        },
        peerDependencies: {
          react: "18.3.1",
        },
      },
      "node_modules/fixture/node_modules/rimraf": {
        name: "rimraf",
        version: "3.0.2",
        dependencies: {
          glob: "7.2.3",
        },
      },
      "node_modules/fixture/node_modules/rimraf/node_modules/glob": {
        name: "glob",
        version: "7.2.3",
      },
      "node_modules/kleur": {
        name: "kleur",
        version: "4.1.5",
      },
      "node_modules/react": {
        name: "react",
        version: "18.3.1",
      },
    },
  };

  const report = parseDependencyGraphFromLockfile(lockfile, packageJson);
  assert.ok(report);
  assert.equal(report.packageName, "fixture");
  assert.equal(report.nodeCount, 5);

  const byName = Object.fromEntries(report.nodes.map((node) => [node.name, node]));

  assert.equal(byName.fixture.dependencyType, "root");
  assert.equal(byName.rimraf.dependencyType, "prod");
  assert.equal(byName.rimraf.direct, true);
  assert.equal(byName.kleur.dependencyType, "optional");
  assert.equal(byName.kleur.direct, true);
  assert.equal(byName.react.dependencyType, "peer");
  assert.equal(byName.react.direct, true);
  assert.equal(byName.glob.dependencyType, "transitive");
  assert.equal(byName.glob.direct, false);
  assert.ok(byName.glob.parents.includes(byName.rimraf.id));
  assert.equal(report.maxDepth, 2);
});
