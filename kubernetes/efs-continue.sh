#!/bin/bash
set -e

# Use existing resources
EFS_SG_ID="sg-07b9e0f4b4b919270"
EFS_ID="fs-0813fd707ce9152cc"
SUBNET_1="subnet-05b991011b46dcebb"
SUBNET_2="subnet-0ceffc2d0c013cf1c"

echo "Using existing security group: $EFS_SG_ID"
echo "Using existing EFS file system: $EFS_ID"

# Check if mount targets already exist
MOUNT_TARGETS=$(aws efs describe-mount-targets --file-system-id $EFS_ID --query "MountTargets[*].MountTargetId" --output text)

if [ -z "$MOUNT_TARGETS" ]; then
  echo "Creating mount targets in subnets..."
  aws efs create-mount-target \
    --file-system-id $EFS_ID \
    --subnet-id $SUBNET_1 \
    --security-groups $EFS_SG_ID

  aws efs create-mount-target \
    --file-system-id $EFS_ID \
    --subnet-id $SUBNET_2 \
    --security-groups $EFS_SG_ID

  echo "Mount targets created. Waiting for them to become available..."
  sleep 30
else
  echo "Mount targets already exist: $MOUNT_TARGETS"
fi

# Install EFS CSI Driver
echo "Installing EFS CSI Driver..."
kubectl apply -k "github.com/kubernetes-sigs/aws-efs-csi-driver/deploy/kubernetes/overlays/stable/?ref=master"

# Create storage class
echo "Creating EFS storage class..."
cat <<EOF | kubectl apply -f -
kind: StorageClass
apiVersion: storage.k8s.io/v1
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: $EFS_ID
  directoryPerms: "700"
EOF

# Create PVC
echo "Creating PVC for MCP Gateway Registry..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mcp-gateway-registry-pvc
  namespace: mcp-gateway
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
EOF

echo "EFS setup complete. File System ID: $EFS_ID"
echo "Now update your deployment to use the PVC."