const transporter = require("../channels/email/index")();
class NodemailerProvider {
    constructor() {
        this.transporter = transporter;
    }

    async send({ to, subject, html, text, cc, replyTo, trace_id }) {
        const email = {
            to,
            subject,
            html,
            text: text || "This email contains HTML content."
        };
        if (cc) email.cc = cc;
        if (replyTo) email.replyTo = replyTo;

        try {
            console.log(`[${trace_id}] [EmailProvider] Sending email to ${to}`);
            await this.transporter.sendMail(email);
            console.log(`[${trace_id}] [EmailProvider] Sent successfully to ${to}`);
        } catch (err) {
            console.error(`[${trace_id}] [EmailProvider] Failed to send to ${to}: ${err.message}`);
            throw err;
        }
    }
}

module.exports = new NodemailerProvider();
