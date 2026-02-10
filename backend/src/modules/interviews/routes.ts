import { Router } from "express";

const router = Router();

router.get("/ping", (_req, res) => {
  res.status(200).json({ module: "interviews", status: "ok" });
});

export default router;
