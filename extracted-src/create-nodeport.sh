#!/bin/bash

# Check if the old service still exists
echo "Checking if old service exists..."
if kubectl get service nginx -n mcp-gateway &>/dev/null; then
  echo "Deleting old service..."
  kubectl delete service nginx -n mcp-gateway --wait=false
  echo "Waiting for service to be deleted..."
  sleep 10
fi

# Create a NodePort service
echo "Creating a NodePort service..."
kubectl expose pod nginx -n mcp-gateway --port=80 --type=NodePort --name=nginx-nodeport

# Check the new service
echo "Checking NodePort service..."
kubectl get service nginx-nodeport -n mcp-gateway

echo "For your GitHub Actions workflow, update the service section to:"
echo "---"
echo "apiVersion: v1"
echo "kind: Service"
echo "metadata:"
echo "  name: mcp-gateway-registry"
echo "  namespace: mcp-gateway"
echo "spec:"
echo "  selector:"
echo "    app: mcp-gateway-registry"
echo "  ports:"
echo "  - port: 80"
echo "    targetPort: 7860"
echo "  type: NodePort"
