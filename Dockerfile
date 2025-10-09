FROM node:22.18-alpine

WORKDIR /usr/src/app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .

COPY .env .

RUN npm run build

#ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

RUN npx prisma generate
RUN npm run seed

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
