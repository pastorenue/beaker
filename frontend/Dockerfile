# Build stage
FROM node:20-alpine as builder

WORKDIR /app

# Copy frontend config
COPY frontend/package.json ./frontend/

# Copy sdk and frontend source
COPY sdk/typescript ./sdk/typescript
COPY frontend ./frontend

# Install SDK dependencies
WORKDIR /app/sdk/typescript
RUN npm install

WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Runtime stage
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy custom nginx config to handle client-side routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
