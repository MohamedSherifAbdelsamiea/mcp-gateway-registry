#!/bin/bash
set -e

# Variables
VPC_ID="vpc-002d11184d052b5ed"
CLUSTER_SG="sg-0f31d4112628aa75e"
SUBNET_1="subnet-05b991011b46dcebb"
SUBNET_2="subnet-0ceffc2d0c013cf1c"
REGION="us-east-1"
CLUSTER_NAME="mcp-gateway-eks-cluster"

# Create security group for EFS
echo "Creating security group for EFS..."
EFS_SG_ID=$(aws ec2 create-security-group \
  --group-name mcp-gateway-efs-sg \
  --description "Security group for MCP Gateway Registry EFS" \
  --vpc-id $VPC_ID \
  --query "GroupId" \
  --output text)

echo "Created security group: $EFS_SG_ID"

# Allow inbound NFS traffic from the cluster security group
echo "Configuring security group rules..."
aws ec2 authorize-security-group-ingress \
  --group-id $EFS_SG_ID \
  --protocol tcp \
  --port 2049 \
  --source-group $CLUSTER_SG

# Create EFS file system
echo "Creating EFS file system..."
EFS_ID=$(aws efs create-file-system \
  --creation-token mcp-gateway-registry-efs \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --encrypted \
  --tags Key=Name,Value=mcp-gateway-registry-efs \
  --query "FileSystemId" \
  --output text)

echo "Created EFS file system: $EFS_ID"

# Wait for EFS to be available
echo "Waiting for EFS to become available..."
sleep 30

# Create mount targets in both subnets
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