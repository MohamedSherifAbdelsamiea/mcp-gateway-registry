#!/bin/bash

# Get the pod name from command line or use default
POD_NAME=${1:-mcp-gateway-registry-new-64bcf9997f-26g8t}
NAMESPACE=${2:-mcp-gateway}

# Get pod details
echo "Getting details for pod $POD_NAME in namespace $NAMESPACE..."
POD_INFO=$(kubectl describe pod $POD_NAME -n $NAMESPACE)
CONTAINER_ID=$(echo "$POD_INFO" | grep "Container ID:" | head -1 | awk -F// '{print $2}' | cut -d':' -f1)
NODE_NAME=$(echo "$POD_INFO" | grep "Node:" | awk '{print $2}' | cut -d'/' -f1)

echo "Container ID: $CONTAINER_ID"
echo "Node Name: $NODE_NAME"

# Check if logs exist in CloudWatch
echo "Checking CloudWatch logs..."

# Try to find logs in the EKS cluster log group
CLUSTER_NAME=$(kubectl config view --minify -o jsonpath='{.clusters[0].name}' | cut -d'/' -f2)
echo "Cluster name: $CLUSTER_NAME"

# Look for logs in various potential locations
LOG_GROUPS=(
  "/aws/eks/$CLUSTER_NAME/cluster"
  "/aws/containerinsights/$CLUSTER_NAME/application"
  "/aws/containerinsights/$CLUSTER_NAME/dataplane"
  "/aws/eks/$CLUSTER_NAME/pods"
  "/aws/fargate/eks/$CLUSTER_NAME"
)

for LOG_GROUP in "${LOG_GROUPS[@]}"; do
  echo "Checking log group: $LOG_GROUP"
  
  # Check if log group exists
  if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --query "logGroups[*].logGroupName" --output text | grep -q "$LOG_GROUP"; then
    echo "Log group $LOG_GROUP exists, checking for log streams..."
    
    # Look for log streams that might contain our pod logs
    STREAMS=$(aws logs describe-log-streams --log-group-name "$LOG_GROUP" --log-stream-name-prefix "$NAMESPACE" --max-items 10 --query "logStreams[*].logStreamName" --output text)
    
    if [ -n "$STREAMS" ]; then
      echo "Found streams in $LOG_GROUP:"
      echo "$STREAMS"
      
      # Get logs from the first matching stream
      FIRST_STREAM=$(echo "$STREAMS" | head -1)
      echo "Fetching logs from stream: $FIRST_STREAM"
      aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$FIRST_STREAM" --limit 100 --query "events[*].message" --output text
      
      echo "Logs retrieved from $LOG_GROUP/$FIRST_STREAM"
      exit 0
    fi
  fi
done

echo "No logs found in standard locations. Creating new log group for future logging..."
echo "To view logs in the future, check CloudWatch Logs under /aws/eks/mcp-gateway-pods"
echo "Note: You may need to restart the pod for logging to take effect with the new ConfigMap"

echo "To restart the pod, run:"
echo "kubectl rollout restart deployment/mcp-gateway-registry-new -n mcp-gateway"
