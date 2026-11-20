
import express from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

const dateTimeSchema = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return value;
  let normalized = value.trim();

  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    normalized += "+03:00";
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}, z.string().datetime());

const slipSchema = z.object({
  title: z.string().trim().min(2).max(200),
  riskLabel: z.string().max(100).optional().nullable(),
  totalOdds: z.coerce.number().positive().max(100000),
  price: z.coerce.number().min(0).default(0),
  category: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  validityUntil: dateTimeSchema,
  bookingCodes: z.array(z.object({
    bookmaker: z.enum(["SPORTYBET", "BETPAWA"]),
    code: z.string().trim().min(1).max(200)
  })).min(1)
});

const resultSchema = z.object({
  result: z.enum(["WON", "LOST"])
});

// PUBLISH: KICK-OFF INAANZA MOJA KWA MOJA
router.post("/", async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Huruhusiwi kuchapisha booking slip." });
    }

    const data = slipSchema.parse(req.body);
    const now = new Date();
    const validityUntil = new Date(data.validityUntil);

    if (validityUntil <= now) {
      return res.status(400).json({
        message: "Expiry lazima iwe muda wa baadaye."
      });
    }

    const bookmakers = data.bookingCodes.map(x => x.bookmaker);
    if (new Set(bookmakers).size !== bookmakers.length) {
      return res.status(400).json({
        message: "Bookmaker mmoja amewekwa zaidi ya mara moja."
      });
    }

    const slip = await prisma.slip.create({
      data: {
        tipsterId: req.user.id,
        title: data.title,
        riskLabel: data.riskLabel || null,
        totalOdds: data.totalOdds,
        price: data.price,
        category: data.category,
        validityUntil,
        kickoffAt: now,
        kickoffStartedAt: now,
        isPublished: true,
        isLocked: false,
        result: "PENDING",
        bookingCodes: {
          create: data.bookingCodes
        }
      },
      include: {
        bookingCodes: true
      }
    });

    return res.status(201).json(slip);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Taarifa za slip hazijakamilika au si sahihi.",
        errors: error.issues || error.errors
      });
    }

    console.error("CREATE SLIP ERROR:", error);
    return res.status(500).json({
      message: "Imeshindikana kuchapisha slip."
    });
  }
});

// SLIPS ZA TIPSTER
router.get("/mine", async (req, res) => {
  try {
    const slips = await prisma.slip.findMany({
      where: { tipsterId: req.user.id },
      include: { bookingCodes: true },
      orderBy: { createdAt: "desc" }
    });

    return res.json(slips);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Imeshindikana kupata slips zako." });
  }
});

// SLIPS ZA WATEJA
router.get("/", async (req, res) => {
  try {
    const slips = await prisma.slip.findMany({
      where: { isPublished: true },
      include: {
        tipster: {
          select: { id: true, username: true }
        },
        bookingCodes: true
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const results = slips.map(slip => {
      const customer = req.user.role === "CUSTOMER";
      const premium = slip.category === "PREMIUM";

      return {
        ...slip,
        isLocked: customer && premium,
        bookingCodes: customer && premium ? [] : slip.bookingCodes
      };
    });

    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Imeshindikana kupata slips." });
  }
});

// SLIP MOJA
router.get("/:id", async (req, res) => {
  try {
    const slip = await prisma.slip.findFirst({
      where: {
        id: req.params.id,
        isPublished: true
      },
      include: {
        tipster: {
          select: { id: true, username: true }
        },
        bookingCodes: true
      }
    });

    if (!slip) {
      return res.status(404).json({ message: "Slip haijapatikana." });
    }

    if (req.user.role === "CUSTOMER" && slip.category === "PREMIUM") {
      return res.status(403).json({
        message: "Slip hii ni PREMIUM. Unahitaji access kuiona."
      });
    }

    return res.json(slip);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Imeshindikana kupata slip." });
  }
});

// KICK-OFF HUANZA WAKATI WA PUBLISH
router.patch("/:id/start-kickoff", async (req, res) => {
  return res.status(400).json({
    message: "Kick-Off tayari huanza moja kwa moja wakati wa kuchapisha slip."
  });
});

// MATOKEO BAADA YA EXPIRY PEKEE
router.patch("/:id/result", async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({ message: "Huruhusiwi kuweka matokeo." });
    }

    const { result } = resultSchema.parse(req.body);
    const now = new Date();

    const updated = await prisma.slip.updateMany({
      where: {
        id: req.params.id,
        ...(req.user.role === "SUPER_ADMIN" ? {} : { tipsterId: req.user.id }),
        result: "PENDING",
        validityUntil: {
          not: null,
          lte: now
        }
      },
      data: { result }
    });

    if (updated.count === 0) {
      const slip = await prisma.slip.findUnique({
        where: { id: req.params.id }
      });

      if (!slip) {
        return res.status(404).json({ message: "Slip haijapatikana." });
      }

      if (req.user.role !== "SUPER_ADMIN" && slip.tipsterId !== req.user.id) {
        return res.status(403).json({ message: "Hii si slip yako." });
      }

      if (slip.result !== "PENDING") {
        return res.status(400).json({ message: "Matokeo tayari yamewekwa." });
      }

      if (!slip.validityUntil || new Date(slip.validityUntil) > now) {
        return res.status(400).json({
          message: "Subiri muda wa mkeka kuisha kabla ya kuweka matokeo."
        });
      }

      return res.status(400).json({
        message: "Imeshindikana kuhifadhi matokeo."
      });
    }

    const updatedSlip = await prisma.slip.findUnique({
      where: { id: req.params.id },
      include: { bookingCodes: true }
    });

    return res.json({
      message: "Matokeo ya slip yamehifadhiwa.",
      slip: updatedSlip
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Chagua WON au LOST pekee.",
        errors: error.issues || error.errors
      });
    }

    console.error(error);
    return res.status(500).json({
      message: "Imeshindikana kuhifadhi matokeo."
    });
  }
});

// KUFUTA SLIP
router.delete("/:id", async (req, res) => {
  try {
    const slip = await prisma.slip.findUnique({
      where: { id: req.params.id }
    });

    if (!slip) {
      return res.status(404).json({ message: "Slip haijapatikana." });
    }

    if (req.user.role !== "SUPER_ADMIN" && slip.tipsterId !== req.user.id) {
      return res.status(403).json({ message: "Hii si slip yako." });
    }

    await prisma.$transaction([
      prisma.bookingCode.deleteMany({
        where: { slipId: slip.id }
      }),
      prisma.slip.delete({
        where: { id: slip.id }
      })
    ]);

    return res.json({ message: "Slip imefutwa." });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Imeshindikana kufuta slip."
    });
  }
});

export default router;
