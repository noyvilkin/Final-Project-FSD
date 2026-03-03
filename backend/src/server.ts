import "dotenv/config";
import app from "./app.js";
import { connectToDatabase } from "./common/services/database.js";
import { appLogger } from "./common/services/logger.js";

const port = Number(process.env.PORT) || 4000;

const startServer = async () => {
    try {
        await connectToDatabase();

        app.listen(port, () => {
            appLogger.info("api gateway listening", { port });
        });
    } catch (error) {
        appLogger.error("failed to start server", { error });
        process.exit(1);
    }
};

startServer();