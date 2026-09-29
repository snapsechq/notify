const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    id: String
}, { _id: false });



const activitySchema = new mongoose.Schema({
    orgId: { type: String, required: true },
    action: { type: String, required: true },
    origin: { type: String, required: true },
    user: { type: userSchema },
    raw: mongoose.Schema.Types.Mixed,
    resourceMeta: mongoose.Schema.Types.Mixed,
}, { timestamps: true, strict: false });


activitySchema.index({ orgId: 1, createdAt: -1 });


module.exports = mongoose.model("activity", activitySchema);