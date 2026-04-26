<<<<<<< HEAD
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

=======
FROM nginx:alpine

# Copy the HTML file to nginx html directory
COPY index.html /usr/share/nginx/html/

# Copy custom nginx configuration if needed (optional)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
>>>>>>> a65a24150727639fde77daadeba4361af473827a
CMD ["nginx", "-g", "daemon off;"]