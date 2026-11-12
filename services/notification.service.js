const Notification = require("../models/notifications.model");
const { ObjectId } = require("mongoose").Types;
const axios = require("axios");
const { appConfig } = require("../config/app.config");

const resolveUserMetadata = async (userIds) => {
    if (!userIds || userIds.length === 0) return {};
    try {
        const response = await axios.post(`${appConfig.AUTH_SERVICE_URL}/api/internal/resource-resolver`, {
            resourceIds: [...new Set(userIds)],
            resourceType: "user"
        }, {
            headers: { 'service-api-key': appConfig.SERVICE_KEY }
        });
        
        const userMap = {};
        if (response.data && Array.isArray(response.data)) {
            response.data.forEach(user => {
                userMap[user.userId || user._id] = {
                    name: user.firstName ? `${user.firstName} ${user.lastName}` : user.name,
                    email: user.email,
                    avatar: user.avatar
                };
            });
        }
        return userMap;
    } catch (err) {
        console.error("[+] FAILED TO RESOLVE USER METADATA", err.message);
        return {};
    }
};

const createNotification = async (orgId, notification) => {
    try {
        const created = await Notification.create({ orgId, ...notification });
        return created;
    } catch (err) {
        console.log("[+] ERROR WHILE CREATING NOTIFICATION ", err.message);
        return { code: 500, status: "failed", message: "failed to create notification" };
    }
};

const getAllNotifications = async (orgId, userId, filter = {}, page = 1, limit = 10) => {
    try {
        const query = { 
            orgId, 
            userIds: userId // Matches if userId is in the userIds array
        };

        if (filter.unread === 'true' || filter.unread === true) {
            query.seenBy = { $ne: userId };
        }

        // Apply other filters if any
        const { unread, ...otherFilters } = filter;
        Object.assign(query, otherFilters);

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Notification.countDocuments(query);
        const unseen = await Notification.countDocuments({ 
            orgId, 
            userIds: userId, 
            seenBy: { $ne: userId } 
        });

        // Hydrate actor metadata
        const actorIds = [...new Set(notifications.map(n => n.actor?.id).filter(id => id))];
        const userMap = await resolveUserMetadata(actorIds);

        const denoisedNotifications = notifications.map(n => {
            // Construct target from context/resourceUrl if not present
            const target = n.target || {
                id: n.context?.resourceItemId,
                type: n.context?.resource,
                title: n.context?.title,
                url: n.resourceUrl
            };

            // Hydrate actor
            let actor = n.actor;
            if (actor && actor.id && userMap[actor.id]) {
                actor = { ...actor, ...userMap[actor.id] };
            }

            return {
                _id: n._id,
                orgId: n.orgId,
                userIds: n.userIds,
                actor,
                target,
                context: n.context,
                seenBy: n.seenBy || [],
                seen: n.seenBy ? n.seenBy.includes(userId) : false,
                origin: n.origin,
                notificationType: n.notificationType,
                event_key: n.event_key,
                createdAt: n.createdAt
            };
        });

        const supportedFilters = {};
        supportedFilters.product = ["WAS", "VM", "ASM", "VS", "AIM", "STRIKE"];

        return { notifications: denoisedNotifications, total, unseen, filters: supportedFilters };
    } catch (err) {
        console.error("[+] ERROR FETCHING NOTIFICATIONS", err.message);
        return { notifications: [], total: 0, unseen: 0 };
    }
};

const markNotificationSeen = async (orgId, userId, notificationId) => {
    try {
        const updated = await Notification.findOneAndUpdate(
            { orgId, _id: new ObjectId(notificationId), userIds: userId },
            { $addToSet: { seenBy: userId } },
            { new: true }
        );

        if (!updated) return { code: 404, status: "failed", message: "notification not found" };
        return updated;
    } catch (err) {
        console.log("[+] ERROR MARKING NOTIFICATION AS SEEN", err.message);
        return { code: 500, status: "failed", message: "failed to update notification" };
    }
};

const markAllAsSeen = async (orgId, userId, filter = {}) => {
    try {
        const query = { orgId, userIds: userId, ...filter };

        const updated = await Notification.updateMany(
            query,
            { $addToSet: { seenBy: userId } }
        );

        return updated;
    } catch (error) {
        console.log("[+] FAILED TO MARK ALL AS SEEN", error.message);
        return { code: 500, status: "failed", message: "failed to update notifications" };
    }
};

module.exports = {
    createNotification,
    getAllNotifications,
    markNotificationSeen,
    markAllAsSeen
};