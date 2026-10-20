# Browser SAP signing

This is a TypeScript port of the direct SAP implementation in
[ApplePackage](https://github.com/Lakr233/ApplePackage), revision `773583a`.
The original code is MIT licensed, copyright (c) 2025 Lakr233 and
(c) 2026 ApplePackage contributors; see the repository's MIT license.

`random.ts` ports the repository-authored C RNG and F1 arithmetic. `source.ts`,
`cipher.ts`, and `f2.ts` port the Swift transforms. `crypto.ts` uses browser
Web Crypto for SHA-1, HMAC, and AES-CBC, with explicit seeded RSA-OAEP encoding
and public-key modular exponentiation. Integer products use `Math.imul` or
`BigInt` so JavaScript rounding cannot change the protocol.

`tables.json` contains fixed mathematical lookup tables and permutations copied
from that revision's SAP resources, C constants, and Swift F2/source constants.
It contains no executable code, private framework, saved session, or account
data. The four resource pools retain the reference's length and SHA-256 checks.

Setup fetches Apple's public certificate and performs a fresh exchange entirely
through browser-side TLS. The signer and server-issued session remain in memory.
Every login request, redirect, and retry gets a signature over its exact UTF-8
body. The login form retains its authenticator for the verification-code step.
Setup/signing failures stop authentication; there is no unsigned fallback.

Tests use ApplePackage's synthetic setup certificate/replies and independent
known-answer vectors. They include no Apple certificate, real account,
server-issued session, or captured production signature.

For local testing, start OrbStack and run from the repository root:

```sh
docker compose -f compose.yml -f compose.local.yml up --build -d
```

Open <http://localhost:8080>. This builds the working tree, rather than pulling
the published image, and preserves the existing local data volume.
