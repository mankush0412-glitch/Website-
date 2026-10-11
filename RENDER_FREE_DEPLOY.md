# Deploy this store on Render Free (Web Service)

This repository is configured to run the storefront and Express API together as one Node web service. Do not create a Static Site: the API, admin login, MongoDB connection, and store all need the Web Service.

## To auto-fill Render settings

Choose **New → Blueprint**, not the manual **New → Web Service** form. The Blueprint reads this repository's `render.yaml` and creates the same kind of **Free Web Service**; it pre-fills Node, build/start commands, `HOST`, database name, custom domains, allowed origins, and private-file path. Render generates `JWT_SECRET`.

Only account-specific values cannot be prefilled: enter `MONGODB_URI` from your MongoDB Atlas account and create your own `ADMIN_PASSWORD` when Render asks. After the site is live, add `GOOGLE_CLIENT_ID` from your Google Cloud OAuth Web Client before enabling customer checkout. Do not put any of these account values in the ZIP or GitHub.

## 1. Put the repository on GitHub

1. Extract the project ZIP. Its top level should directly show `render.yaml`, `package.json`, `pnpm-lock.yaml`, and the project folders.
2. Create an empty GitHub repository. Keep it private if you prefer.
3. Upload all extracted files to the repository root. Do not put them inside another folder. `render.yaml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `artifacts/`, `e-com-main/`, and `lib/` should be at the repository root.
4. Commit and push the files to the `main` branch.

Never commit `.env` files, database URIs, passwords, or uploaded product ZIPs.

## 2. Create the MongoDB database

The app needs MongoDB. Create a MongoDB Atlas cluster and database user, then copy the driver's connection URI. Keep the database username/password private. In Atlas Network Access, allow the Render service's outbound IPs when available; otherwise configure access according to your security requirements. Do not paste the URI into source files or commit it to GitHub.

## 3. Create the Render service

Recommended: choose **New → Blueprint**. This reads `render.yaml` and creates a **Free Web Service** with the commands, domain, and non-secret values preconfigured.

1. Connect GitHub and select this repository and the `main` branch; leave Blueprint path as `render.yaml`.
2. Review that the service is `next-level-notes`, runtime **Node**, plan **Free**, and domains `nxtlevellive.xyz` / `www.nxtlevellive.xyz`.
3. Enter the requested private values: `MONGODB_URI` from Atlas and an `ADMIN_PASSWORD` you create. Render generates `JWT_SECRET`.
4. Deploy the Blueprint.

If you instead create the service manually, choose **New → Web Service**, connect this repository and `main`, set runtime **Node**, leave **Root Directory** blank, choose **Free**, then use these commands:

**Build Command**

```sh
pnpm install --frozen-lockfile && npm --prefix e-com-main/backend install && PORT=21536 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/next-level-notes run build:render
```

**Start Command**

```sh
npm --prefix e-com-main/backend start
```

Set the health check path to:

```text
/api/health
```

Add the environment variables below, then create the service.

## 4. Environment variables to add

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `MONGODB_URI` | MongoDB Atlas → cluster → **Connect → Drivers** connection URI. Treat as a secret. |
| `MONGODB_DB` | `next_level_notes` |
| `ADMIN_PASSWORD` | Create a new, strong password yourself; use it to sign in at `/admin`. Treat as a secret. |
| `JWT_SECRET` | Render generates this in Blueprint mode. For a manual service, generate a random value of at least 32 characters privately. |
| `FRONTEND_ORIGINS` | `https://nxtlevellive.xyz,https://www.nxtlevellive.xyz,https://next-level-notes.onrender.com` |
| `PRIVATE_PRODUCT_DIR` | `/opt/render/project/src/e-com-main/private_storage/products` |

Do **not** add `PORT`; Render supplies it automatically. If Render gives the service a different `onrender.com` URL, replace the example URL in `FRONTEND_ORIGINS` with the exact assigned URL and redeploy. The Blueprint adds both custom domains. In Render's **Custom Domains** section, copy its DNS records into the domain's DNS settings. Usually `www` uses a CNAME to the service's `onrender.com` host; for the root domain use an ALIAS/ANAME/flattened CNAME if supported, otherwise use the root A-record value Render shows. Remove conflicting records for these hostnames, but keep email `MX` records.

### Google sign-in (required for store purchases)

Create a Google OAuth **Web application** client in Google Cloud Console → **APIs & Services → Credentials → Create Credentials → OAuth client ID**. Add these under **Authorized JavaScript origins**:

```text
https://nxtlevellive.xyz
https://www.nxtlevellive.xyz
https://next-level-notes.onrender.com
```

Add the resulting Web Client ID as Render's `GOOGLE_CLIENT_ID` environment variable. If your `onrender.com` URL differs, use the actual URL. Do not put a Google client secret in the browser or repository. Customer sign-in is needed for checkout, order history, and paid downloads.

## 5. Confirm the deployment

Wait for Render to show **Live**, then check:

- `https://nxtlevellive.xyz/api/health` — should return a small JSON health response.
- `https://nxtlevellive.xyz/` — customer storefront.
- `https://nxtlevellive.xyz/admin` — admin login; use `ADMIN_PASSWORD`.

In the admin area, set your own UPI ID and support details and add your products. UPI payment verification is manual; this project does not automatically verify payments with a payment gateway.

## Free-tier file-storage warning

Render Free web services have an ephemeral filesystem. Uploaded product ZIPs and cover images saved on the service can disappear after a restart, deploy, or spin-down. The MongoDB database stores application records, but it does not make these local uploaded files persistent.

For a real store where buyers must reliably download uploaded files, use external object storage and configure the app to use it, or move to a Render service plan that supports a persistent disk. A disk mounted at `/opt/render/project/src/e-com-main/private_storage/products` would cover private product ZIPs; cover images are saved separately under `e-com-main/public/uploads/products` and need their own persistence plan.

Render Free services can also spin down when idle, so the first request after inactivity may take longer.
