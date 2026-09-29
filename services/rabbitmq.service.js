/**
 * RabbitMQ Broker for notify
 * Powered by @snapsechq/core
 */
const { createMqBroker } = require("@snapsechq/core");
const { buildRabbitmqUrl } = require("../utils/utils");

const mqbroker = createMqBroker({
    url: buildRabbitmqUrl(),
});

module.exports = { mqbroker };