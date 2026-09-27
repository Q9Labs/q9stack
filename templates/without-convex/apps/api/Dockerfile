FROM node:24-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY seeds ./seeds

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @__APP_SLUG__/api... build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/packages ./packages
RUN pnpm install --prod --frozen-lockfile=false

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
