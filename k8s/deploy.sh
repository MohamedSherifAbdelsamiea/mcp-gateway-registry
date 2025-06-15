#!/bin/bash

# Exit on error
set -e

# Get the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR

# Generate a tag based on git commit or timestamp
NEW_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$(date +%Y%m%d-%H%M%S)")
echo "Using tag: $NEW_TAG"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check if the cluster is accessible
echo "Checking cluster connection..."
kubectl cluster-info || { echo "Failed to connect to the cluster. Please check your kubeconfig."; exit 1; }

# Update the image tag in the deployment file
echo "Updating image tag in deployment.yaml..."
sed -i '' "s|image: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:.*|image: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG|" deployment.yaml

# Apply the Kubernetes manifests
echo "Applying Kubernetes manifests..."
kubectl apply -k .

# Wait for the deployment to be ready
echo "Waiting for deployment to be ready..."
kubectl rollout status deployment/mcp-gateway-registry -n mcp-registry --timeout=300s

echo "Deployment completed successfully!"
echo "To check the status of your deployment, run:"
echo "kubectl get all -n mcp-registry"
