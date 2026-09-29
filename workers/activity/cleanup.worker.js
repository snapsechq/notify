const Activity = require("../../models/activity.model");

const MAX_ACTIVITIES_PER_ORG = 50000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run every 24 hours

/**
 * Drops any legacy TTL index on createdAt if it exists in MongoDB
 */
async function dropLegacyTtlIndex() {
    try {
        if (!Activity.collection) return;
        const indexes = await Activity.collection.indexes();
        const ttlIndex = indexes.find(
            idx => idx.key && idx.key.createdAt && idx.expireAfterSeconds !== undefined
        );
        if (ttlIndex) {
            await Activity.collection.dropIndex(ttlIndex.name);
            console.log(`[+] ACTIVITY CLEANUP: Dropped legacy TTL index "${ttlIndex.name}" from activity collection`);
        }
    } catch (err) {
        // If collection doesn't exist yet or index is already absent, ignore safely
        if (err.codeName !== "NamespaceNotFound" && err.code !== 26) {
            console.warn("[-] ACTIVITY CLEANUP: Notice while checking TTL indexes:", err.message);
        }
    }
}

/**
 * Retains only the most recent 50,000 activities for each organization, deleting older records.
 */
async function cleanupOldActivities() {
    try {
        await dropLegacyTtlIndex();

        const orgIds = await Activity.distinct("orgId");
        let totalDeleted = 0;

        for (const orgId of orgIds) {
            if (!orgId) continue;

            const count = await Activity.countDocuments({ orgId });
            if (count > MAX_ACTIVITIES_PER_ORG) {
                // Find the boundary document at index MAX_ACTIVITIES_PER_ORG (0-indexed: skip 50000 - 1)
                const boundaryDoc = await Activity.find({ orgId })
                    .sort({ createdAt: -1, _id: -1 })
                    .skip(MAX_ACTIVITIES_PER_ORG - 1)
                    .limit(1)
                    .select({ createdAt: 1, _id: 1 })
                    .lean();

                if (boundaryDoc && boundaryDoc.length > 0) {
                    const cutoffDate = boundaryDoc[0].createdAt;
                    const cutoffId = boundaryDoc[0]._id;

                    const result = await Activity.deleteMany({
                        orgId,
                        $or: [
                            { createdAt: { $lt: cutoffDate } },
                            { createdAt: cutoffDate, _id: { $lt: cutoffId } }
                        ]
                    });

                    totalDeleted += result.deletedCount || 0;
                    console.log(`[+] ACTIVITY CLEANUP: Deleted ${result.deletedCount} old activities for org ${orgId} (retained latest ${MAX_ACTIVITIES_PER_ORG})`);
                }
            }
        }

        if (totalDeleted > 0) {
            console.log(`[+] ACTIVITY CLEANUP COMPLETED: Deleted ${totalDeleted} excess activities across ${orgIds.length} org(s)`);
        }
        return { totalDeleted };
    } catch (err) {
        console.error("[-] ACTIVITY CLEANUP ERROR:", err.message);
        throw err;
    }
}

/**
 * Starts the cleanup worker that runs periodically
 */
function startCleanupWorker() {
    console.log(`[+] ACTIVITY CLEANUP WORKER STARTED - Keeping latest ${MAX_ACTIVITIES_PER_ORG} activities per org, running every 24 hours`);

    // Run immediately on startup
    cleanupOldActivities().catch(err => {
        console.error("[-] Error in initial activity cleanup run:", err.message);
    });

    // Then run every 24 hours
    setInterval(() => {
        cleanupOldActivities().catch(err => {
            console.error("[-] Error in periodic activity cleanup run:", err.message);
        });
    }, CLEANUP_INTERVAL_MS);
}

module.exports = {
    startCleanupWorker,
    cleanupOldActivities,
    MAX_ACTIVITIES_PER_ORG
};
