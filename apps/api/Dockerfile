FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @crewlink/api --include-workspace-root

COPY apps/api apps/api

RUN npm run prisma:generate --workspace @crewlink/api

EXPOSE 3001

USER node

CMD ["npm", "run", "start", "--workspace", "@crewlink/api"]
