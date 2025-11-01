# Vercel Deployment Guide for B2B Login App

## Overview
Your Shopify app is now configured to deploy to Vercel at `https://b2-b-login-2.vercel.app/`

## Changes Made

### 1. Configuration Files Updated

#### `shopify.app.toml`
- Updated `application_url` to: `https://b2-b-login-2.vercel.app`
- Updated `redirect_urls` to: `https://b2-b-login-2.vercel.app/auth`

#### `prisma/schema.prisma`
- Changed database from SQLite to PostgreSQL
- Updated `datasource` to use `DATABASE_URL` environment variable

#### `vercel.json`
- Created Vercel configuration file
- Set up build commands and output directory

#### `api/index.js`
- Created serverless function to handle React Router requests
- Configured for Vercel's runtime

## Required Environment Variables

You need to set these in your Vercel project settings:

### Shopify App Credentials
- `SHOPIFY_API_KEY` - Your Shopify app's API key
- `SHOPIFY_API_SECRET` - Your Shopify app's secret key
- `SHOPIFY_APP_URL` - `https://b2-b-login-2.vercel.app`
- `SCOPES` - `write_products,write_customers,read_customers`

### Database
- `DATABASE_URL` - Your PostgreSQL connection string

You can use providers like:
- **Vercel Postgres** (recommended, built-in)
- **Neon** (https://neon.tech) - Free tier available
- **Supabase** (https://supabase.com) - Free tier available
- **PlanetScale** (https://planetscale.com) - Free tier available
- **Railway** (https://railway.app) - Free tier available

### Other
- `NODE_ENV` - `production`

## Deployment Steps

### 1. Set Up Database
1. Choose a PostgreSQL provider
2. Create a new PostgreSQL database
3. Copy the connection string (DATABASE_URL)
4. Add it to Vercel environment variables

### 2. Deploy to Vercel

**Option A: Via Vercel Dashboard**
1. Go to https://vercel.com
2. Import your Git repository
3. Configure environment variables
4. Deploy

**Option B: Via CLI**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### 3. Run Database Migrations

After deployment, you need to run Prisma migrations:

**Using Vercel CLI:**
```bash
vercel env pull
npx prisma migrate deploy
```

Or add a post-deployment script in Vercel to run migrations automatically.

### 4. Update Shopify App Settings

After successful deployment:
1. Go to your Shopify Partners Dashboard
2. Select your app
3. Verify the app URL is set to: `https://b2-b-login-2.vercel.app`
4. Verify redirect URLs include: `https://b2-b-login-2.vercel.app/auth`
5. Save changes

## Build Configuration

### Build Command
```bash
npm run build
```

This runs:
1. `react-router build` - Builds the React Router app
2. `prisma generate` - Generates Prisma Client

### Output Directory
- `build/client` - Static assets for Vercel to serve
- `build/server` - Server code for API functions

## Important Notes

### Prisma Setup
Since we moved from SQLite to PostgreSQL, you'll need to:

1. **Create initial migration for PostgreSQL:**
   ```bash
   npx prisma migrate dev --name init_postgres
   ```

2. **Apply migrations in production:**
   ```bash
   npx prisma migrate deploy
   ```

### Session Storage
The app uses Prisma for session storage. Make sure your PostgreSQL database is properly configured and migrations are run.

### Webhooks
Webhook URLs are configured in `shopify.app.toml`:
- `/webhooks/app/uninstalled`
- `/webhooks/app/scopes_update`

These will automatically be available at:
- `https://b2-b-login-2.vercel.app/webhooks/app/uninstalled`
- `https://b2-b-login-2.vercel.app/webhooks/app/scopes_update`

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correctly set
- Check database allows connections from Vercel IPs
- Ensure migrations have been run

### Build Failures
- Check Node.js version (requires >= 20.19 or >= 22.12)
- Verify all dependencies are installed
- Check build logs in Vercel dashboard

### App Not Connecting
- Verify `SHOPIFY_APP_URL` matches your Vercel domain
- Check redirect URLs in Shopify Partners Dashboard
- Clear browser cache and try again

## Next Steps

1. Set up PostgreSQL database
2. Configure environment variables in Vercel
3. Deploy to Vercel
4. Run database migrations
5. Test the deployment
6. Update Shopify app settings

## Support

For issues specific to:
- **Vercel**: https://vercel.com/docs
- **Shopify**: https://shopify.dev/docs/apps
- **React Router**: https://reactrouter.com
- **Prisma**: https://www.prisma.io/docs

