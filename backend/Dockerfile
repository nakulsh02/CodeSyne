# Production-ready Dockerfile for Codesyne Backend Service

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy configuration files
COPY package*.json tsconfig.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Copy shared code and workspaces
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Install dependencies and build
RUN npm install
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine

# Install compilers and tools for multi-language execution
RUN apk add --no-cache \
    python3 \
    build-base \
    openjdk17-jdk \
    go \
    rust \
    php \
    bash

WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/dist ./dist

RUN npm install --omit=dev

EXPOSE 10000
ENV NODE_ENV=production
ENV PORT=10000

CMD ["npm", "run", "start"]
