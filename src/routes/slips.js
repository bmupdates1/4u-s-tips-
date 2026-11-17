
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Automatically lock slips whose started countdown has expired.
// Uses the server's UTC time, not the customer's phone time.
async function lockExpiredSlips() {
  const now = new Date();

  await prisma.slip.updateMany({
    where: {
      isLocked: false,
      kickoffStartedAt: { not: null },
      kickoffAt: { lte: now }
    },
    data: {
      isLocked: true
    }
  });
}

const slipSchema = z.object({
  title: z.string().trim().min(1).max(100),
  riskLabel: z.string().trim().max(50).optional(),
  totalOdds: z.coerce.number().positive(),
  price: z.coerce.number().min(0).default(0),
  validityUntil: z.coerce.date().optional(),
  kickoffAt: z.coerce.date().optional(),
  category: z.enum(["FREE", "PREMIUM"]),
  bookingCodes: z.array(
    z.object({
      bookmaker: z.enum(["SportyBet", "BetPawa"]),
      code: z.string().trim().min(1).max(200)
    })
  ).min(1)
});

// PUBLISH BOOKING SLIP
router.post("/", async (req, res) => {
  if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Only Tipsters can publish booking codes"
    });
  }

  const parsed = slipSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid booking slip details",
      details: parsed.error.flatten()
    });
  }

  try {
    const data = parsed.data;

    const bookmakers = data.bookingCodes.map(x => x.bookmaker);

    if (new Set(bookmakers).size !== bookmakers.length) {
      return res.status(400).json({
        error: "Each bookmaker can only have one code per slip"
      });
    }

    const slip = await prisma.slip.create({
      data: {
        tipsterId: req.user.id,
        title: data.title,
        riskLabel: data.riskLabel,
        totalOdds: data.totalOdds,
        price: data.price,
        validityUntil: data.validityUntil,
        kickoffAt: data.kickoffAt,
        category: data.category,
        isPublished: true,
        isLocked: false,
        bookingCodes: {
          create: data.bookingCodes.map(item => ({
            bookmaker:
              item.bookmaker === "SportyBet"
                ? "SPORTYBET"
                : "BETPAWA",
            code: item.code
          }))
        }
      },
      include: {
        bookingCodes: true
      }
    });

    return res.status(201).json({
      message: "Betslip published successfully",
      slip
    });

  } catch (error) {
    console.error("Publish slip error:", error);

    return res.status(500).json({
      error: "Could not publish betslip"
    });
  }
});

// TIPSTER STARTS KICK-OFF COUNTDOWN
router.patch("/:id/start-kickoff", async (req, res) => {
  try {
    const slip = await prisma.slip.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!slip) {
      return res.status(404).json({
        error: "Betslip not found"
      });
    }

    if (slip.tipsterId !== req.user.id) {
      return res.status(403).json({
        error: "You can only start your own betslips"
      });
    }

    if (slip.isLocked) {
      return res.status(403).json({
        error: "This betslip is already locked"
      });
    }

    if (slip.kickoffStartedAt) {
      return res.status(409).json({
        error: "Kick-off countdown has already started"
      });
    }

    if (!slip.kickoffAt) {
      return res.status(400).json({
        error: "Please set the kick-off date and time first"
      });
    }

    const now = new Date();

    if (slip.kickoffAt <= now) {
      return res.status(400).json({
        error: "Kick-off time must be in the future"
      });
    }

    const updated = await prisma.slip.updateMany({
      where: {
        id: slip.id,
        tipsterId: req.user.id,
        kickoffStartedAt: null,
        isLocked: false,
        kickoffAt: { gt: now }
      },
      data: {
        kickoffStartedAt: now
      }
    });

    if (updated.count !== 1) {
      return res.status(409).json({
        error: "Could not start countdown. Please refresh and try again"
      });
    }

    const startedSlip = await prisma.slip.findUnique({
      where: {
        id: slip.id
      },
      include: {
        bookingCodes: true
      }
    });

    return res.json({
      message: "Kick-off countdown started successfully",
      slip: startedSlip,
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error("Start kickoff error:", error);

    return res.status(500).json({
      error: "Could not start kick-off countdown"
    });
  }
});

// TIPSTER VIEWS THEIR OWN SLIPS
router.get("/mine", async (req, res) => {
  try {
    await lockExpiredSlips();

    const slips = await prisma.slip.findMany({
      where: {
        tipsterId: req.user.id
      },
      include: {
        bookingCodes: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json({ slips });

  } catch (error) {
    console.error("Load own slips error:", error);

    return res.status(500).json({
      error: "Could not load your betslips"
    });
  }
});

// CUSTOMERS SEE FREE SLIPS ONLY
router.get("/", async (req, res) => {
  try {
    await lockExpiredSlips();

    const where = {
      isPublished: true
    };

    if (req.user.role === "CUSTOMER") {
      where.category = "FREE";
    }

    const slips = await prisma.slip.findMany({
      where,
      include: {
        tipster: {
          select: {
            id: true,
            username: true,
            profileImage: true
          }
        },
        bookingCodes: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json({ slips });

  } catch (error) {
    console.error("Load slips error:", error);

    return res.status(500).json({
      error: "Could not load betslips"
    });
  }
});

// VIEW ONE SLIP
router.get("/:id", async (req, res) => {
  try {
    await lockExpiredSlips();

    const slip = await prisma.slip.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        tipster: {
          select: {
            id: true,
            username: true,
            profileImage: true
          }
        },
        bookingCodes: true
      }
    });

    if (!slip || !slip.isPublished) {
      return res.status(404).json({
        error: "Betslip not found"
      });
    }

    if (
      req.user.role === "CUSTOMER" &&
      slip.category === "PREMIUM"
    ) {
      return res.status(403).json({
        error: "Payment required to view premium booking codes"
      });
    }

    return res.json({ slip });

  } catch (error) {
    console.error("View slip error:", error);

    return res.status(500).json({
      error: "Could not load betslip"
    });
  }
});

export default router;
