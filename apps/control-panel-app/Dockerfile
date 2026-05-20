FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy app and library source
COPY apps/control-panel-app ./apps/control-panel-app
COPY libs ./libs

# Install dependencies
RUN npm ci --only=production

# Build the control-panel app (Nest will compile libs referenced by the app)
RUN npm run build:control-panel-app

# Expose port
EXPOSE 3000

# Run the application
CMD ["npm", "run", "start:control-panel-app:prod"]
