const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

const createSchema = z.object({
  matchName: z.string().min(3).max(200),
  prediction: z.string().min(1).max(200),
  odds: z.coerce.number().positive().max(10000).optional(),
  category: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  kickoffAt: z.string().datetime().optional().nullable(),
  validityUntil: z.string().datetime()
});

router.get("/", async (req, res) => {
  try {
    const where =
      req.user.role === "CUSTOMER"
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
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json(tips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Imeshindikana kupata tips." });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!["SUPER_ADMIN", "TIPSTER"].includes(req.user.role)) {
      return res.status(403).json({ message: "Huruhusiwi kuchapisha tips." });
    }

    const data = createSchema.parse(req.body);
    const validityUntil = new Date(data.validityUntil);

    if (validityUntil <= new Date()) {
      return res.status(400).json({
        message: "Muda wa mwisho lazima uwe mbele ya muda wa sasa."
      });
    }

    const tip = await prisma.tip.create({
      data: {
        tipsterId: req.user.id,
        matchName: data.matchName,
        prediction: data.prediction,
        odds: data.odds,
        category: data.category,
        kickoffAt: data.kickoffAt ? new Date(data.kickoffAt) : null,
        validityUntil
      }
    });

    res.status(201).json(tip);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Taarifa ulizoingiza hazijakamilika au si sahihi.",
        errors: error.errors
      });
    }

    console.error(error);
    res.status(500).json({ message: "Imeshindikana kuchapisha tip." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const tip = await prisma.tip.findUnique({
      where: { id: req.params.id }
    });

    if (!tip) {
      return res.status(404).json({ message: "Tip haijapatikana." });
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      tip.tipsterId !== req.user.id
    ) {
      return res.status(403).json({ message: "Huruhusiwi kufuta tip hii." });
    }

    await prisma.tip.delete({ where: { id: tip.id } });

    res.json({ message: "Tip imefutwa." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Imeshindikana kufuta tip." });
  }
});

router.patch("/:id/result", async (req, res) => {
  try {
    if (req.user.role !== "TIPSTER") {
      return res.status(403).json({
        message: "Ni Tipster aliyechapisha tip pekee anayeruhusiwa kuweka matokeo."
      });
    }

    const schema = z.object({
      result: z.enum(["WON", "LOST"])
    });

    const { result } = schema.parse(req.body);
    const now = new Date();

    const updated = await prisma.tip.updateMany({
      where: {
        id: req.params.id,
        tipsterId: req.user.id,
        result: "PENDING",
        validityUntil: { lte: now }
      },
      data: { result }
    });

    if (updated.count === 0) {
      const tip = await prisma.tip.findUnique({
        where: { id: req.params.id }
      });

      if (!tip) {
        return res.status(404).json({ message: "Tip haijapatikana." });
      }

      if (tip.tipsterId !== req.user.id) {
        return res.status(403).json({ message: "Hii si tip yako." });
      }

      if (tip.result !== "PENDING") {
        return res.status(400).json({
          message: "Matokeo ya tip hii tayari yamewekwa na hayawezi kubadilishwa."
        });
      }

      return res.status(400).json({
        message: "Huwezi kuweka matokeo kabla muda wa tip kuisha."
      });
    }

    const updatedTip = await prisma.tip.findUnique({
      where: { id: req.params.id }
    });

    res.json({
      message: "Matokeo yamehifadhiwa.",
      tip: updatedTip
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Chagua WON au LOST pekee." });
    }

    console.error(error);
    res.status(500).json({ message: "Imeshindikana kuhifadhi matokeo." });
  }
});

module.exports = router;
