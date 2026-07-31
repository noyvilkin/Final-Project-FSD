import "dotenv/config";
import fs from "fs";
import http from "http";
import https from "https";
import app from "./app.js";
import { connectToDatabase } from "./common/services/database.js";
import { appLogger } from "./common/services/logger.js";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 4000;
const httpsPort = Number(process.env.HTTPS_PORT) || 443;
const sslKeyPath = process.env.SSL_KEY_PATH || "/etc/ssl/cs/myserver.key";
const sslCertPath = process.env.SSL_CERT_PATH || "/etc/ssl/cs/CSB.crt";

const startServer = async () => {
    try {
        await connectToDatabase();

        if (!isProduction) {
            http.createServer(app).listen(port, () => {
                appLogger.info("api gateway listening over http", { port });
            });
            return;
        }

        const options = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath),
        };

        https.createServer(options, app).listen(httpsPort, () => {
            appLogger.info("api gateway listening over https", { port: httpsPort });
        });
    } catch (error) {
        appLogger.error("failed to start server", { error });
        process.exit(1);
    }
};

startServer();