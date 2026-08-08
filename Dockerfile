FROM node:20-alpine

ENV NODE_ENV=production \
    UPSTASH_REDIS_REST_URL= \
    UPSTASH_REDIS_REST_TOKEN= \
    TOGETHER_API_KEY= \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= \
    CLERK_SECRET_KEY= \
    HELICONE_API_KEY=
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --production

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]