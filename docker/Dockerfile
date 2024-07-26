# Building layer
FROM node:18.19-alpine as build

WORKDIR /server

# Copy configuration files
COPY tsconfig*.json ./
COPY package*.json ./

# Install dependencies from package-lock.json, see https://docs.npmjs.com/cli/v7/commands/npm-ci
RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*
RUN npm install

# Copy application sources (.ts, .tsx, js)
COPY .babelrc ./
COPY .swcrc ./
COPY .yarnrc ./
# COPY .env ./.env.development.local
COPY . ./

# Build application (produces dist/ folder)
RUN npm run build

# Runtime (production) layer
FROM node:18.19-alpine as runtime

WORKDIR /server

# Copy dependencies files
COPY tsconfig*.json ./
COPY package*.json ./

# RUN npm install npm@latest
RUN npm install --only=production

# Copy production build
COPY --from=build /server/dist ./dist/
COPY .babelrc ./
COPY .swcrc ./
COPY .yarnrc ./
COPY . ./

# Check if the build is successful
RUN echo "Build successful"
RUN ls -la
# Check current directory
RUN pwd
RUN ls -la dist


# Expose application port
EXPOSE 3000

# Start application
CMD ["npm", "run", "start"]