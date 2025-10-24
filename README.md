<a href="https://www.logo-creator.io">
  <img alt="AI Logo Generator" src="./public/og-image.png">
  <h1 align="center">AI Logo Generator</h1>
</a>

<p align="center">
  An open source logo generator – create professional logos in seconds with customizable styles.
</p>

## Tech stack

- [Flux Pro 1.1](https://togetherai.link/flux-playground) on [Together AI](https://togetherai.link/) for logo generation
- [Next.js](https://nextjs.org/) with TypeScript for the app framework
- [Shadcn](https://ui.shadcn.com/) for UI components & [Tailwind](https://tailwindcss.com/) for styling
- [Upstash Redis](https://upstash.com/) for rate limiting
- [Clerk](https://clerk.com/) for authentication
- [Plausible](https://plausible.io/) & [Helicone](https://helicone.ai/) for analytics & observability

## Cloning & running

1. Clone the repo: `git clone https://github.com/Nutlope/logocreator`
2. Create a `.env` file and add your [Together AI API key](https://api.together.xyz/settings/api-keys): `TOGETHER_API_KEY=`
3. Run `npm install` and `npm run dev` to install dependencies and run locally.

## Docker Deployment

You can also run this application using Docker:

### Using Docker Compose (Recommended)

1. Clone the repo and create your `.env` file with your Together AI API key
2. Run: `docker-compose up -d`
3. Access the app at `http://localhost:3000`

### Using Docker directly

```bash
# Build the image
docker build -t logocreator .

# Run the container
docker run -p 3000:3000 -e TOGETHER_API_KEY=your_api_key_here logocreator
```

### Using pre-built images

Docker images are automatically built and pushed via GitHub Actions. You can pull and run them:

```bash
docker pull yourusername/logocreator:latest
docker run -p 3000:3000 -e TOGETHER_API_KEY=your_api_key_here yourusername/logocreator:latest
```

## Future Tasks

- [ ] Create a dashboard with a user's logo history
- [ ] Support SVG exports instead of just PNG
- [ ] Add support for additional styles
- [ ] Add a dropdown for image size (can do up to 1440x1440)
- [ ] Show approximate price when using your own Together AI key
- [ ] Allow the ability to upload a reference logo (use vision model to read it)
- [ ] Redesign popular brand’s logos with my logo maker and have it in a showcase
