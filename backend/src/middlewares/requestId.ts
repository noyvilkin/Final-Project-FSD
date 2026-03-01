import { v4 as uuidv4 } from "uuid";
import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const headerId = req.header("x-request-id");
  const id = headerId && headerId.trim() ? headerId : uuidv4();

  req.requestId = id;
  res.setHeader("x-request-id", id);

  next();
};
