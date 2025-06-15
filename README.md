# MCP Gateway Registry Development Repository

This repository contains development files for the MCP Gateway Registry.

## Development Setup

1. Build and run the development container:
   ```bash
   docker-compose up --build
   ```

2. Make changes to the source code in the `src` directory.

3. Test your changes locally by accessing the application at http://localhost:8080.

## Building and Pushing to ECR

1. Create a new tag for your updated image:
   ```bash
   NEW_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$(date +%Y%m%d-%H%M%S)")
   ```

2. Build the image:
   ```bash
   docker build -t mcp-gateway-registry:$NEW_TAG .
   ```

3. Tag the image for your ECR repository:
   ```bash
   docker tag mcp-gateway-registry:$NEW_TAG 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG
   ```

4. Push to ECR:
   ```bash
   docker push 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG
   ```

## Updating the Deployment

1. Update your Kubernetes deployment:
   ```bash
   kubectl set image deployment/mcp-gateway-registry mcp-gateway-registry=338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:$NEW_TAG -n mcp-registry
   ```

2. Or apply an updated manifest:
   ```bash
   # Update the image tag in your update-deployment.yaml file
   kubectl apply -f update-deployment.yaml
   ```

## Verifying the Deployment

```bash
# Check that your new image is being used
kubectl get deployment -n mcp-registry
kubectl get pods -n mcp-registry

# Check the resource allocation
kubectl get pod -n mcp-registry $(kubectl get pods -n mcp-registry -o jsonpath='{.items[0].metadata.name}') -o yaml | grep -A 20 resources

# Check the pod annotations to verify capacity
kubectl get pod -n mcp-registry $(kubectl get pods -n mcp-registry -o jsonpath='{.items[0].metadata.name}') -o jsonpath='{.metadata.annotations}'
```
