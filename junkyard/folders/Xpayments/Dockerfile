FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm init -y
RUN npm install express pg
EXPOSE 4000
CMD ["node","server.js"]
