# Frontend - Nginx serving stabilized admin dashboard
FROM nginx:1.25-alpine

# Copy custom nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static assets
COPY public/ /usr/share/nginx/html/
COPY admin-dashboard.html /usr/share/nginx/html/
COPY frontend/sw.js /usr/share/nginx/html/sw.js

# Security headers
RUN apk add --no-cache curl

# Expose frontend port
EXPOSE 8082

CMD ["nginx", "-g", "daemon off;"]