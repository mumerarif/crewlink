FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @crewlink/web --include-workspace-root

COPY --chown=node:node apps/web apps/web
RUN chown node:node /app/apps/web

ARG SESSION_COOKIE_SECURE=false
ENV SESSION_COOKIE_SECURE=$SESSION_COOKIE_SECURE
USER node
RUN npm run build --workspace @crewlink/web

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "@crewlink/web", "--", "-H", "0.0.0.0"]
