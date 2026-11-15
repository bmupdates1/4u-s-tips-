import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

const password = process.env.ADMIN_PASSWORD;

if (!password || password.length < 12) {
  throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
}

try {
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.update({
    where: { username: "bm_updates" },
    data: { passwordHash }
  });

  console.log(`Password updated for ${admin.username}`);
} finally {
  await prisma.$disconnect();
}
