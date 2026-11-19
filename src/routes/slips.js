
const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

// Kuficha slips ambazo kickoff imefika.
// isLocked inabaki kwa ajili ya Premium access pekee.
async function lockExpiredSlips() {
  await prisma.slip.updateMany({
    where: {
      isPublished: true,
      kickoffAt: { lte: new Date() }
    },
    data: {
      isPublished: false
    }
  });
}

const slipSchema = z.object({
  title: z.string().trim().min(2).max(200),
  riskLabel: z.string().max(100).optional().nullable(),
  totalOdds: z.coerce.number().positive().max(100000),
  price: z.coerce.number().min(0).default(0),
  category: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  validityUntil: z.string().datetime(),
  kickoffAt: z.string().datetime(),
  bookingCodes: z.array(
    z.object({
      bookmaker: z.enum(["SPORTYBET", "BETPAWA"]),
      code: z.string().trim().min(1).max(200)
    })
  ).min(1)
});

const resultSchema = z.object({
  result: z.enum(["WON", "LOST"])
});

// KUCHAPISHA BOOKING SLIP
router.post("/", async (req, res) => {
  try {
    if (!["TIPSTER", "SUPER_ADMIN"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Huruhusiwi kuchapisha booking slip."
      });
    }

    const data = slipSchema.parse(req.body);
    const now = new Date();
    const validityUntil = new Date(data.validityUntil);
    const kickoffAt = new Date(data.kickoffAt);

    if (
      Number.isNaN(validityUntil.getTime()) ||
      validityUntil <= now
    ) {
      return res.status(400).json({
        message: "Muda wa mwisho lazima uwe mbele ya muda wa sasa."
      });
    }

    if (
      Number.isNaN(kickoffAt.getTime()) ||
      kickoffAt <= now
    ) {
      return res.status(400).json({
        message: "Kickoff lazima uwe mbele ya muda wa sasa."
      });
    }

    if (validityUntil > kickoffAt) {
      return res.status(400).json({
        message: "Muda wa mwisho wa slip hauwezi kuzidi kickoff."
      });
    }

    const bookmakers = data.bookingCodes.map(
      item => item.bookmaker
    );

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
        kickoffAt,
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

    res.status(201).json(slip);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Taarifa za slip hazijakamilika au si sahihi.",
        errors: error.errors
      });
    }

    console.error("CREATE SLIP ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kuchapisha slip."
    });
  }
});

// SLIPS ZA TIPSTER ALIYEINGIA
router.get("/mine", async (req, res) => {
  try {
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

    res.json(slips);
  } catch (error) {
    console.error("GET MY SLIPS ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kupata slips zako."
    });
  }
});

// SLIPS ZOTE ZINAZOONEKANA KWA WATEJA
router.get("/", async (req, res) => {
  try {
    await lockExpiredSlips();

    const slips = await prisma.slip.findMany({
      where: {
        isPublished: true,
        isLocked: false
      },
      include: {
        tipster: {
          select: {
            id: true,
            username: true
          }
        },
        bookingCodes: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    const results = slips.map(slip => {
      const isCustomer = req.user.role === "CUSTOMER";
      const isPremium = slip.category === "PREMIUM";

      return {
        ...slip,
        isLocked: isCustomer && isPremium,
        bookingCodes:
          isCustomer && isPremium
            ? []
            : slip.bookingCodes
      };
    });

    res.json(results);
  } catch (error) {
    console.error("GET SLIPS ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kupata slips."
    });
  }
});

// KUPATA SLIP MOJA
router.get("/:id", async (req, res) => {
  try {
    await lockExpiredSlips();

    const slip = await prisma.slip.findFirst({
      where: {
        id: req.params.id,
        isPublished: true,
        isLocked: false
      },
      include: {
        tipster: {
          select: {
            id: true,
            username: true
          }
        },
        bookingCodes: true
      }
    });

    if (!slip) {
      return res.status(404).json({
        message: "Slip haijapatikana."
      });
    }

    if (
      req.user.role === "CUSTOMER" &&
      slip.category === "PREMIUM"
    ) {
      return res.status(403).json({
        message: "Slip hii ni PREMIUM. Unahitaji access kuiona."
      });
    }

    res.json(slip);
  } catch (error) {
    console.error("GET SINGLE SLIP ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kupata slip."
    });
  }
});

// KUANZA KICKOFF
router.patch("/:id/start-kickoff", async (req, res) => {
  try {
    const slip = await prisma.slip.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!slip) {
      return res.status(404).json({
        message: "Slip haijapatikana."
      });
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      slip.tipsterId !== req.user.id
    ) {
      return res.status(403).json({
        message: "Hii si slip yako."
      });
    }

    if (slip.kickoffStartedAt) {
      return res.status(400).json({
        message: "Kickoff tayari imeanzishwa."
      });
    }

    if (!slip.kickoffAt || new Date(slip.kickoffAt) <= new Date()) {
      return res.status(400).json({
        message: "Kickoff time imefika au imepita."
      });
    }

    const updated = await prisma.slip.update({
      where: {
        id: slip.id
      },
      data: {
        kickoffStartedAt: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("START KICKOFF ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kuanzisha kickoff."
    });
  }
});

// KUWEKA MATOKEO BAADA YA EXPIRY
router.patch("/:id/result", async (req, res) => {
  try {
    if (req.user.role !== "TIPSTER") {
      return res.status(403).json({
        message: "Tipster pekee ndiye anayeruhusiwa kuweka matokeo."
      });
    }

    const { result } = resultSchema.parse(req.body);
    const now = new Date();

    // Matokeo yanawekwa mara moja tu baada ya expiry.
    const updated = await prisma.slip.updateMany({
      where: {
        id: req.params.id,
        tipsterId: req.user.id,
        result: "PENDING",
        validityUntil: {
          not: null,
          lte: now
        }
      },
      data: {
        result
      }
    });

    if (updated.count === 0) {
      const slip = await prisma.slip.findUnique({
        where: {
          id: req.params.id
        }
      });

      if (!slip) {
        return res.status(404).json({
          message: "Slip haijapatikana."
        });
      }

      if (slip.tipsterId !== req.user.id) {
        return res.status(403).json({
          message: "Hii si slip yako."
        });
      }

      if (slip.result !== "PENDING") {
        return res.status(400).json({
          message: "Matokeo tayari yamewekwa na hayawezi kubadilishwa."
        });
      }

      if (
        !slip.validityUntil ||
        new Date(slip.validityUntil) > now
      ) {
        return res.status(400).json({
          message: "Huwezi kuweka matokeo kabla muda wa slip kuisha."
        });
      }

      return res.status(400).json({
        message: "Imeshindikana kuhifadhi matokeo. Jaribu tena."
      });
    }

    const updatedSlip = await prisma.slip.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        bookingCodes: true
      }
    });

    res.json({
      message: "Matokeo ya slip yamehifadhiwa.",
      slip: updatedSlip
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Chagua WON au LOST pekee."
      });
    }

    console.error("SLIP RESULT ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kuhifadhi matokeo."
    });
  }
});

// KUFUTA SLIP
router.delete("/:id", async (req, res) => {
  try {
    const slip = await prisma.slip.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!slip) {
      return res.status(404).json({
        message: "Slip haijapatikana."
      });
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      slip.tipsterId !== req.user.id
    ) {
      return res.status(403).json({
        message: "Hii si slip yako."
      });
    }

    await prisma.$transaction([
      prisma.bookingCode.deleteMany({
        where: {
          slipId: slip.id
        }
      }),
      prisma.slip.delete({
        where: {
          id: slip.id
        }
      })
    ]);

    res.json({
      message: "Slip imefutwa."
    });
  } catch (error) {
    console.error("DELETE SLIP ERROR:", error);
    res.status(500).json({
      message: "Imeshindikana kufuta slip."
    });
  }
});

module.exports = router;
