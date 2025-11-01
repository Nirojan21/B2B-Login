# Fix Connection Error - "refused to connect"

## Error: "offices-eco-printed-registry.trycloudflare.com refused to connect"

This happens when the Shopify app cannot connect to your development server.

### Solution Steps:

1. **Make sure dev server is running**
   ```bash
   cd "C:\shopify apps\b2-b-login"
   npm run dev
   ```
   
   OR use Shopify CLI:
   ```bash
   shopify app dev
   ```

2. **Wait for tunnel to initialize**
   - The terminal will show a URL like: `https://xxxxx.trycloudflare.com`
   - Wait until you see "App is ready" or similar message
   - The app URL is automatically updated by Shopify CLI

3. **Verify the tunnel is working**
   - Check terminal for any errors
   - Look for messages like "Tunnel established" or "Tunnel ready"

4. **If tunnel fails, try:**
   
   **Option A: Restart dev server**
   - Stop the server (Ctrl+C)
   - Delete any existing tunnel config
   - Restart: `shopify app dev`

   **Option B: Use different tunnel**
   - If Cloudflare tunnel fails, Shopify CLI will try alternatives
   - Or configure a local tunnel manually

5. **Check app configuration**
   - Verify `shopify.app.toml` has correct settings
   - Make sure `automatically_update_urls_on_dev = true`

6. **Clear browser cache**
   - Sometimes cached URLs cause issues
   - Try incognito/private mode

### Common Causes:

- ❌ Dev server not running
- ❌ Tunnel connection dropped
- ❌ Network/firewall blocking connection
- ❌ Cached old URL in browser
- ❌ Multiple tunnel processes running

### Quick Check:

1. **Is dev server running?**
   - Check terminal window
   - Should see "Server running on..." message

2. **Is tunnel active?**
   - Terminal should show tunnel URL
   - Should not show connection errors

3. **Can you access the tunnel URL directly?**
   - Try opening the tunnel URL in browser
   - Should show your app or a connection page

### If Still Not Working:

**Reset everything:**
```bash
# Stop all running processes
# Then:
cd "C:\shopify apps\b2-b-login"

# Restart fresh
shopify app dev
```

**Check for port conflicts:**
- Make sure port 3000 (or configured port) is available
- Close other apps using the same port

**Verify environment:**
- Check `.env` file exists and has correct values
- Verify SHOPIFY_API_KEY and SHOPIFY_API_SECRET are set

### Expected Terminal Output:

When working correctly, you should see:
```
✔ Tunnel established
✔ App URL: https://xxxxx.trycloudflare.com
✔ Server running on port 3000
✔ Ready for requests
```

