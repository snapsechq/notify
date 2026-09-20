const createAuth = require("@snapsechq/authentication");
const { appConfig } = require("../../config/app.config.js");

const authSuite = createAuth({
  publicKeyPath: appConfig.PUBLIC_KEY_PATH,
  serviceKey: appConfig.SERVICE_KEY,
  authServiceUrl: appConfig.AUTH_SERVICE_URL,
  activityOrigin: "notify",
  onActivityLog: async (log) => {
    try {
      const { mqbroker } = require("../../services/rabbitmq.service.js");
      if (mqbroker && mqbroker.publish) {
        await mqbroker.publish("activitylogs", "activitylogs.all", log);
      }
    } catch (err) {
      console.error("Failed to publish activity log:", err?.message || err);
    }
  },
});

const requireApiKeyAuth = authSuite.auth({
  mode: ["api_key", "internal"],
});

module.exports = authSuite.auth;
module.exports.auth = authSuite.auth;
module.exports.requireAuth = authSuite.requireAuth;
module.exports.optionalAuth = authSuite.optionalAuth;
module.exports.requireAdmin = authSuite.requireAdmin;
module.exports.requireManager = authSuite.requireManager;
module.exports.requireMember = authSuite.requireMember;
module.exports.authenticateService = authSuite.authenticateService;
module.exports.requireWriteAccess = authSuite.requireWriteAccess;
module.exports.requireApiKeyAuth = requireApiKeyAuth;
