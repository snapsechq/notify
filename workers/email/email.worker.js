const { mqbroker } = require("../../services/rabbitmq.service");
const fs = require("fs/promises");
const path = require("path");
const templateService = require("../../services/template.service");
const { connectDb } = require("../../models/connectDb");
const { renderTemplate } = require("../../services/render.service");
const { getValidatorForTemplate } = require("../../services/validator.service");
const idempotencyService = require("../../services/idempotency.service");
const createTransport = require("../../channels/email/index");
const { appConfig } = require('../../config/app.config');

// Channel identifier for idempotency
const CHANNEL = "email";

// Initialize transporter once globally (lazy load or on start)
// However, to avoid connection timeout issues if the worker runs effectively forever, 
// we might want to keep creating it or manage it better. 
// For now, let's keep it local but maybe move it out if performance is key.
// Given the user is debugging, detailed logging is priority.

async function emailNotificationHandler(payload, msg, channel) {
    // Extract key fields
    const {
        event_id,
        trace_id,
        template_id,
        context,
        recievers,
        attachments, // Support for file attachments
    } = payload;

    const logPrefix = `[${trace_id || 'NO_TRACE'}] [${event_id || 'NO_EVENT'}]`;

    try {
        // 1. Validate mandatory fields
        if (!recievers || !Array.isArray(recievers)) {
            console.log(`${logPrefix} [!] Invalid payload structure, missing receivers`);
            return channel.ack(msg);
        }

        // Use template_id if available, otherwise fallback to TEMPLATE_ID
        const templateKey = template_id || payload.TEMPLATE_ID;

        if (!templateKey) {
            console.log(`${logPrefix} [!] Missing template_id (and no slug fallback)`);
            return channel.ack(msg);
        }

        // 2. Idempotency Check
        if (event_id) {
            const isDuplicate = await idempotencyService.checkAndRecord(event_id, CHANNEL);
            if (isDuplicate) {
                console.log(`${logPrefix} [+] Duplicate event detected. Skipping.`);
                return channel.ack(msg);
            }
        } else {
            console.log(`${logPrefix} [!] WARNING: No event_id provided. Idempotency disabled.`);
        }

        // 3. Load Template
        const template = await templateService.getTemplateBySlug(templateKey);

        if (!template || template.status === "failed") {
            console.log(`${logPrefix} [+] TEMPLATE NOT FOUND OR FAILED: ${templateKey}`);
            if (event_id) await idempotencyService.updateStatus(event_id, CHANNEL, "failed");
            return channel.ack(msg);
        }

        if (!context) {
            console.log(`${logPrefix} [+] CONTEXT MISSING, SKIPPING EMAIL`);
            if (event_id) await idempotencyService.updateStatus(event_id, CHANNEL, "failed");
            return channel.ack(msg);
        }

        // 4. Validate Context
        const isValid = getValidatorForTemplate(templateKey);
        if (!isValid(context)) {
            console.log(`${logPrefix} [+] GIVEN CONTEXT HAS MISSING INFO`);
            if (event_id) await idempotencyService.updateStatus(event_id, CHANNEL, "failed");
            return channel.ack(msg);
        }

        const { raw } = template;
        const enrichedContext = { ...context, base_url: context.base_url || appConfig.BASE_URL, logo_url: appConfig.LOGO_URL };
        const emailBody = renderTemplate(raw, enrichedContext);
        let successCount = 0;
        let failCount = 0;

        const email_sender = createTransport();

        // 5. Process attachments if present
        // Attachments should be in format: [{ filename: 'file.xlsx', content: 'base64string', contentType: 'application/...' }]
        let processedAttachments = [];
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            console.log(`${logPrefix} [+] Processing ${attachments.length} attachment(s)`);
            processedAttachments = attachments.map(att => ({
                filename: att.filename,
                content: Buffer.from(att.content, 'base64'),
                contentType: att.contentType || 'application/octet-stream'
            }));
        }

        // 6. Send Emails
        console.log(`${logPrefix} [+] Starting email send loop for ${recievers.length} receivers. FROM: ${appConfig.EMAIL_FROM}`);

        for (let reciever of recievers) {
            if (!reciever.email) {
                console.log(`${logPrefix} [!] Skipping recipient with no email address`);
                continue;
            }

            try {
                console.log(`${logPrefix} [>] Sending to ${reciever.email} with Subject: "${context.subject}"${processedAttachments.length > 0 ? ` with ${processedAttachments.length} attachment(s)` : ''}...`);

                const mailOptions = {
                    from: (payload.sender && payload.sender.from) || appConfig.EMAIL_FROM,
                    to: reciever.email,
                    subject: context.subject,
                    html: emailBody,
                };

                const cc = reciever.cc || payload.cc || context.cc;
                if (cc) {
                    mailOptions.cc = cc;
                }

                const replyTo = reciever.replyTo || payload.replyTo || context.replyTo;
                if (replyTo) {
                    mailOptions.replyTo = replyTo;
                }

                // Add attachments if present
                if (processedAttachments.length > 0) {
                    mailOptions.attachments = processedAttachments;
                }

                const info = await email_sender.sendMail(mailOptions);
                console.log(`${logPrefix} [V] Sent to ${reciever.email}. MessageID: ${info.messageId}`);
                successCount++;
            } catch (err) {
                console.log(`${logPrefix} [-] FAILED TO SEND EMAIL TO ${reciever.email}: ${err.message}`);
                console.error(err); // Log full error object
                failCount++;
            }
        }

        console.log(`${logPrefix} [+] EMAILS SENT: ${successCount} SUCCESS, ${failCount} FAILED OUT OF ${recievers.length} CONTACTS`);

        // 6. Update Idempotency Status & Emit Delivery Event
        if (event_id) {
            await idempotencyService.updateStatus(event_id, CHANNEL, successCount > 0 ? "sent" : "failed");

            // 7. Emit Delivery Event (Optional but Recommended)
            if (successCount > 0) {
                try {
                    await mqbroker.publish("notification", "notification.email.sent", {
                        type: "notification.email.sent",
                        event_id,
                        user_id: payload.authContext?.user_id, // sanitized authContext
                        org_id: payload.orgId,
                        template_id: templateKey,
                        timestamp: new Date().toISOString(),
                        trace_id
                    });
                } catch (emitErr) {
                    console.log(`${logPrefix} [!] Failed to emit delivery event: ${emitErr.message}`);
                }
            }
        }

        channel.ack(msg);
    } catch (err) {
        console.log(`${logPrefix} [+] ERROR WHILE HANDLING EVENT: ${err.message}`);
        // If critical error, maybe don't ack to requeue? For now adhering to existing pattern of acking.
        channel.ack(msg);
    }
}

async function main() {
    // consume events
    await mqbroker.consume("notification", "notification.email", emailNotificationHandler, "emailOnlyNotificationsQueue");
}

module.exports = main;
module.exports.emailNotificationHandler = emailNotificationHandler;