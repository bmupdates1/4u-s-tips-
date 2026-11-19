
import express from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// =====================================
// HELPER: CALCULATE TIPSTER STATISTICS
// =====================================

function calculateStats(tips = [], slips = []) {
  const allResults = [
    ...tips.map(item => item.result),
    ...slips.map(item => item.result)
  ];

  const wins = allResults.filter(r => r === "WON").length;
  const losses = allResults.filter(r => r === "LOST").length;

  const total = wins + losses;

  return {
    wins,
    losses,
    totalResults: total,
    accuracy: total > 0
      ? Number(((wins / total) * 100).toFixed(2))
      : 0
  };
}

// =====================================
// UPDATE PROFILE IMAGE
// =====================================

router.patch("/me/profile-image", requireAuth, async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Huruhusiwi kubadilisha picha."
      });
    }

    const image = req.body.profileImage || req.body.image;

    if (
      typeof image !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,/i.test(image)
    ) {
      return res.status(400).json({
        message: "Picha haikubaliki."
      });
    }

    if (Buffer.byteLength(image, "utf8") > 1.5 * 1024 * 1024) {
      return res.status(400).json({
        message: "Picha imezidi 1.5MB."
      });
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

    return res.json({
      message: "Picha imehifadhiwa.",
      user,
      tipster: user,
      profileImage: user.profileImage
    });

  } catch (error) {
    console.error("PROFILE IMAGE ERROR:", error);

    return res.status(500).json({
      message: "Imeshindikana kuhifadhi picha."
    });
  }
});

// =====================================
// GET ALL ACTIVE TIPSTERS
// =====================================

router.get("/", async (req, res) => {
  try {
    console.log("Loading active tipsters...");

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

      orderBy: {
        createdAt: "desc"
      }
    });

    const results = tipsters.map(tipster => {
      const stats = calculateStats(
        tipster.tips,
        tipster.slips
      );

      return {
        id: tipster.id,
        username: tipster.username,
        profileImage: tipster.profileImage,
        createdAt: tipster.createdAt,
        followersCount: tipster.followers.length,
        ...stats
      };
    });

    console.log("TIPSTERS FOUND:", results.length);

    return res.status(200).json(results);

  } catch (error) {
    console.error("GET TIPSTERS ERROR:", error);

    return res.status(500).json({
      message: "Imeshindikana kupata Tipsters.",
      error: process.env.NODE_ENV === "production"
        ? undefined
        : error.message
    });
  }
});

// =====================================
// GET SINGLE TIPSTER PROFILE
// =====================================

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
          orderBy: {
            createdAt: "desc"
          },
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

          orderBy: {
            createdAt: "desc"
          },

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
      return res.status(404).json({
        message: "Tipster hajapatikana."
      });
    }

    // CALCULATE ALL RESULTS
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

    const stats = calculateStats(
      tipResults,
      slipResults
    );

    // PREMIUM ACCESS
    const canViewPremium = [
      "TIPSTER",
      "SUPER_ADMIN"
    ].includes(req.user?.role);

    const tips = tipster.tips.map(tip => {
      if (!canViewPremium && tip.category === "PREMIUM") {
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
      if (!canViewPremium && slip.category === "PREMIUM") {
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

    return res.status(200).json({
      id: tipster.id,
      username: tipster.username,
      profileImage: tipster.profileImage,
      createdAt: tipster.createdAt,
      followersCount: tipster.followers.length,
      stats,
      tips,
      slips
    });

  } catch (error) {
    console.error("GET TIPSTER PROFILE ERROR:", error);

    return res.status(500).json({
      message: "Imeshindikana kupata profile ya Tipster."
    });
  }
});

export default router;
