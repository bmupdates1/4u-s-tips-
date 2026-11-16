
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const tipsters = await prisma.user.findMany({
      where: { role: "TIPSTER", isActive: true },
      select: {
        id: true,
        username: true,
        profileImage: true,
        _count: { select: { followers: true } },
        tips: { select: { result: true } }
      }
    });

    const following = await prisma.follow.findMany({
      where: { followerId: req.user.id },
      select: { tipsterId: true }
    });

    const followingIds = new Set(
      following.map(item => item.tipsterId)
    );

    const results = tipsters.map(tipster => {
      const wins = tipster.tips.filter(t => t.result === "WON").length;
      const losses = tipster.tips.filter(t => t.result === "LOST").length;
      const decided = wins + losses;

      return {
        id: tipster.id,
        username: tipster.username,
        profileImage: tipster.profileImage,
        followers: tipster._count.followers,
        wins,
        losses,
        accuracy: decided > 0
          ? Number(((wins / decided) * 100).toFixed(2))
          : 0,
        isFollowing: followingIds.has(tipster.id)
      };
    });

    results.sort((a, b) =>
      b.accuracy - a.accuracy ||
      b.wins - a.wins ||
      b.followers - a.followers
    );

    return res.json({ tipsters: results });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not load tipsters" });
  }
});

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
        profileImage: true,
        _count: { select: { followers: true } },
        tips: {
          where: req.user.role === "CUSTOMER"
            ? { category: "FREE" }
            : {},
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            matchName: true,
            prediction: true,
            odds: true,
            category: true,
            result: true,
            kickoffAt: true,
            createdAt: true
          }
        }
      }
    });

    if (!tipster) {
      return res.status(404).json({ error: "Tipster not found" });
    }

    const allResults = await prisma.tip.findMany({
      where: { tipsterId: tipster.id },
      select: { result: true }
    });

    const wins = allResults.filter(t => t.result === "WON").length;
    const losses = allResults.filter(t => t.result === "LOST").length;
    const decided = wins + losses;

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_tipsterId: {
          followerId: req.user.id,
          tipsterId: tipster.id
        }
      }
    });

    return res.json({
      tipster: {
        id: tipster.id,
        username: tipster.username,
        profileImage: tipster.profileImage,
        followers: tipster._count.followers,
        wins,
        losses,
        accuracy: decided > 0
          ? Number(((wins / decided) * 100).toFixed(2))
          : 0,
        isFollowing: Boolean(follow),
        tips: tipster.tips
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not load tipster profile" });
  }
});

export default router;
