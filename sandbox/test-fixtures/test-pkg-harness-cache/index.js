global.__SAFEFORGE_NPM_HARNESS_CACHE_COUNT__ =
  (global.__SAFEFORGE_NPM_HARNESS_CACHE_COUNT__ || 0) + 1;

module.exports = {
  loadCount: global.__SAFEFORGE_NPM_HARNESS_CACHE_COUNT__,
};
