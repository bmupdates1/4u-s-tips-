
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Follow a tipster
router.post("/:tipsterId", async (req, res) => {
  try {
    const { tipsterId } = req.params;

    if (req.user.id === tipsterId) {
      return res.status(400).json({
        error: "You cannot follow yourself"
      });
    }

    const tipster = await prisma.user.findFirst({
      where: {
        id: tipsterId,
        role: "TIPSTER",
        isActive: true
      }
    });

    if (!tipster) {
      return res.status(404).json({
        error: "Tipster not found"
      });
    }

    await prisma.follow.create({
      data: {
        followerId: req.user.id,
        tipsterId
      }
    });

    res.status(201).json({
      message: "You are now following this tipster"
    });

  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "You already follow this tipster"
      });
    }

    res.status(500).json({
      error: "Could not follow tipster"
    });
  }
});

// Unfollow a tipster
router.delete("/:tipsterId", async (req, res) => {
  try {
    const { tipsterId } = req.params;

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_tipsterId: {
          followerId: req.user.id,
          tipsterId
        }
      }
    });

    if (!follow) {
      return res.status(404).json({
        error: "You are not following this tipster"
      });
    }

    await prisma.follow.delete({
      where: {
        id: follow.id
      }
    });

    res.json({
      message: "You have unfollowed this tipster"
    });

  } catch {
    res.status(500).json({
      error: "Could not unfollow tipster"
    });
  }
});

export default router;
