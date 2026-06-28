# book_website
A website for me to look at different books and be able to create a wish list.

## Known Areas to Improve

### DDoS / Rate Limiting
- **Current:** In-memory rate limiter per IP — protects against single-IP brute force on login (10/15 min), register (5/hr), forgot-password (3/hr), and reset-password (3/hr). Resets on server restart; does not scale across multiple instances.
- **To do:** Add Cloudflare (free tier) in front of the domain for edge-level DDoS protection and distributed rate limiting. No code changes needed — just point DNS at Cloudflare. This covers volumetric attacks from thousands of IPs that the current limiter cannot handle.
- **Also consider:** Redis-backed rate limiter if the app ever runs on multiple instances, and `npm install helmet` for missing HTTP security headers (X-Frame-Options, CSP, etc.).
