import mongoose from "mongoose";
import { appLogger } from "./logger.js";

export const connectToDatabase = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(uri);

  appLogger.info("mongodb connected", {
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  });
};
