const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Picha ya profile ya Tipster
router.patch("/me/profile-image", requireAuth, async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Huruhusiwi kubadilisha picha." });
    }

    const { image } = req.body;

    if (
      typeof image !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,/.test(image)
    ) {
      return res.status(400).json({ message: "Picha haikubaliki." });
    }

    const size = Buffer.byteLength(image, "utf8");

    if (size > 1.5 * 1024 * 1024) {
      return res.status(400).json({ message: "Picha imezidi 1.5MB." });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { profileImage: image },
      select: {
        id: true,
        username: true,
        profileImage: true
      }
    });

    res.json({
      message: "Picha imehifadhiwa.",
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Imeshindikana kuhifadhi picha." });
  }
});

// Orodha ya Tipsters pamoja na takwimu zao
router.get("/", async (req, res) => {
  try {
    const tipsters = await prisma.user.findMany({
      where: {
        role: "TIPSTER",
        status: "ACTIVE"
      },
      select: {
        id: true,
        username: true,
        profileImage: true,
        createdAt: true,
        followers: {
          select: { id: true }
        },
        tips: {
          select: { result: true }
        },
        slips: {
          select: { result: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const results = tipsters.map(tipster => {
      const allResults = [
        ...tipster.tips.map(item => item.result),
        ...tipster.slips.map(item => item.result)
      ];

      const wins = allResults.filter(result => result === "WON").length;
      const losses = allResults.filter(result => result === "LOST").length;
      const total = wins + losses;

      return {
        id: tipster.id,
        username: tipster.username,
        profileImage: tipster.profileImage,
        createdAt: tipster.createdAt,
        followersCount: tipster.followers.length,
        wins,
        losses,
        totalResults: total,
        accuracy: total > 0
          ? Number(((wins / total) * 100).toFixed(2))
          : 0
      };
    });

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Imeshindikana kupata Tipsters." });
  }
});

// Profile ya Tipster mmoja
router.get("/:id", async (req, res) => {
  try {
    const tipster = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        role: "TIPSTER",
        status: "ACTIVE"
      },
      select: {
        id: true,
        username: true,
        profileImage: true,
        createdAt: true,
        followers: {
          select: { id: true }
        },
        tips: {
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            matchName: true,
            prediction: true,
            odds: true,
            category: true,
            result: true,
            kickoffAt: true,
            validityUntil: true,
            createdAt: true
          }
        },
        slips: {
          where: {
            isPublished: true,
            isLocked: false,
            OR: [
              { kickoffAt: null },
              { kickoffAt: { gt: new Date() } }
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            title: true,
            riskLabel: true,
            totalOdds: true,
            price: true,
            category: true,
            result: true,
            validityUntil: true,
            kickoffAt: true,
            kickoffStartedAt: true,
            createdAt: true,
            bookingCodes: {
              select: {
                id: true,
                bookmaker: true,
                code: true
              }
            }
          }
        }
      }
    });

    if (!tipster) {
      return res.status(404).json({ message: "Tipster hajapatikana." });
    }

    // Takwimu zinahesabu tips na slips zote,
    // bila kujali kama zimefichwa kwenye ukurasa wa profile.
    const [tipResults, slipResults] = await Promise.all([
      prisma.tip.findMany({
        where: { tipsterId: tipster.id },
        select: { result: true }
      }),
      prisma.slip.findMany({
        where: { tipsterId: tipster.id },
        select: { result: true }
      })
    ]);

    const allResults = [
      ...tipResults.map(item => item.result),
      ...slipResults.map(item => item.result)
    ];

    const wins = allResults.filter(result => result === "WON").length;
    const losses = allResults.filter(result => result === "LOST").length;
    const total = wins + losses;

    const isCustomer = req.user.role === "CUSTOMER";

    const tips = tipster.tips.map(tip => {
      if (isCustomer && tip.category === "PREMIUM") {
        return {
          ...tip,
          prediction: null,
          odds: null,
          result: null,
          isLocked: true
        };
      }

      return {
        ...tip,
        isLocked: false
      };
    });

    const slips = tipster.slips.map(slip => {
      if (isCustomer && slip.category === "PREMIUM") {
        return {
          ...slip,
          bookingCodes: [],
          isLocked: true
        };
      }

      return {
        ...slip,
        isLocked: false
      };
    });

    res.json({
      id: tipster.id,
      username: tipster.username,
      profileImage: tipster.profileImage,
      createdAt: tipster.createdAt,
      followersCount: tipster.followers.length,
      stats: {
        wins,
        losses,
        totalResults: total,
        accuracy: total > 0
          ? Number(((wins / total) * 100).toFixed(2))
          : 0
      },
      tips,
      slips
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Imeshindikana kupata profile ya Tipster."
    });
  }
});

module.exports = router;
