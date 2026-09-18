# syntax=docker/dockerfile:1
FROM node:24-alpine

# Install PM2 globally
RUN npm install pm2 -g

# Create app directory
WORKDIR /app

# Copy ecosystem file first (explicit)
COPY ecosystem.config.js .

# Copy package files
COPY package*.json ./

# Install dependencies
RUN --mount=type=secret,id=github_pat \
    TOKEN=$(cat /run/secrets/github_pat 2>/dev/null || true) \
    && if [ -z "$TOKEN" ]; then \
         echo "ERROR: /run/secrets/github_pat is empty or missing!" >&2; \
         echo "Please ensure GITHUB_PAT secret is configured in GitHub repository or environment secrets." >&2; \
         exit 1; \
       fi \
    && echo "@snapsechq:registry=https://npm.pkg.github.com" > ~/.npmrc \
    && echo "//npm.pkg.github.com/:_authToken=${TOKEN}" >> ~/.npmrc \
    && npm ci \
    && rm -f ~/.npmrc

# Now copy everything else
COPY . .

# Create a directory for keys and chrome user data
RUN mkdir -p keys

# Start command
CMD ["pm2-runtime", "ecosystem.config.js"]