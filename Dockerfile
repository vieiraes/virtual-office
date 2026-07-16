FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

# Runtime mínimo: bundle JS do servidor (shared embutido) + client/dist +
# express/socket.io de produção. Sem tsx/typescript — node puro, para caber
# com folga na VM de 256MB do Fly.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN npm ci --omit=dev -w server -w shared && npm cache clean --force
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "server"]
