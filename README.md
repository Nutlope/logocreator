<a href="https://www.logo-creator.io">
  <img alt="AI Logo Generator" src="./public/og-image.png">
  <h1 align="center">AI Logo Generator</h1>
</a>

<p align="center">
  An open source logo generator – create professional logos in seconds with customizable styles.
</p>

## Tech stack

- [Flux Pro 1.1](https://togetherai.link/?utm_source=logocreator&utm_medium=referral&utm_campaign=example-app) on [Together AI](https://togetherai.link/?utm_source=logocreator&utm_medium=referral&utm_campaign=example-app) for logo generation
- [Next.js](https://nextjs.org/) with TypeScript for the app framework
- [Shadcn](https://ui.shadcn.com/) for UI components & [Tailwind](https://tailwindcss.com/) for styling
- [Upstash Redis](https://upstash.com/) for rate limiting
- [Clerk](https://clerk.com/) for authentication
- [Plausible](https://plausible.io/) for analytics

## Cloning & running

1. Clone the repo: `git clone https://github.com/Nutlope/logocreator`
2. Create a `.env` file and add your [Together AI API key](https://api.together.xyz/settings/api-keys): `TOGETHER_API_KEY=`
   - To use Atlas Cloud's image API instead, set `IMAGE_PROVIDER=atlascloud` and add `ATLASCLOUD_API_KEY=` from the [Atlas Cloud console](https://www.atlascloud.ai/console/api-keys?utm_source=github&utm_medium=pr&utm_campaign=logocreator).
3. Run `npm install` and `npm run dev` to install dependencies and run locally.

## Future Tasks

- [ ] Create a dashboard with a user's logo history
- [ ] Support SVG exports instead of just PNG
- [ ] Add support for additional styles
- [ ] Add a dropdown for image size (can do up to 1440x1440)
- [ ] Show approximate price when using your own Together AI key
- [ ] Allow the ability to upload a reference logo (use vision model to read it)
- [ ] Redesign popular brand’s logos with my logo maker and have it in a showcase
