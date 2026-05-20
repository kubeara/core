FROM node:24.15.0-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy app and library source
COPY apps/agent-app ./apps/agent-app
COPY libs ./libs

# Install dependencies
RUN npm ci --only=production

# Build the agent app (Nest will compile libs referenced by the app)
RUN npm run build:agent-app

# Expose port
EXPOSE 3001

# Run the application
CMD ["npm", "run", "start:agent-app:prod"]
