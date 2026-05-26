FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

ARG VITE_API_URL
ARG VITE_EYLO_ORG_ID
ARG VITE_EYLO_AGENT_ID
ARG VITE_SERVER_HTTP_PROTOCOL
ARG VITE_SERVER_WS_PROTOCOL
ARG VITE_SERVER_BASE_HOST
ARG VITE_SERVER_BASE_PORT
ARG VITE_SERVER_BASE_URL
ARG VITE_SERVER_WS_BASE_URL

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
ARG FRONTEND_CONTAINER_PORT=80
EXPOSE ${FRONTEND_CONTAINER_PORT}
CMD ["nginx", "-g", "daemon off;"]
