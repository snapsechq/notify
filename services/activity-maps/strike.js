const STRIKE_BASE_PATH = '/autopentest/api/v1';

module.exports = {
    // Projects
    [`${STRIKE_BASE_PATH}/projects`]: {
        'GET': 'Listed Strike projects',
        'POST': 'Created a Strike project'
    },
    [`${STRIKE_BASE_PATH}/projects/[^/]+`]: {
        'GET': 'Viewed Strike project',
        'PUT': 'Updated Strike project',
        'DELETE': 'Deleted Strike project'
    },
    [`${STRIKE_BASE_PATH}/projects/[^/]+/scan`]: {
        'POST': 'Executed scan on Strike project'
    },

    // Scans
    [`${STRIKE_BASE_PATH}/scans`]: {
        'GET': 'Listed Strike scans',
        'POST': 'Created a Strike scan'
    },
    [`${STRIKE_BASE_PATH}/scans/[^/]+`]: {
        'GET': 'Viewed Strike scan details',
        'DELETE': 'Deleted Strike scan'
    },
    [`${STRIKE_BASE_PATH}/scans/[^/]+/cancel`]: {
        'POST': 'Cancelled Strike scan'
    },
    [`${STRIKE_BASE_PATH}/scans/[^/]+/pause`]: {
        'POST': 'Paused Strike scan'
    },
    [`${STRIKE_BASE_PATH}/scans/[^/]+/resume`]: {
        'POST': 'Resumed Strike scan'
    },
    [`${STRIKE_BASE_PATH}/scans/[^/]+/retry`]: {
        'POST': 'Retried Strike scan'
    }
};

