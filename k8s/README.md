# Kubernetes Deployment for MCP Gateway Registry

This directory contains Kubernetes manifests for deploying the MCP Gateway Registry to a Kubernetes cluster.

## Components

- `namespace.yaml`: Creates the `mcp-registry` namespace
- `pvc.yaml`: Persistent Volume Claim for storing registry data
- `deployment.yaml`: Deployment configuration for the MCP Gateway Registry
- `service.yaml`: Service to expose the MCP Gateway Registry
- `ingress.yaml`: Ingress configuration for external access
- `kustomization.yaml`: Kustomize configuration for deploying all resources

## Prerequisites

- Kubernetes cluster with AWS ALB Ingress Controller installed
- AWS ECR repository with the MCP Gateway Registry image
- AWS ACM certificate for HTTPS (update the ARN in `ingress.yaml`)

## Deployment

### Using kubectl with kustomize

```bash
# Apply all resources
kubectl apply -k .

# Verify deployment
kubectl get all -n mcp-registry
```

### Using individual manifests

```bash
# Create namespace
kubectl apply -f namespace.yaml

# Create PVC
kubectl apply -f pvc.yaml

# Deploy the application
kubectl apply -f deployment.yaml

# Create the service
kubectl apply -f service.yaml

# Create the ingress
kubectl apply -f ingress.yaml
```

## Configuration

### Resource Allocation

The deployment is configured with resources equivalent to an ml.t3.2xlarge instance:
- CPU: 8 vCPUs
- Memory: 32Gi

### Storage

The PVC is configured to request 80Gi of storage using the gp2 storage class.

### Networking

The service exposes port 80 internally, and the ingress is configured to expose the service externally with HTTPS.

## Monitoring

The deployment includes annotations for Prometheus scraping:
- `prometheus.io/scrape: "true"`
- `prometheus.io/port: "80"`

## Health Checks

The deployment includes liveness and readiness probes that check the `/health` endpoint.
