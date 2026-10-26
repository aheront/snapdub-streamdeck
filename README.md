# SnapDub for Stream Deck

Turn a stream or video link into short vertical clips with captions, with one key.

## Keys

- **Make clips.** Copy a YouTube, Twitch, Kick, Rumble or Zoom link and press the key. The key shows the progress. Once the clips are ready, press it again to open them. You can also set a fixed link, the number of clips and one of your templates in the key's settings.
- **Credits.** Shows how many credits you have left. Press it to open your plan.

## Sign in

Open either key's settings and press **Sign in with SnapDub**. Your browser opens the SnapDub sign-in page, and once you approve, the keys are ready. A free account works.

## Develop

```
npm install
npm run build
npx streamdeck link ai.snapdub.streamdeck.sdPlugin
npm run watch
npm test
npm run validate
npm run pack
```

Requires Stream Deck 7.1 or newer and Node.js 24.

The plugin talks to the SnapDub MCP server (https://snapdub.ai/mcp) with OAuth 2.1: dynamic client registration, PKCE and a one-off listener on 127.0.0.1 for the redirect.
