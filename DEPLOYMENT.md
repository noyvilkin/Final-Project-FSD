# CareerPilot (Final-Project-FSD) Deployment Guide

This guide provides instructions for deploying the CareerPilot application on the college's Linux server. It covers process management with PM2, SSL certificate configuration, and deployment automation.

## 🏗 Network & Server Architecture

Based on the infrastructure guidelines:
*   **External Access (Inbound):** Ports `22` (SSH), `5432` (PostgreSQL), and `21771` (MongoDB) are accessible **only via SSL VPN**.
*   **Web Traffic:** The server is configured to serve the application to the outside world on ports `80` (HTTP) and `443` (HTTPS).
*   **Domains & SSL:** The app is hosted under the `cs.colman.ac.il` domain. Real SSL certificates are provided by the infrastructure team.

## 📋 Prerequisites

Before deploying, ensure the following are installed and configured on the server:
*   **Node.js** (v24.18.0 LTS or higher - required for Vite).
*   **npm** (comes with Node.js).
*   **PM2** (Process Manager) installed globally: `npm install pm2@latest -g`[cite: 1].
*   **Git** for version control.

## 🚀 First-Time Setup

### 1. Clone the Repository
```bash
git clone <your-repository-url>
cd Final-Project-FSD
```

### 2. Configure Environment Variables
Create a `.envprod` file (which the deployment script will copy to `.env`[cite: 1]) inside the `backend` directory:
```bash
cd backend
vi .envprod
```

Add the following configurations (adjust secrets as needed):
```text
# Environment
NODE_ENV=production

# Server Configuration
PORT=80
HTTPS_PORT=443

# Database (Ensure special characters in passwords like '@' are encoded, e.g., '%40')
MONGODB_URI=mongodb://server:123123123@127.0.0.1:21771/Final-Project-FSD

# Add your JWT, API Keys, and other secrets here...
```

### 3. Grant Port Binding Permissions (Crucial!)
By default, Linux non-privileged users cannot open listening sockets on ports below 1024 (like 80 and 443)[cite: 1]. To allow Node.js to serve HTTPS, you must grant it network capabilities[cite: 1]:
```bash
sudo apt-get install libcap2-bin
sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
```
*(Note: If you update Node.js via NVM in the future, you must re-run this command).*

### 4. Configure SSL Certificate Permissions
The infrastructure team provides real SSL certificates at `/etc/ssl/cs`. Ensure the user running the server has read access to them:
```bash
sudo chmod 755 /etc/ssl/cs
sudo chmod 644 /etc/ssl/cs/CSB.crt
sudo chmod 644 /etc/ssl/cs/myserver.key
```

### 5. Make the Deployment Script Executable
```bash
cd ..
chmod +x deploy.sh
```

### 6. Run Initial Deployment
```bash
./deploy.sh
```
This script will automatically:
1. Pull the latest code from `main`.
2. Install frontend dependencies (including dev dependencies required for the build).
3. Build the Vite React frontend.
4. Install backend dependencies.
5. Compile the TypeScript backend.
6. Start/Restart the application in PM2 under the name `careerpilot-backend`.

## 🔄 Regular Deployment Workflow

For all subsequent updates and deployments, simply run:
```bash
./deploy.sh
```

## ⚙️ PM2 Process Management

**View Application Status**
```bash
pm2 list
```

**View Application Logs**
```bash
pm2 logs careerpilot-backend        # View all live logs
pm2 logs careerpilot-backend --err  # View only error logs
```

**Restart / Stop Application**
```bash
pm2 restart careerpilot-backend
pm2 stop careerpilot-backend
```

**Save Configuration for Server Reboots**
```bash
pm2 save
pm2 startup
```

## 🛠 Troubleshooting

### `EACCES: permission denied 0.0.0.0:443`
**Cause:** Node.js lost permissions to bind to privileged ports (usually happens after a Node version update)[cite: 1].
**Fix:** Re-run the setcap command:
```bash
sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
pm2 restart careerpilot-backend
```

### `sh: 1: vite: not found` or `tsc: not found` during deployment
**Cause:** The server environment is strictly set to production, causing `npm install` to skip `devDependencies` (like compilers).
**Fix:** Ensure the `deploy.sh` script uses `npm install --include=dev` for both the frontend and backend setup steps.

### Database Connection Issues
**Cause:** Incorrect credentials or missing URL encoding.
**Fix:** Test the connection manually using `mongosh`[cite: 1]:
```bash
mongosh "mongodb://<user>:<password>@127.0.0.1:21771/Final-Project-FSD"
```
*(Remember: If the password contains an `@`, replace it with `%40` in the connection string[cite: 1]).*