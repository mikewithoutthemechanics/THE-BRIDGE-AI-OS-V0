# ==========================================
# HARDENED DOCKERFILE (REDUCED ATTACK SURFACE)
# ==========================================

FROM node:18-alpine

WORKDIR /app
COPY . .

RUN npm install --only=production

ENV NODE_ENV=production
ENV CONTAINERX_TOKEN=secure-token-change-me

EXPOSE 3000

CMD ["node", "server.js"]
