import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200)
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200)
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Username, valid email and password of at least 8 characters are required"
    });
  }

  try {
    const { username, email, password } = parsed.data;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        error: "Username or email already exists"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        role: "CUSTOMER"
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true
      }
    });

    return res.status(201).json({
      message: "Account created successfully",
      user
    });

  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Username or email already exists"
      });
    }

    console.error(error);

    return res.status(500).json({
      error: "Registration failed"
    });
  }
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Enter username and password"
    });
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username }
  });

  if (
    !user ||
    !user.isActive ||
    !(await bcrypt.compare(parsed.data.password, user.passwordHash))
  ) {
    return res.status(401).json({
      error: "Username or password is incorrect"
    });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    }
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
