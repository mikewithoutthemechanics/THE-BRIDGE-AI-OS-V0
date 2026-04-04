FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080 8000 3000 5002 5001
CMD ["node", "brain.js"]
