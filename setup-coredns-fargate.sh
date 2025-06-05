#!/bin/bash



# Create a NodePort service instead
echo "Creating a NodePort service..."
kubectl expose pod nginx -n mcp-gateway --port=80 --type=NodePort

# Check the new service
echo "Checking NodePort service..."
kubectl get service nginx -n mcp-gateway

echo "For your GitHub Actions workflow, update the service type to NodePort:"
echo "spec:"
echo "  selector:"
echo "    app: mcp-gateway-registry"
echo "  ports:"
echo "  - port: 80"
echo "    targetPort: 7860"
echo "  type: NodePort"

echo "To access the service, you'll need to set up an ingress controller or use port forwarding."
