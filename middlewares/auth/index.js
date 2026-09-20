import createAuth from "@snapsechq/authentication";
import { appConfig } from "../../config/app.config.js";

const authSuite = createAuth({
  publicKeyPath: appConfig.PUBLIC_KEY_PATH,
  serviceKey: appConfig.SERVICE_KEY,
  authServiceUrl: appConfig.AUTH_SERVICE_URL,
  activityOrigin: "notify",
  onActivityLog: async (log) => {
    try {
      const { mqbroker } = await import("../../services/rabbitmq.service.js");
      if (mqbroker?.publish) {
        await mqbroker.publish("activitylogs", "activitylogs.all", log);
      }
    } catch (err) {
      console.error("Failed to publish activity log:", err?.message || err);
    }
  },
});

export const requireApiKeyAuth = authSuite.auth({
  mode: ["api_key", "internal"],
});

export const auth = authSuite.auth;
export const requireAuth = authSuite.requireAuth;
export const optionalAuth = authSuite.optionalAuth;
export const requireAdmin = authSuite.requireAdmin;
export const requireManager = authSuite.requireManager;
export const requireMember = authSuite.requireMember;
export const authenticateService = authSuite.authenticateService;
export const requireWriteAccess = authSuite.requireWriteAccess;

export default authSuite.auth;
