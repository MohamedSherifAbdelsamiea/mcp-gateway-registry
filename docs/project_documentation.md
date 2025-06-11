# MCP Gateway Registry Project Documentation

## Project Overview

The MCP Gateway Registry is a centralized service management system that transforms chaotic service connections into an organized registry. It provides a unified interface for managing, monitoring, and accessing various microservices within the MCP (Multi-Cloud Platform) ecosystem.

## Current Deployment Status

The deployment is currently experiencing issues that have been identified and resolved:

1. **OOMKilled Errors**: Pods were being terminated due to insufficient memory allocation (0.25vCPU 0.5GB)
2. **Network Connectivity Issues**: ALB to pod communication problems
3. **DNS Configuration**: Domain name resolution issues for mcp-test.v2n2x.com

## Architecture

The MCP Gateway Registry follows a hub-and-spoke architecture:
- **Gateway**: Central component that routes and manages traffic
- **Registry**: Database of available services with metadata
- **API Endpoints**: RESTful interfaces for service management
- **WebSocket**: Real-time health status updates

## Infrastructure Components

### AWS Resources
- **EKS Cluster**: mcp-gateway-eks-cluster
- **Fargate Profiles**: mcp-gateway-fargate
- **ECR Repository**: mcp-gateway-registry
- **Application Load Balancer**: mcp-gateway-alb
- **Security Groups**:
  - mcp-gateway-alb-sg (ALB security group)
  - eks-cluster-sg-mcp-gateway-eks-cluster (EKS security group)
- **DNS**: mcp-test.v2n2x.com (CNAME to ALB)
- **SSL Certificate**: ACM certificate for mcp-test.v2n2x.com

### Kubernetes Resources
- **Namespace**: mcp-gateway
- **Deployment**: mcp-gateway-registry-new
- **Service**: mcp-gateway-registry (NodePort)
- **Pods**: Running with 1vCPU 2GB resources

## Key Issues and Solutions

### 1. Memory Allocation
**Issue**: Pods were being terminated with OOMKilled errors due to insufficient memory.
**Solution**: Created a new deployment with increased resources (1vCPU 2GB).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-gateway-registry-new
  namespace: mcp-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-gateway-registry
  template:
    metadata:
      labels:
        app: mcp-gateway-registry
      annotations:
        CapacityProvisioned: "1vCPU 2GB"
    spec:
      containers:
      - name: mcp-gateway-registry
        image: 338293206254.dkr.ecr.us-east-1.amazonaws.com/mcp-gateway-registry:4e41864e857f572380f05aad51145dbf9ddf5a41
        ports:
        - containerPort: 7860
        env:
        - name: ADMIN_USER
          value: "admin"
        - name: ADMIN_PASSWORD
          value: "123"
        resources:
          requests:
            memory: "1Gi"
            cpu: "0.5"
          limits:
            memory: "2Gi"
            cpu: "1"
```

### 2. Network Connectivity
**Issue**: ALB health checks failing with "Target.Timeout" errors.
**Solution**: 
- Updated ALB target group health check settings to be more lenient
- Modified health check path to "/login"
- Updated accepted HTTP status codes to include 307, 405

### 3. DNS Configuration
**Issue**: Domain name mcp-test.v2n2x.com not resolving.
**Solution**: Created CNAME record in Route 53 pointing to the ALB DNS name.

```
mcp-test.v2n2x.com. 300 IN CNAME mcp-gateway-alb-1589071366.us-east-1.elb.amazonaws.com.
```

### 4. AWS Load Balancer Controller Webhook Issues
**Issue**: Add-ons like Prometheus Node Exporter, AWS Distro for OpenTelemetry, and Amazon CloudWatch Observability failing with webhook errors.
**Solution**: 
- AWS Load Balancer Controller requires EC2 nodes and cannot run properly on Fargate due to networking limitations
- Created a dedicated node group for running the AWS Load Balancer Controller:

```bash
# Create a dedicated node group for the AWS Load Balancer Controller
aws eks create-nodegroup \
  --cluster-name mcp-gateway-eks-cluster \
  --nodegroup-name alb-controller-ng \
  --scaling-config minSize=1,maxSize=2,desiredSize=1 \
  --instance-types t3.medium \
  --subnets subnet-031f6710f7f128203 subnet-022d1464b76cef18b \
  --node-role arn:aws:iam::338293206254:role/EksNodeRole
```

- Reinstalled the AWS Load Balancer Controller using Helm to ensure proper webhook configuration:

```bash
# Reinstall AWS Load Balancer Controller with Helm
helm upgrade aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=mcp-gateway-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  -n kube-system
```

## API Documentation

The MCP Gateway Registry provides the following API endpoints:

### Authentication
- `GET /login`: Display login form
- `POST /login`: Authenticate user and obtain session cookie
- `POST /logout`: Log out user and invalidate session

### Server Management
- `POST /register`: Register a new service
- `POST /toggle/{service_path}`: Enable/disable a service
- `POST /edit/{service_path}`: Update service details

### API Endpoints
- `GET /api/server_details/{service_path}`: Get service details
- `GET /api/tools/{service_path}`: Get service tools
- `POST /api/refresh/{service_path}`: Refresh service health check

### WebSocket Endpoints
- `WebSocket /ws/health_status`: Real-time health status updates

## Monitoring and Troubleshooting

### Health Check Commands
```bash
# Check pod status
kubectl get pods -n mcp-gateway -o wide

# Check pod logs (for non-Fargate pods)
kubectl logs -n mcp-gateway <pod-name>

# Check Fargate pod logs in CloudWatch
aws logs get-log-events --log-group-name /aws/eks/mcp-gateway-pods --log-stream-name fargate-<pod-id>

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:338293206254:targetgroup/mcp-gateway-tg/18ec9cffd9008a39

# Test connectivity
curl -I https://mcp-test.v2n2x.com
curl -u admin:123 https://mcp-test.v2n2x.com/api/server_details/all
```

### Common Issues and Solutions

1. **OOMKilled Errors**:
   - Increase memory allocation in deployment
   - Check application memory usage patterns

2. **ALB Target Health Issues**:
   - Verify security group rules
   - Check if application is running on expected port
   - Adjust health check settings

3. **DNS Configuration Issues**:
   - Verify CNAME record exists and points to correct ALB
   - Check for DNS propagation delays

## Future Improvements

1. Implement proper resource limits based on actual usage patterns
2. Set up monitoring and alerting for pod restarts and OOM events
3. Configure auto-scaling based on CPU/memory usage
4. Implement proper secrets management for credentials
5. Add health probes to the deployment specification