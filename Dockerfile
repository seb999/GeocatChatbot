# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend (static bundle) ----
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Firebase web config is public (shipped in the browser bundle). Baked as
# build-time defaults; override with --build-arg if you fork the project.
ARG VITE_FIREBASE_API_KEY=AIzaSyCBkN6D00gOUr1lncYOE_Kbd_SPRbDU-Gc
ARG VITE_FIREBASE_AUTH_DOMAIN=sdimcpchatbot.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=sdimcpchatbot
ARG VITE_FIREBASE_STORAGE_BUCKET=sdimcpchatbot.firebasestorage.app
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=60946029398
ARG VITE_FIREBASE_APP_ID=1:60946029398:web:8e20c1c6b73a462e5ed4f7
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
RUN npm run build

# ---- Stage 2: build the backend (TypeScript → dist) ----
FROM node:22-alpine AS backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---- Stage 3: slim runtime (serves API + static frontend) ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    PUBLIC_DIR=/app/public
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend /app/backend/dist ./dist
COPY --from=frontend /app/frontend/dist ./public
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
