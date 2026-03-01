import { Router } from "express";

const router = Router();

router.get("/ping", (_req, res) => {
  res.status(200).json({ module: "profile", status: "ok" });
});

export default router;
