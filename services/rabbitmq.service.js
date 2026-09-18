/**
 * RabbitMQ Broker for notify
 * Powered by @snapsechq/rabbitmq
 */
const { createMqBroker } = require("@snapsechq/rabbitmq");
const { buildRabbitmqUrl } = require("../utils/utils");

const mqbroker = createMqBroker({
    url: buildRabbitmqUrl(),
});

module.exports = { mqbroker };