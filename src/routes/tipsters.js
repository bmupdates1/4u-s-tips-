
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// UPDATE OWN PROFILE PICTURE
router.patch("/me/profile-image", async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Tipster account required"
      });
    }

    const profileImage = req.body?.profileImage;

    const validImage =
      typeof profileImage === "string" &&
      profileImage.length <= 1500000 &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profileImage);

    if (!validImage) {
      return res.status(400).json({
        error: "Chagua picha ya JPG, PNG au WEBP."
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { profileImage },
      select: {
        id: true,
        profileImage: true
      }
    });

    return res.json({
      message: "Profile picture imehifadhiwa kikamilifu.",
      profileImage: user.profileImage
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Imeshindikana kuhifadhi profile picture."
    });
  }
});

// GET ALL TIPSTERS
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
        profileImage: true,
        _count: {
          select: { followers: true }
        },
        tips: {
          select: { result: true }
        }
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
      const wins = tipster.tips.filter(
        t => t.result === "WON"
      ).length;

      const losses = tipster.tips.filter(
        t => t.result === "LOST"
      ).length;

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

    return res.status(500).json({
      error: "Could not load tipsters"
    });
  }
});

// GET SINGLE TIPSTER PROFILE
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
        _count: {
          select: { followers: true }
        },
        tips: {
          orderBy: {
            createdAt: "desc"
          },
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
      return res.status(404).json({
        error: "Tipster not found"
      });
    }

    const allResults = await prisma.tip.findMany({
      where: {
        tipsterId: tipster.id
      },
      select: {
        result: true
      }
    });

    const wins = allResults.filter(
      t => t.result === "WON"
    ).length;

    const losses = allResults.filter(
      t => t.result === "LOST"
    ).length;

    const decided = wins + losses;

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_tipsterId: {
          followerId: req.user.id,
          tipsterId: tipster.id
        }
      }
    });

    const isCustomer = req.user.role === "CUSTOMER";

    const visibleTips = tipster.tips.map(tip => {
      if (isCustomer && tip.category === "PREMIUM") {
        return {
          id: tip.id,
          matchName: tip.matchName,
          prediction: null,
          odds: null,
          category: tip.category,
          result: null,
          kickoffAt: tip.kickoffAt,
          createdAt: tip.createdAt,
          isLocked: true
        };
      }

      return {
        ...tip,
        isLocked: false
      };
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
        tips: visibleTips
      }
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not load tipster profile"
    });
  }
});

export default router;
