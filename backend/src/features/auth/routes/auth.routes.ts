import { Router } from "express";
import { asyncHandler } from "../../../common/middlewares/asyncHandler.js";
import { login, logout, refresh, signUp } from "../controllers/authController.js";

const router = Router();

router.post("/signup", asyncHandler(signUp));
router.post("/login", asyncHandler(login));
router.post("/refresh", asyncHandler(refresh));
router.post("/logout", asyncHandler(logout));

export default router;
