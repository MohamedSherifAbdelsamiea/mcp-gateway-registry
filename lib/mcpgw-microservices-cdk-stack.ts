import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';
import { AuthServerDeployment } from './k8s-manifests/auth-server-deployment-updated';
import { RegistryDeployment } from './k8s-manifests/registry-deployment-updated';
import { CurrentTimeServerDeployment } from './k8s-manifests/currenttime-server-deployment';
import { FinInfoServerDeployment } from './k8s-manifests/fininfo-server-deployment';
import { FakeToolsServerDeployment } from './k8s-manifests/faketools-server-deployment';
import { McpGatewayServerDeployment } from './k8s-manifests/mcpgw-server-deployment';
import { EfsPvc } from './k8s-manifests/efs-pvc';
import { AlbIngress } from './k8s-manifests/alb-ingress';

export interface McpgwMicroservicesCdkStackProps extends cdk.StackProps {
  clusterName?: string;
  domainName: string;
  efsFileSystemId: string;
  certificateArn?: string;
  adminPassword: string;
  adminUser?: string;
  hostedZoneId?: string;
  createCertificate?: boolean;
  // Cognito Configuration
  cognitoClientId?: string;
  cognitoClientSecret?: string;
  cognitoUserPoolId?: string;
}

export class McpgwMicroservicesCdkStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;
  
  constructor(scope: Construct, id: string, props: McpgwMicroservicesCdkStackProps) {
    super(scope, id, props);

    // Handle certificate - create new or use existing
    this.certificate = this.setupCertificate(props);

    // Deploy complete microservices architecture
    this.deployMicroservicesArchitecture(props);

    // Create outputs
    this.createOutputs(props);
  }

  private setupCertificate(props: McpgwMicroservicesCdkStackProps): acm.ICertificate {
    if (props.certificateArn) {
      // Use existing certificate
      return acm.Certificate.fromCertificateArn(this, 'ExistingCertificate', props.certificateArn);
    } else if (props.createCertificate) {
      // Create new certificate
      const certificate = new acm.Certificate(this, 'McpGatewayCertificate', {
        domainName: props.domainName,
        validation: props.hostedZoneId 
          ? acm.CertificateValidation.fromDns(
              route53.HostedZone.fromHostedZoneId(this, 'HostedZone', props.hostedZoneId)
            )
          : acm.CertificateValidation.fromDns()
      });

      new cdk.CfnOutput(this, 'NewCertificateArn', {
        value: certificate.certificateArn,
        description: 'ARN of the created SSL certificate'
      });

      return certificate;
    } else {
      throw new Error('Either certificateArn or createCertificate must be provided');
    }
  }

  private deployMicroservicesArchitecture(props: McpgwMicroservicesCdkStackProps) {
    const clusterName = props.clusterName || 'mcp-gateway-registry';
    const namespace = 'mcp-registry';
    const adminUser = props.adminUser || 'admin';

    // Import existing EKS cluster
    const cluster = eks.Cluster.fromClusterAttributes(this, 'ExistingCluster', {
      clusterName: clusterName,
      kubectlRoleArn: `arn:aws:iam::${this.account}:role/${clusterName}-kubectl-role`
    });

    // Create namespace
    cluster.addManifest('McpRegistryNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
        labels: {
          name: namespace,
          'managed-by': 'cdk'
        }
      }
    });

    // Create EFS PVC for shared storage
    new EfsPvc(this, 'EfsPvc', {
      cluster,
      namespace,
      efsFileSystemId: props.efsFileSystemId
    });

    // Create ConfigMap with all required configuration
    const secretKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    cluster.addManifest('McpGatewayConfigMap', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'mcp-gateway-config',
        namespace: namespace,
        labels: {
          'managed-by': 'cdk'
        }
      },
      data: {
        ADMIN_USER: adminUser,
        SECRET_KEY: `auto-generated-secret-key-cdk-${Date.now()}`,
        AWS_REGION: this.region,
        AUTH_SERVER_URL: 'http://auth-server:8888',
        REGISTRY_URL: 'http://registry:7860',
        MCPGW_SERVER_URL: 'http://mcpgw-server:8003',
        CURRENTTIME_SERVER_URL: 'http://currenttime-server:8000',
        FININFO_SERVER_URL: 'http://fininfo-server:8001',
        FAKETOOLS_SERVER_URL: 'http://faketools-server:8002',
        DOMAIN_NAME: props.domainName,
        EFS_FILE_SYSTEM_ID: props.efsFileSystemId,
        CLUSTER_NAME: clusterName
      }
    });

    // Create Secret with sensitive data
    cluster.addManifest('McpGatewaySecret', {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'mcp-gateway-secrets',
        namespace: namespace,
        labels: {
          'managed-by': 'cdk'
        }
      },
      type: 'Opaque',
      stringData: {
        'admin-password': props.adminPassword,
        'polygon-api-key': '',
        'github-client-id': '',
        'github-client-secret': ''
      }
    });

    // Deploy Auth Server
    new AuthServerDeployment(this, 'AuthServerDeployment', {
      cluster,
      namespace,
      adminUser,
      adminPassword: props.adminPassword,
      secretKey,
      registryUrl: 'http://registry:7860',
      authServerExternalUrl: `https://${props.domainName}`,
      cognitoClientId: props.cognitoClientId || process.env.COGNITO_CLIENT_ID || '',
      cognitoClientSecret: props.cognitoClientSecret || process.env.COGNITO_CLIENT_SECRET || '',
      cognitoUserPoolId: props.cognitoUserPoolId || process.env.COGNITO_USER_POOL_ID || '',
      awsRegion: this.region,
    });

    // Deploy Registry Service
    new RegistryDeployment(this, 'RegistryDeployment', {
      cluster,
      namespace,
      adminUser,
      adminPassword: props.adminPassword,
      secretKey,
      domainName: props.domainName,
      authServerUrl: 'http://auth-server:8888',
      authServerExternalUrl: `https://${props.domainName}`,
      registryUrl: 'http://registry:7860',
      efsFileSystemId: props.efsFileSystemId,
      cognitoClientId: props.cognitoClientId || process.env.COGNITO_CLIENT_ID || '',
      cognitoClientSecret: props.cognitoClientSecret || process.env.COGNITO_CLIENT_SECRET || '',
      cognitoUserPoolId: props.cognitoUserPoolId || process.env.COGNITO_USER_POOL_ID || '',
      awsRegion: this.region,
    });

    // Deploy MCP Tool Servers
    new CurrentTimeServerDeployment(this, 'CurrentTimeServerDeployment', {
      cluster,
      namespace,
      efsFileSystemId: props.efsFileSystemId
    });

    new FinInfoServerDeployment(this, 'FinInfoServerDeployment', {
      cluster,
      namespace,
      efsFileSystemId: props.efsFileSystemId
    });

    new FakeToolsServerDeployment(this, 'FakeToolsServerDeployment', {
      cluster,
      namespace,
      efsFileSystemId: props.efsFileSystemId
    });

    // Deploy MCP Gateway Server
    new McpGatewayServerDeployment(this, 'McpGatewayServerDeployment', {
      cluster,
      namespace,
      efsFileSystemId: props.efsFileSystemId
    });

    // Deploy ALB Ingress
    new AlbIngress(this, 'AlbIngress', {
      cluster,
      namespace,
      domainName: props.domainName,
      certificateArn: this.certificate.certificateArn
    });
  }

  private createOutputs(props: McpgwMicroservicesCdkStackProps) {
    new cdk.CfnOutput(this, 'ClusterName', {
      value: props.clusterName || 'mcp-gateway-registry',
      description: 'EKS Cluster Name'
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: props.domainName,
      description: 'Domain Name'
    });

    new cdk.CfnOutput(this, 'DomainUrl', {
      value: `https://${props.domainName}`,
      description: 'URL to access the MCP Gateway Registry'
    });

    new cdk.CfnOutput(this, 'EfsFileSystemId', {
      value: props.efsFileSystemId,
      description: 'EFS File System ID'
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'SSL Certificate ARN'
    });

    new cdk.CfnOutput(this, 'Namespace', {
      value: 'mcp-registry',
      description: 'Kubernetes namespace for MCP Gateway services'
    });

    new cdk.CfnOutput(this, 'Services', {
      value: JSON.stringify({
        'auth-server': 'http://auth-server:8888',
        'registry': 'http://registry:7860',
        'mcpgw-server': 'http://mcpgw-server:8003',
        'currenttime-server': 'http://currenttime-server:8000',
        'fininfo-server': 'http://fininfo-server:8001',
        'faketools-server': 'http://faketools-server:8002'
      }),
      description: 'Internal service URLs'
    });

    new cdk.CfnOutput(this, 'DeploymentInstructions', {
      value: `
1. Verify EKS cluster access: kubectl get nodes
2. Check namespace: kubectl get ns mcp-registry
3. Monitor deployment: kubectl get pods -n mcp-registry -w
4. Check services: kubectl get svc -n mcp-registry
5. View ingress: kubectl get ingress -n mcp-registry
6. Access application: https://${props.domainName}
      `.trim(),
      description: 'Post-deployment verification steps'
    });
  }
}
