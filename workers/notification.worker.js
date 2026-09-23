const { mqbroker } = require("../services/rabbitmq.service");
const { connectDb } = require("../models/connectDb");
const notificationService = require("../services/notification.service");
const orgMembersResolver = require("../services/org.resolver");

async function notificationHandler(payload, msg, channel) {
    try {
        const { orgId, notification, store, channels = [], authContext, orgCoverage, event_key } = payload;
        console.log(`[NOTIFY] Processing event: ${event_key} for Org: ${orgId}`);

        let recieversList = payload.recievers || payload.receivers || [];
        recieversList = Array.isArray(recieversList) ? recieversList : [recieversList];
        const actorId = authContext?._id || authContext?.userId;
        console.log(`[NOTIFY] Actor: ${actorId}, Initial Recipients: ${recieversList.length}`);

        // resolve roles/teams if orgCoverage is provided
        if (orgCoverage) {
            const roles = orgCoverage.roles || [];
            const teams = orgCoverage.teams || [];
            console.log(`[NOTIFY] Resolving OrgCoverage: Roles=${JSON.stringify(roles)}, Teams=${JSON.stringify(teams)}`);

            if (roles.length > 0) {
                const recipientsByRoles = await orgMembersResolver.resolveMembersUsingRoles(orgId, roles);
                console.log(`[NOTIFY] Resolved ${recipientsByRoles.length} members by roles`);
                recieversList = [...recieversList, ...recipientsByRoles];
            }

            if (teams.length > 0) {
                const recipientsByTeams = await orgMembersResolver.resolveMembersUsingTeams(orgId, teams);
                console.log(`[NOTIFY] Resolved ${recipientsByTeams.length} members by teams`);
                recieversList = [...recieversList, ...recipientsByTeams];
            }
        }

        // Standardize recipient objects to have email and userId
        recieversList = recieversList.map(r => ({
            email: r.email,
            userId: r.userId || r._id || r.id
        })).filter(r => r.email);

        // Deduplicate recipients by email
        const uniqueRecipientsMap = new Map();
        recieversList.forEach(r => {
            if (!uniqueRecipientsMap.has(r.email)) {
                uniqueRecipientsMap.set(r.email, r);
            }
        });

        // Store all resolved target recipients for in-app storage
        const allResolvedRecipients = Array.from(uniqueRecipientsMap.values());

        // Originator Exclusion: Strictly filter out the actor from external DELIVERY channels.
        // Exception: Explicit assignment notifications (e.g., remediation campaign assigned) or when allowSelfNotification is true.
        const isSelfAllowedNotification = payload.allowSelfNotification ||
            payload.template_id === 'REMEDIATION_CAMPAIGN_ASSIGNED_NOTIFICATION' ||
            payload.template_id === 'CAMPAIGN_ASSIGNED_NOTIFICATION' ||
            payload.template_id === 'BLOCKER_ASSIGNED_NOTIFICATION' ||
            payload.template_id === 'VULN_RISK_ACCEPTED_NOTIFICATION' ||
            payload.template_id === 'VULN_ASSIGNED_NOTIFICATION' ||
            payload.template_id === 'REPORT_GENERATED_NOTIFICATION';

        if (actorId && !isSelfAllowedNotification) {
            uniqueRecipientsMap.forEach((val, key) => {
                if (String(val.userId) === String(actorId)) {
                    console.log(`[NOTIFY] Strictly excluding Actor ${actorId} from external delivery channels`);
                    uniqueRecipientsMap.delete(key);
                }
            });
        }

        const finalRecievers = Array.from(uniqueRecipientsMap.values());
        console.log(`[NOTIFY] Total recipients after exclusion: ${finalRecievers.length}`);
        finalRecievers.forEach(r => console.log(`[NOTIFY] -> Recipient: ${r.email} (ID: ${r.userId})`));

        // publish to channels with recievers resolved.
        for (let channel of channels) {
            console.log(`[NOTIFY] Publishing to channel: ${channel.toUpperCase()}`);
            await mqbroker.publish("notification", `notification.${channel}`, {
                ...payload,
                recievers: finalRecievers,
                event_id: payload.event_id,
                trace_id: payload.trace_id,
                template_id: payload.template_id
            });
        }

        if (store && Object.keys(notification || {})?.length) {
            // New structure: userIds (owners), actor, target
            let userIds = payload.owners || payload.userIds || notification.owners || notification.userIds || [];
            
            // Fallback: If no owners/userIds provided, use all resolved recipients for in-app storage
            if (!userIds.length && allResolvedRecipients.length > 0) {
                userIds = allResolvedRecipients.map(r => r.userId).filter(Boolean);
            }

            console.log(`[NOTIFY] Storing notification for UserIDs: ${JSON.stringify(userIds)}`);

            let actor = notification.actor;
            if (!actor && authContext) {
                actor = {
                    id: authContext?._id,
                    name: authContext?.firstName + " " + authContext?.lastName,
                    email: authContext?.email,
                    avatar: authContext?.avatar,
                    type: "user"
                }
            }


            let obj = {
                orgId,
                ...notification,
                userIds,
                actor,
                target: payload.target || notification.target,
                context: payload.context || notification.context,
                event_key: payload.event_key,
                ui_context: payload.ui_context,
                origin: payload.origin || notification.origin
            };

            // Remove legacy fields if they exist to keep it clean
            delete obj.owners;
            delete obj.user;

            const noti = await notificationService.createNotification(orgId, obj);
            console.log(`[NOTIFY] SUCCESS: Notification stored for event ${event_key} with ID: ${noti?._id}`);
        } else {
            console.log(`[NOTIFY] SKIP STORAGE: store=${store}, notificationKeys=${Object.keys(notification || {}).length}`);
        }

        channel.ack(msg);
    }
    catch (err) {
        console.log("[NOTIFY] FATAL ERROR", err.message);
        return channel.ack(msg);
    }
}

async function main() {
    await mqbroker.consume("notification", "notification", notificationHandler, 'notificationsQueue');
}

module.exports = main;