const Activity = require("../models/activity.model");

const aimMap = require('./activity-maps/aim');
const apiSecMap = require('./activity-maps/apisec');
const asmMap = require('./activity-maps/asm');
const authMap = require('./activity-maps/auth');
const opMap = require('./activity-maps/op');
const riskRegisterMap = require('./activity-maps/riskRegister');
const tmMap = require('./activity-maps/tm');
const utilMap = require('./activity-maps/util');
const vmMap = require('./activity-maps/vm');
const vsMap = require('./activity-maps/vs');

// endpoint to activity map
const endpointWithMethodActionMap = {
    // handle all paths here
    '^(?!.*auth).*': {
        'GET': "Viewed page",
        'POST': "Performed an action",
        'PUT': "Performed an action",
        'DELETE': "Performed an action",
        'PATCH': "Performed an action",
    },

    ...aimMap,
    ...apiSecMap,
    ...asmMap,
    ...authMap,
    ...opMap,
    ...riskRegisterMap,
    ...tmMap,
    ...utilMap,
    ...vmMap,
    ...vsMap,
}


const parseActivity = (endpoint, method) => {

    // get all regex keys
    let keys = Object.keys(endpointWithMethodActionMap);

    // find the key that matches the endpoint and use it to find the activity.
    let matchingKey = keys.filter(key => {
        let match = endpoint.match(`^${key}$`);

        if (match && match?.length) {
            return true;
        }

        return false;
    });


    const activity = endpointWithMethodActionMap?.[matchingKey]?.[method];

    return activity;

}


const createActivity = async (orgId, activity) => {
    try {
        const created = await Activity.create({ orgId, ...activity });

        return created;
    }
    catch (error) {
        console.log(error);
        return { status: "failed", message: "failed to create activity" };
    }
}


const getAllActivity = async (orgId, filter = {}, page = 1, limit = 10, sortBy = 'createdAt', sortAs = "desc") => {
    try {
        const activity = await Activity.find({ orgId, ...filter }).sort({ [sortBy]: sortAs == 'desc' ? -1 : 1 }).skip((page - 1) * limit).limit(limit);
        const total = await Activity.countDocuments({ orgId, ...filter });


        const distinctActionTypes = await Activity.distinct('resourceMeta.actionType', { orgId: orgId });

        // Construct advanced filters
        const advanced_filters = [];

        // 1. Product Filter
        advanced_filters.push({
            name: "Origin",
            key: "origin",
            description: "Filter activity by product",
            filters: [
                { label: "ASM", value: "asm" },
                { label: "VM", value: "vm" },
                { label: "AIM", value: "aim" },
                { label: "VS", value: "vs" },
                { label: "WAS", value: "was" },
            ]
        });

        // 2. User Name Filter
        const distinctUsers = await Activity.aggregate([
            { $match: { orgId: orgId, "user.email": { $exists: true, $ne: null } } },
            { $group: { _id: "$user.email", name: { $first: "$user.name" } } }
        ]);

        const nameFilters = distinctUsers
            .map(u => {
                const name = (u.name || "").trim();
                return {
                    label: name || u._id,
                    value: u._id
                };
            })
            .filter(item => item.value)
            .sort((a, b) => a.label.localeCompare(b.label));

        advanced_filters.push({
            name: "User Name",
            key: "email",
            description: "Filter activity by user name",
            filters: nameFilters
        });

        // 3. Action Type Filter
        const actionTypeFilters = distinctActionTypes
            .filter(Boolean)
            .sort()
            .map(actionType => ({ label: actionType, value: actionType }));
        advanced_filters.push({
            name: "Action Type",
            key: "actionType",
            description: "Filter activity by action type",
            filters: actionTypeFilters
        });

        // 4. Method Filter
        advanced_filters.push({
            name: "Method",
            key: "method",
            description: "Filter activity by HTTP method",
            filters: [
                { label: "GET", value: "GET" },
                { label: "POST", value: "POST" },
                { label: "PUT", value: "PUT" },
                { label: "DELETE", value: "DELETE" },
                { label: "PATCH", value: "PATCH" },
                { label: "HEAD", value: "HEAD" },
                { label: "OPTIONS", value: "OPTIONS" },
            ]
        });

        return { activity, total, advanced_filters };
    }
    catch (err) {
        console.log(err);
        return { status: 'failed', message: "failed to fetch activity" };
    }
}

const queryActivity = async (filter = {}, page = 1, limit = 10, sortBy = 'createdAt', sortAs = "desc") => {
    try {
        const activity = await Activity.find(filter).sort({ [sortBy]: sortAs == 'desc' ? -1 : 1 }).skip((page - 1) * limit).limit(limit);
        const total = await Activity.countDocuments(filter);

        return { activity, total };
    }
    catch (err) {
        console.log(err);
        return { status: 'failed', message: "failed to query activity" };
    }
}



module.exports = {
    parseActivity,
    createActivity,
    getAllActivity,
    queryActivity
}