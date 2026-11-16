import { Router } from "express";
import { z } from "zod";
import {
  getFixtureById,
  getNextFixtures
} from "../services/footballApi.js";

import {
  requireAuth,
  requireSuperAdmin
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

router.get("/fixture", async (req, res) => {
  const parsed = z.object({
    id: z.string().regex(/^\d+$/)
  }).safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Provide a valid fixture ID"
    });
  }

  try {
    const fixture = await getFixtureById(parsed.data.id);

    if (!fixture) {
      return res.status(404).json({
        error: "Fixture not found"
      });
    }

    return res.json({ fixture });
  } catch (error) {
    console.error(error.message);

    return res.status(502).json({
      error: "Could not fetch fixture"
    });
  }
});

router.get("/next", async (_req, res) => {
  try {
    const fixtures = await getNextFixtures();

    return res.json({
      total: fixtures.length,
      fixtures
    });
  } catch (error) {
    console.error(error.message);

    return res.status(502).json({
      error: "Could not fetch upcoming fixtures"
    });
  }
});

export default router;
