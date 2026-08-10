# ADR 008: Security Headers

# ADR 008: Security Headers

Apply a minimal set of security headers to every route via `next.config.ts`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=()`

`microphone=(self)` — the creator desk's voice agent needs it. Empty `()` denies our own origin too, which surfaces as `Permissions policy violation: microphone is not allowed in this document`.

Keep this list lean; add more only when the app needs them (e.g., CSP for inline scripts, additional device policies).

## Examples

```ts
headers: () => [{
  source: "/:path*",
  headers: [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  ],
}]
```

## Links

- Header config: `next.config.ts`
