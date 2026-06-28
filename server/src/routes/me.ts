import { Router } from "express";
import { prisma } from "../db";
import { asyncHandler } from "../lib/middleware";

export const meRouter = Router();

// GET /api/me/bookings — my bookings. Verbatim port of
// `src/app/api/me/bookings/route.ts`. `requireAuth` is applied at the mount, so
// req.user is always present here.
meRouter.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            venue: true,
            date: true,
            price: true,
          },
        },
      },
    });

    res.json({ bookings });
  })
);
