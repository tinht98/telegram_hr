FROM node:18-alpine

## Install essentials build package
RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers
