#!/bin/bash

# Exit on error
set -e

# Get the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

# Generate a tag based on git commit or timestamp
NEW_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$(date +%Y%m%d-%H%M%S)")
echo "Building with tag: $NEW_TAG"

# Authenticate to ECR
echo "Authenticating to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 338293206254.dkr.ecr.us-east-1.amazonaws.com

# Build the Docker image
echo "Building Docker image..."
docker build -t mcp-gateway-registry:$NEW_TAG .

# Tag the image for ECR
echo "Tagging image for ECR..."
docker tag mcp-gateway-registry:$NEW_TAG 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG

# Push to ECR
echo "Pushing to ECR..."
docker push 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG

# Update the deployment manifest
echo "Updating deployment manifest..."
sed -i '' "s|\${NEW_TAG}|$NEW_TAG|g" update-deployment.yaml

echo "Build and push completed successfully!"
echo "To deploy the updated image, run:"
echo "kubectl apply -f update-deployment.yaml"
