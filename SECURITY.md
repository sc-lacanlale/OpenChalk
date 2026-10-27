# Security

## Reporting a problem

Do not open a public issue for a security problem. Use GitHub's private vulnerability reporting: the repository's Security tab, then "Report a vulnerability". We aim to reply within a week.

## How the API key is handled

- The Gemini API key is read only on the server, from `.env` or your host's environment variables.
- Browsers receive a one-use token that expires after 30 minutes. They never receive the key itself.
- `ALLOW_RAW_KEY=1` sends the raw key to the browser for local debugging. Production builds ignore it.
- `/api/token` refuses cross-site browser requests and limits sessions per IP address. It is not a login. A public deployment can still spend your quota, so set a spending limit on your key.

If a key ever leaks, revoke it in Google AI Studio and create a new one.
