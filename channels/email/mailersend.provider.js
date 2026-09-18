/**
 * MailerSend Email Provider
 * 
 * Uses MailerSend API to send transactional emails.
 * This is the primary email provider for the notification service.
 * 
 * Required environment variables:
 * - MAILERSEND_API_KEY: Your MailerSend API key
 * - EMAIL_FROM: Default sender email address
 * - EMAIL_FROM_NAME: Default sender name (optional)
 */

const axios = require("axios");

const MAILERSEND_API_URL = "https://api.mailersend.com/v1/email";

class MailerSendProvider {
    constructor() {
        this.apiKey = process.env.MAILERSEND_API_KEY;
        this.defaultFrom = process.env.EMAIL_FROM || "no-reply@snapsec.co";
        this.defaultFromName = process.env.EMAIL_FROM_NAME || "Snapsec";

        if (!this.apiKey) {
            console.warn("[MailerSend] API key not configured. Email sending will fail.");
        }
    }

    /**
     * Send an email using MailerSend API
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email address
     * @param {string} options.subject - Email subject
     * @param {string} options.html - HTML content of the email
     * @param {string} [options.text] - Plain text content (optional)
     * @param {string} [options.from] - Sender email (optional, uses default)
     * @param {string} [options.fromName] - Sender name (optional, uses default)
     * @param {string} [options.trace_id] - Trace ID for logging
     */
    async send({ to, subject, html, text, from, fromName, cc, replyTo, trace_id }) {
        const traceId = trace_id || `ms-${Date.now()}`;

        if (!this.apiKey) {
            throw new Error("MailerSend API key is not configured");
        }

        const payload = {
            from: {
                email: from || this.defaultFrom,
                name: fromName || this.defaultFromName
            },
            to: [
                {
                    email: to
                }
            ],
            subject: subject,
            html: html,
            text: text || this._stripHtml(html)
        };

        if (cc) {
            payload.cc = Array.isArray(cc)
                ? cc.map(c => typeof c === 'string' ? { email: c } : c)
                : [{ email: cc }];
        }

        if (replyTo) {
            payload.reply_to = typeof replyTo === 'string' ? { email: replyTo } : replyTo;
        }

        try {
            console.log(`[${traceId}] [MailerSend] Sending email to ${to}`);
            
            const response = await axios.post(MAILERSEND_API_URL, payload, {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            // MailerSend returns 202 on success
            if (response.status === 202) {
                const messageId = response.headers["x-message-id"] || "unknown";
                console.log(`[${traceId}] [MailerSend] Email sent successfully to ${to}, messageId: ${messageId}`);
                return { success: true, messageId };
            }

            console.log(`[${traceId}] [MailerSend] Unexpected response status: ${response.status}`);
            return { success: true };
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            const errorDetails = error.response?.data?.errors || {};
            
            console.error(`[${traceId}] [MailerSend] Failed to send email to ${to}: ${errorMessage}`);
            console.error(`[${traceId}] [MailerSend] Error details:`, JSON.stringify(errorDetails));
            
            throw new Error(`MailerSend error: ${errorMessage}`);
        }
    }

    /**
     * Send bulk emails using MailerSend API
     * @param {Array} emails - Array of email objects
     */
    async sendBulk(emails) {
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        // MailerSend has a bulk endpoint, but for simplicity we'll send individually
        // This allows better error handling per recipient
        for (const email of emails) {
            try {
                await this.send(email);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    email: email.to,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Verify the API key is valid
     */
    async verifyConnection() {
        try {
            const response = await axios.get("https://api.mailersend.com/v1/api-tokens", {
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                }
            });
            console.log("[MailerSend] API connection verified successfully");
            return true;
        } catch (error) {
            console.error("[MailerSend] API connection verification failed:", error.message);
            return false;
        }
    }

    /**
     * Strip HTML tags for plain text version
     * @private
     */
    _stripHtml(html) {
        if (!html) return "";
        return html
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .trim();
    }
}

module.exports = new MailerSendProvider();
