const mongoose = require("mongoose");

const KeySchema = new mongoose.Schema(
  {
    key_code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    prefix: { type: String, default: "NGBAO-" },
    duration_hours: { type: Number, required: true, default: 24 },
    duration_label: { type: String, required: true, default: "1 Ngày" },
    status: {
      type: String,
      enum: ["available", "active", "expired", "banned"],
      default: "available",
    },
    device_name: { type: String, default: "" },
    hwid: { type: String, default: "" },
    os_version: { type: String, default: "Android 14" },
    note: { type: String, default: "" },
    created_by: { type: String, default: "admin" },
    created_at: { type: String, default: () => new Date().toISOString() },
    activated_at: { type: String, default: "" },
    expires_at: { type: String, default: "" },
  },
  { versionKey: false }
);

module.exports = mongoose.models.Key || mongoose.model("Key", KeySchema);
