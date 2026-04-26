FROM node:20 AS build

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist/assets /usr/share/nginx/html/assets

# Ensure workers are accessible
RUN mkdir -p /usr/share/nginx/html/workers
COPY --from=build /app/dist/assets/*.js /usr/share/nginx/html/workers/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]