# Access ParkSmart on Your Phone

## Option A — Same WiFi Network (recommended for demo)
1. Find your laptop's IP address:
   - Mac: System Settings → Network → WiFi → Details → IP Address
   - Windows: Run `ipconfig` → look for IPv4 Address (e.g. 192.168.1.45)
2. Start the frontend with: `npm run dev -- --host`
   (the --host flag makes it accessible on your local network)
3. On your phone (same WiFi): open `http://192.168.1.45:5173`
4. Tap "Add to Home Screen" in Safari (iPhone) or Chrome menu (Android)
5. It opens like a real app!

## Option B — USB (most reliable, works without WiFi)
iPhone: use ngrok (free) to tunnel: `npx ngrok http 5173`
It gives you a public URL like https://abc123.ngrok.io — open that on any phone.
