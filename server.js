const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/authRoutes");
const keyRoutes = require("./routes/keyRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api", keyRoutes);
app.use("/api", userRoutes);

// Phục vụ các file giao diện Web Admin
app.get(["/", "/admin", "/admin.html"], (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/admin.css", (req, res) => {
  res.type("text/css").sendFile(path.join(publicDir, "admin.css"));
});

app.get("/admin.js", (req, res) => {
  res.type("application/javascript").sendFile(path.join(publicDir, "admin.js"));
});

app.get("/avatar.jpg", (req, res) => {
  const imgPath = path.join(publicDir, "avatar.jpg");
  if (fs.existsSync(imgPath)) {
    return res.type("image/jpeg").sendFile(imgPath);
  }
  res.status(404).end();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FF Server Key running on http://localhost:${PORT}`);
  });
}

module.exports = app;
