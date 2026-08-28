// Minimal stand-in so modules that reach the database can be imported in unit
// tests. Query execution is not simulated — tests that need real rows should
// exercise pure functions instead.
function noopDatabase() {
  return {
    execSync: () => {},
    getAllSync: () => [],
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    prepareSync: () => ({ executeSync: () => ({ getAllSync: () => [] }), finalizeSync: () => {} }),
    closeSync: () => {},
  };
}

module.exports = {
  openDatabaseSync: noopDatabase,
  openDatabaseAsync: async () => noopDatabase(),
  deleteDatabaseSync: () => {},
};
