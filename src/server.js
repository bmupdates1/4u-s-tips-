
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

import authRoutes from "./routes/auth.js";
import tipsRoutes from "./routes/tips.js";
import followsRoutes from "./routes/follows.js";
import tipstersRoutes from "./routes/tipsters.js";
import usersRoutes from "./routes/users.js";
import footballRoutes from "./routes/football.js";
import slipsRoutes from "./routes/slips.js";

if (
  !process.env.DATABASE_URL ||
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    "Set DATABASE_URL and a JWT_SECRET of at least 32 characters."
  );
}

async function ensureSuperAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!username && !email && !password) {
    console.log("Admin credentials not configured. Skipping admin creation.");
    return;
  }

  if (
    !username ||
    username.length < 3 ||
    !email ||
    !email.includes("@") ||
    !password ||
    password.length < 12
  ) {
    throw new Error("Admin environment variables are incomplete or invalid.");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" }
  });

  if (existingAdmin) {
    console.log("Super Admin already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: "SUPER_ADMIN"
    }
  });

  console.log("Super Admin created successfully.");
}

await ensureSuperAdmin();

const app = express();

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",") || false
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.static("src/public"));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200
}));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "4U'S TIPS API"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/tips", tipsRoutes);
app.use("/api/follows", followsRoutes);
app.use("/api/tipsters", tipstersRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/football", footballRoutes);
app.use("/api/slips", slipsRoutes);

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`4U'S TIPS API running on port ${port}`);
});
