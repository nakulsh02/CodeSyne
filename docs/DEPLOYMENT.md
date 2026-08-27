# Production Deployment Guide: One-Click Deploy

This repository is optimized for **"One-Click Deploy"** using a modern, decoupled architecture:
- **Backend Service:** Hosted on **Render** (Node.js runtime with WebSockets & Express).
- **Frontend Client:** Hosted on **Vercel** (static edge network with SPA client-side routing fallback).

---

## 🚀 Deployment Steps (Step-by-Step)

### Step 1: Push Your Code to GitHub
Ensure all your workspace files, configuration files (`vercel.json`, `render.yaml`), and packages are committed and pushed to your personal GitHub repository:
```bash
git init
git add .
git commit -m "chore: optimize for automated production deployment"
git remote add origin https://github.com/your-username/your-repo-name.git
git branch -M main
git push -u origin main
```

---

### Step 2: Deploy the Backend to Render
Render automatically detects the `render.yaml` file and configures your service.

1. Go to the **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **New +** in the top right, and select **Blueprint**.
3. Connect your GitHub account and select your repository.
4. Render will parse the `render.yaml` blueprint. Click **Apply**.
5. Go to your new service dashboard:
   - Click on **Environment** in the left menu.
   - Add your **Secrets**:
     - `GEMINI_API_KEY`: *your-google-gemini-api-key*
6. Once the build finishes, copy your **Render Service URL** (e.g., `https://your-backend-app.onrender.com`).

---

### Step 3: Deploy the Frontend to Vercel
Vercel will build your optimized frontend assets and enable instant Edge-network caching.

1. Go to the **[Vercel Dashboard](https://vercel.com/)**.
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. In the **Configure Project** section:
   - Keep the Framework Preset as **Vite** or **Other**.
   - Keep the Root Directory as `/`.
   - Expand the **Environment Variables** section and add:
     - `VITE_BACKEND_URL`: *Paste your Render Service URL here (e.g., `https://your-backend-app.onrender.com`)*
5. Click **Deploy**.
6. Once deployed, Vercel will provide your live **Frontend Application URL** (e.g., `https://your-app.vercel.app`).

**That's it! Everything will connect and work immediately without any manual code editing.**

---

## 🛠️ Local Development (Zero Configuration)

Our system is engineered to automatically detect and adapt to its active environment.

When developing locally, you can run the frontend and backend split or unified:

### Unified Mode (Same Port)
This starts the full-stack server on port `3000` with the Vite dev middleware serving the frontend on the exact same port:
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### Independent Mode (Separate Ports)
If you wish to run them separately, start your backend server:
```bash
# Backend starts on port 5000 automatically
NODE_ENV=development npm run start
```
And start the Vite development server in another terminal:
```bash
# Frontend starts on port 5173 automatically
npx vite
```
Open **`http://localhost:5173`** in your browser. Our centralized config helper will automatically route all `/api/*` and `/ws` requests to the local backend running on `http://localhost:5000` under the hood!

---

## 🧩 Architectural Features Added for Production

### 1. Robust Centralized API Client (`/src/api.ts`)
- **Server Offline Handling:** Automatically intercepts connection failures and informs the client.
- **Request Timeouts:** Limits hanging requests to `8000ms` and terminates gracefully.
- **HTTP status mappings:** Maps generic errors to highly explanatory visual user prompts for **401, 403, 404, 500** statuses.
- **Browser Offline Detection:** Gracefully falls back to localized error UI if client's device loses internet access.

### 2. High-Performance Rollup Chunks (`/vite.config.ts`)
We implemented custom code-splitting configurations to divide large dependencies into specific chunks:
- `vendor-react`: Handles core `react` and `react-dom` dependencies.
- `vendor-lucide`: Isolate extensive svg UI icon definitions.
- `vendor-motion`: Separates heavy animation physics libraries.
- `vendor-gemini`: Isolates the server-ready `@google/genai` library client.
- `vendor-others`: Bundles remaining utilities.

### 3. Backend Hardening (`/server.ts`)
- **Dynamic Port Assignment:** Binds to `process.env.PORT` on Render, falls back to `3000` for AI Studio pre-build preview limits, and defaults to `5000` during standard standalone local development.
- **Helmet Security Headers:** Restricts cross-site exploits while carefully enabling modular standard Monaco Editor dependencies to resolve assets seamlessly.
- **Gzip/Deflate Compression:** Compresses all backend response payloads dynamically, reducing bandwidth footprint.
- **Dedicated Health Checks:** Integrates `/health` check route for Render liveness probes.
