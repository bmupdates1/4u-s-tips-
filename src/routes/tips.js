import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  requireAuth,
  requireSuperAdmin
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  matchName: z.string().trim().min(3).max(200),
  prediction: z.string().trim().min(1).max(200),
  odds: z.number().positive().max(10000).optional(),
  category: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  kickoffAt: z.string().datetime().optional()
});

// GET TIPS
router.get("/", async (req, res) => {
  try {
    const where = req.user.role === "CUSTOMER"
      ? { category: "FREE" }
      : {};

    const tips = await prisma.tip.findMany({
      where,
      include: {
        tipster: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return res.json({ tips });
  } catch (error) {
    console.error("Fetch tips error:", error);
    return res.status(500).json({
      error: "Could not fetch tips"
    });
  }
});

// PUBLISH TIP
router.post("/", async (req, res) => {
  if (!["SUPER_ADMIN", "TIPSTER"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Only Admin and Tipsters can publish tips"
    });
  }

  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid tip details"
    });
  }

  try {
    const data = parsed.data;

    const tip = await prisma.tip.create({
      data: {
        tipsterId: req.user.id,
        matchName: data.matchName,
        prediction: data.prediction,
        odds: data.odds,
        category: data.category,
        kickoffAt: data.kickoffAt
          ? new Date(data.kickoffAt)
          : undefined
      },
      include: {
        tipster: {
          select: {
            username: true
          }
        }
      }
    });

    return res.status(201).json({
      message: "Tip published successfully",
      tip
    });
  } catch (error) {
    console.error("Publish tip error:", error);
    return res.status(500).json({
      error: "Could not publish tip"
    });
  }
});

// DELETE OWN TIP
router.delete("/:id", async (req, res) => {
  if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Only Tipsters and Admin can delete tips"
    });
  }

  try {
    const deleted = await prisma.tip.deleteMany({
      where: {
        id: req.params.id,
        tipsterId: req.user.id
      }
    });

    if (deleted.count !== 1) {
      return res.status(404).json({
        error: "Tip not found or you are not allowed to delete it"
      });
    }

    return res.json({
      message: "Tip deleted successfully"
    });
  } catch (error) {
    console.error("Delete tip error:", error);
    return res.status(500).json({
      error: "Could not delete tip"
    });
  }
});

// UPDATE TIP RESULT - SUPER ADMIN ONLY
router.patch("/:id/result", requireSuperAdmin, async (req, res) => {
  const schema = z.object({
    result: z.enum(["PENDING", "WON", "LOST", "VOID"])
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid result"
    });
  }

  try {
    const tip = await prisma.tip.update({
      where: {
        id: req.params.id
      },
      data: {
        result: parsed.data.result
      }
    });

    return res.json({
      message: "Tip result updated",
      tip
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        error: "Tip not found"
      });
    }

    console.error("Update result error:", error);
    return res.status(500).json({
      error: "Could not update tip result"
    });
  }
});

export default router;
