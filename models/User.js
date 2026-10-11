const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password_hash: { type: String, required: true },
    role: {
      type: String,
      enum: ["super_admin", "admin", "reseller"],
      default: "reseller",
    },
    credits: { type: Number, default: 100 },
    is_active: { type: Number, default: 1 },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false }
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
