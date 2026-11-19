
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import {
  requireAuth,
  requireSuperAdmin
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

// GET ALL USERS
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

// CHANGE USER ROLE
router.patch("/:id/role", async (req, res) => {
  const schema = z.object({
    role: z.enum(["CUSTOMER", "TIPSTER"])
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid role"
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
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
        role: true,
        isActive: true
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

// ACTIVATE / DEACTIVATE USER
router.patch("/:id/status", async (req, res) => {
  const schema = z.object({
    isActive: z.boolean()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "isActive must be true or false"
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (user.role === "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Super Admin account cannot be suspended here"
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isActive: parsed.data.isActive
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    return res.json({
      message: parsed.data.isActive
        ? "User account activated successfully"
        : "User account suspended successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Could not update user status"
    });
  }
});

// RESET USER PASSWORD
router.patch("/:id/password", async (req, res) => {
  const schema = z.object({
    newPassword: z.string().min(12).max(128)
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Password must contain at least 12 characters"
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (user.role === "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Cannot reset Super Admin password here"
      });
    }

    const passwordHash = await bcrypt.hash(
      parsed.data.newPassword,
      12
    );

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash }
    });

    return res.json({
      message: "Password reset successfully"
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Could not reset password"
    });
  }
});

export default router;
