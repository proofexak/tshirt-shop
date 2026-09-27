const { loadEnv } = require("@medusajs/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
};

if (process.env.TEST_TYPE === "integration") {
  module.exports.testMatch = ["**/integration-tests/*.spec.[jt]s"];
  // medusaIntegrationTestRunner's beforeAll creates a fresh database and runs
  // every module's migrations — tens of seconds even on a fast machine, far
  // more than Jest's 5s hook default. A too-short timeout doesn't just fail
  // the test — Jest aborts mid-migration, which the database sees as a
  // killed connection ("terminating connection due to administrator
  // command"), potentially leaving the schema half-migrated. Set globally
  // here so every spec of this type gets it without repeating it.
  module.exports.testTimeout = 120000;
} else if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
}
