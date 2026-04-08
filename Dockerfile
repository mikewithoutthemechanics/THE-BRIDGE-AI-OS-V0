FROM node:20-alpine
WORKDIR /app
# Copy manifests first — layer-cached unless deps change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Copy source (secrets/logs excluded via .dockerignore)
COPY . .
# Run as non-root user for security
RUN addgroup -S bridge && adduser -S -G bridge bridge
USER bridge
EXPOSE 8080 8000 3000 5002 5001
CMD ["node", "brain.js"]
