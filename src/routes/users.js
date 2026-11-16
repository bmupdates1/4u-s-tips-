import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  requireSuperAdmin
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ users });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Could not fetch users"
    });
  }
});

router.patch("/:id/role", async (req, res) => {
  const schema = z.object({
    role: z.enum(["CUSTOMER", "TIPSTER"])
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid role" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role === "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Super Admin role cannot be changed"
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true
      }
    });

    return res.json({
      message: "User role updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Could not update user role"
    });
  }
});

export default router;
