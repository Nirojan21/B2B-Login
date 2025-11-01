# Troubleshooting Guide

## Error: "Cannot read properties of undefined (reading 'findMany')"

### Cause
Prisma Client hasn't been generated or the dev server needs to be restarted after schema changes.

### Solution

1. **Stop the dev server** (if running)
   - Press `Ctrl+C` in the terminal

2. **Regenerate Prisma Client**
   ```bash
   cd "C:\shopify apps\b2-b-login"
   npx prisma generate
   ```

3. **Verify database migrations**
   ```bash
   npx prisma migrate status
   ```
   
   If migrations are pending:
   ```bash
   npx prisma migrate dev
   ```

4. **Restart the dev server**
   ```bash
   npm run dev
   ```

### Alternative: Full Reset (if above doesn't work)

```bash
# Stop dev server first

# Regenerate Prisma Client
npx prisma generate

# Reset and reapply migrations (WARNING: This will delete all data)
npx prisma migrate reset

# Or just apply pending migrations
npx prisma migrate dev
```

## Other Common Issues

### Database locked error
- **Solution**: Close any database tools or other processes accessing `prisma/dev.sqlite`

### Module not found errors
- **Solution**: 
  ```bash
  npm install
  npx prisma generate
  ```

### Authentication errors
- **Solution**: Make sure Shopify app is properly configured with correct API keys and scopes

## Verification Steps

1. Check Prisma Client exists:
   ```bash
   Test-Path "node_modules\.prisma\client"
   ```

2. Check database file exists:
   ```bash
   Test-Path "prisma\dev.sqlite"
   ```

3. Test Prisma connection:
   ```bash
   npx prisma studio
   ```
   (Opens Prisma Studio to view database)

