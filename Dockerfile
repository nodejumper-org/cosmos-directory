FROM node:17-alpine

RUN apk update && apk add git

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
RUN npm install pm2 -g
COPY . ./

EXPOSE $APP_PORT

ENV NODE_ENV=production
ENV APP_NAME=app

CMD pm2-runtime ecosystem.config.cjs --only ${APP_NAME}
