# MCP Gateway Registry Resources

## AWS Resources

### EKS Cluster
- **Name**: mcp-gateway-eks-cluster
- **Version**: 1.27
- **VPC**: vpc-002d11184d052b5ed
- **Subnets**: subnet-031f6710f7f128203, subnet-022d1464b76cef18b
- **Security Group**: sg-0f31d4112628aa75e

### Fargate Profile
- **Name**: mcp-gateway-fargate
- **Namespace**: mcp-gateway
- **Subnets**: subnet-05b991011b46dcebb, subnet-0ceffc2d0c013cf1c
- **Pod Execution Role**: arn:aws:iam::338293206254:role/EksFargatePodExecutionRole

### ECR Repository
- **Name**: mcp-gateway-registry
- **URI**: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry
- **Current Image**: 4e41864e857f572380f05aad51145dbf9ddf5a41

### Application Load Balancer
- **Name**: mcp-gateway-alb
- **DNS Name**: mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com
- **Security Group**: sg-087c93faf3acbcf13
- **Listeners**:
  - HTTP (Port 80) -> Target Group mcp-gateway-tg
  - HTTPS (Port 443) -> Target Group mcp-gateway-tg
- **Certificate ARN**: arn:aws:acm:us-east-1:338293206254:certificate/f0f70158-6f58-42e7-a608-884331fd8c03

### Target Group
- **Name**: mcp-gateway-tg
- **ARN**: arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39
- **Port**: 7860
- **Protocol**: HTTP
- **Health Check Path**: /login
- **Health Check Codes**: 200,302,307,401,404,405

### Security Groups
1. **ALB Security Group (sg-087c93faf3acbcf13)**
   - Inbound: 
     - Port 80 from 0.0.0.0/0
     - Port 443 from 0.0.0.0/0
   - Outbound: All traffic to 0.0.0.0/0

2. **EKS Cluster Security Group (sg-0f31d4112628aa75e)**
   - Inbound:
     - Port 7860 from sg-087c93faf3acbcf13
     - Port 31975 from 0.0.0.0/0
     - Port 31381 from 0.0.0.0/0
   - Outbound: All traffic to 0.0.0.0/0

### Route 53
- **Hosted Zone ID**: Z00677396IM7D3SZ8WND
- **Domain**: v2n2x.com
- **Record**: mcp-test.v2n2x.com -> CNAME -> mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com

### ACM Certificate
- **ARN**: arn:aws:acm:us-east-1:338293206254:certificate/f0f70158-6f58-42e7-a608-884331fd8c03
- **Domain**: mcp-test.v2n2x.com
- **Status**: ISSUED
- **Expiration**: 2026-07-06

## Kubernetes Resources

### Namespace
- **Name**: mcp-gateway

### Deployment
- **Name**: mcp-gateway-registry-new
- **Replicas**: 2
- **Image**: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:4e41864e857f572380f05aad51145dbf9ddf5a41
- **Resources**:
  - Requests: 0.5 CPU, 1Gi Memory
  - Limits: 1 CPU, 2Gi Memory

### Service
- **Name**: mcp-gateway-registry
- **Type**: NodePort
- **Port**: 80 -> 7860
- **NodePort**: 31975

### Pods
- **Count**: 2
- **IPs**: 10.0.3.159, 10.0.4.199
- **Status**: Running