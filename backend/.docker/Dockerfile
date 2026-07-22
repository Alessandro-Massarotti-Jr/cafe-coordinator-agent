# Build stage
FROM node:24-alpine AS build
USER node
WORKDIR /home/node/app
COPY package*.json ./
RUN npm ci
COPY ./ .
RUN npm run build

# production Stage
FROM node:24-alpine
USER node
WORKDIR /home/node/app
COPY --from=build  /home/node/app/build  /home/node/app/build
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000

CMD [ "npm",'start' ]