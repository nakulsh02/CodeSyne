# Multi-stage production-ready Dockerfile for Codesyne Full-Stack

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

# Install development and production dependencies
RUN npm install

# Build the frontend SPA and compile the backend server to CJS
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

# Copy built artifacts and configuration
COPY package*.json ./
COPY --from=builder /app/dist ./dist

# Install ONLY production dependencies to keep the image slim
RUN npm install --omit=dev

# Expose port 10000 (standard for Render)
EXPOSE 10000

# Environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Start command
CMD ["npm", "run", "start"]
