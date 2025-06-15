# MCP Gateway Registry Development Repository

This repository contains development files for the MCP Gateway Registry, with support for cross-architecture development (amd64 and arm64).

## Repository Structure

- `extracted-src/` - Source code extracted from the original ECR image
- `modified-templates/` - Modified template files
- `Dockerfile` - Original Dockerfile for amd64 architecture
- `Dockerfile.arm64` - ARM64-specific Dockerfile for local development
- `docker-compose.yml` - Docker Compose file for amd64 architecture
- `docker-compose.arm64.yml` - Docker Compose file for ARM64 architecture
- `build-and-push.sh` - Script to build and push amd64 image to ECR
- `build-and-push-multiarch.sh` - Script to build and push multi-architecture image to ECR

## Local Development on ARM64 (Apple Silicon)

1. Build and run the development container using the ARM64-specific Docker Compose file:
   ```bash
   docker-compose -f docker-compose.arm64.yml up --build
   ```

2. Make changes to the source code in the `extracted-src/registry` directory.

3. Test your changes locally by accessing the application at http://localhost:8080.

## Local Development on AMD64

1. Build and run the development container using the standard Docker Compose file:
   ```bash
   docker-compose up --build
   ```

2. Make changes to the source code in the `extracted-src/registry` directory.

3. Test your changes locally by accessing the application at http://localhost:8080.

## Building and Pushing to ECR

### Option 1: Build for AMD64 Only

```bash
./build-and-push.sh
```

### Option 2: Build Multi-Architecture Image (Recommended)

```bash
./build-and-push-multiarch.sh
```

This will build images for both AMD64 and ARM64 architectures and push them to ECR with the appropriate manifests.

## Updating the Deployment

After building and pushing the image:

```bash
# Apply the updated deployment manifest
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
