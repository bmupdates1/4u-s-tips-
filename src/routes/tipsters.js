
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// List all approved tipsters and leaderboard statistics
router.get("/", async (req, res) => {
  try {
    const tipsters = await prisma.user.findMany({
      where: {
        role: "TIPSTER",
        isActive: true
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: {
          select: {
            followers: true
          }
        },
        tips: {
          select: {
            result: true
          }
        }
      }
    });

    const following = await prisma.follow.findMany({
      where: {
        followerId: req.user.id
      },
      select: {
        tipsterId: true
      }
    });

    const followingIds = new Set(
      following.map(item => item.tipsterId)
    );

    const results = tipsters.map(tipster => {
      const wins = tipster.tips.filter(
        tip => tip.result === "WON"
      ).length;

      const losses = tipster.tips.filter(
        tip => tip.result === "LOST"
      ).length;

      const pending = tipster.tips.filter(
        tip => tip.result === "PENDING"
      ).length;

      const voidTips = tipster.tips.filter(
        tip => tip.result === "VOID"
      ).length;

      const decidedTips = wins + losses;

      const accuracy = decidedTips > 0
        ? Number(((wins / decidedTips) * 100).toFixed(2))
        : 0;

      return {
        id: tipster.id,
        username: tipster.username,
        followers: tipster._count.followers,
        wins,
        losses,
        pending,
        voidTips,
        accuracy,
        isFollowing: followingIds.has(tipster.id)
      };
    });

    results.sort((a, b) =>
      b.followers - a.followers ||
      b.accuracy - a.accuracy ||
      b.wins - a.wins
    );

    res.json({
      tipsters: results
    });

  } catch {
    res.status(500).json({
      error: "Could not load tipsters"
    });
  }
});

// View one tipster profile
router.get("/:id", async (req, res) => {
  try {
    const tipster = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        role: "TIPSTER",
        isActive: true
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: {
          select: {
            followers: true
          }
        },
        tips: {
          select: {
            result: true
          }
        }
      }
    });

    if (!tipster) {
      return res.status(404).json({
        error: "Tipster not found"
      });
    }

    const wins = tipster.tips.filter(
      tip => tip.result === "WON"
    ).length;

    const losses = tipster.tips.filter(
      tip => tip.result === "LOST"
    ).length;

    const decidedTips = wins + losses;

    const accuracy = decidedTips > 0
      ? Number(((wins / decidedTips) * 100).toFixed(2))
      : 0;

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_tipsterId: {
          followerId: req.user.id,
          tipsterId: tipster.id
        }
      }
    });

    res.json({
      tipster: {
        id: tipster.id,
        username: tipster.username,
        followers: tipster._count.followers,
        wins,
        losses,
        accuracy,
        isFollowing: Boolean(follow)
      }
    });

  } catch {
    res.status(500).json({
      error: "Could not load tipster profile"
    });
  }
});

export default router;
