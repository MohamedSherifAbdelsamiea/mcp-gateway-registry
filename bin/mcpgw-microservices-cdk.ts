#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as efs from 'aws-cdk-lib/aws-efs';
import { McpgwMicroservicesCdkStack } from '../lib/mcpgw-microservices-cdk-stack';
import { McpgwCompleteInfrastructureStack } from '../lib/mcpgw-complete-infrastructure-stack';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

const app = new cdk.App();

// Get configuration from context or environment variables
const deploymentMode = app.node.tryGetContext('deploymentMode') || process.env.DEPLOYMENT_MODE || 'complete';
const clusterName = app.node.tryGetContext('clusterName') || process.env.CLUSTER_NAME || 'mcp-gateway-registry';
const domainName = app.node.tryGetContext('domainName') || process.env.DOMAIN_NAME;
const efsFileSystemId = app.node.tryGetContext('efsFileSystemId') || process.env.EFS_FILE_SYSTEM_ID;
const certificateArn = app.node.tryGetContext('certificateArn') || process.env.CERTIFICATE_ARN;
const adminPassword = app.node.tryGetContext('adminPassword') || process.env.ADMIN_PASSWORD;
const hostedZoneId = app.node.tryGetContext('hostedZoneId') || process.env.HOSTED_ZONE_ID;
const createCertificate = app.node.tryGetContext('createCertificate') || process.env.CREATE_CERTIFICATE === 'true';

// Validate required parameters
if (!domainName) {
  throw new Error('domainName is required. Set via context or DOMAIN_NAME environment variable.');
}
if (!adminPassword) {
  throw new Error('adminPassword is required. Set via context or ADMIN_PASSWORD environment variable.');
}

// Deployment mode configuration
if (deploymentMode === 'complete') {
  console.log('🚀 Deploying Complete Infrastructure Stack (VPC + EKS + EFS + Certificate + Cognito + Application)');
  
  // Additional configuration for complete infrastructure
  const vpcCidr = app.node.tryGetContext('vpcCidr') || process.env.VPC_CIDR || '10.0.0.0/16';
  const maxAzs = parseInt(app.node.tryGetContext('maxAzs') || process.env.MAX_AZS || '3');
  const kubernetesVersion = app.node.tryGetContext('kubernetesVersion') || process.env.KUBERNETES_VERSION || '1.28';
  // Note: Fargate doesn't use node instance types or node counts
  
  new McpgwCompleteInfrastructureStack(app, 'McpgwCompleteInfrastructureStack', {
    domainName,
    adminPassword,
    hostedZoneId,
    certificateArn,
    createCertificate: createCertificate || !certificateArn,
    
    // VPC Configuration
    vpcCidr,
    maxAzs,
    
    // EKS Configuration (Fargate-based)
    clusterName,
    kubernetesVersion: kubernetesVersion === '1.28' ? eks.KubernetesVersion.V1_28 : 
                     kubernetesVersion === '1.27' ? eks.KubernetesVersion.V1_27 : 
                     eks.KubernetesVersion.V1_28,
    
    // EFS Configuration
    efsPerformanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    efsThroughputMode: efs.ThroughputMode.BURSTING,
    
    // Cognito Configuration
    cognitoUserPoolName: `mcp-gateway-users-${clusterName}`,
    cognitoCallbackUrls: [
      `http://localhost:9090/callback`,
      `http://localhost/oauth2/callback/cognito`,
      `http://localhost:8888/oauth2/callback/cognito`,
      `https://${domainName}/oauth2/callback/cognito`,
    ],
    cognitoLogoutUrls: [
      `https://${domainName}/auth/logout`,
      `https://${domainName}/logout`,
    ],
    
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'Complete MCP Gateway Registry Infrastructure (VPC + EKS + EFS + Certificate + Cognito + Application)'
  });

} else if (deploymentMode === 'infrastructure-only') {
  console.log('🏗️ Deploying Infrastructure-Only Stack (VPC + EKS + EFS + Certificate + Cognito - no applications)');
  
  // Additional configuration for infrastructure-only
  const vpcCidr = app.node.tryGetContext('vpcCidr') || process.env.VPC_CIDR || '10.0.0.0/16';
  const maxAzs = parseInt(app.node.tryGetContext('maxAzs') || process.env.MAX_AZS || '3');
  const kubernetesVersion = app.node.tryGetContext('kubernetesVersion') || process.env.KUBERNETES_VERSION || '1.28';
  
  new McpgwCompleteInfrastructureStack(app, 'McpgwInfrastructureStackFresh', {
    domainName,
    adminPassword,
    hostedZoneId,
    certificateArn,
    createCertificate: createCertificate || !certificateArn,
    
    // VPC Configuration
    vpcCidr,
    maxAzs,
    
    // EKS Configuration (Fargate-based)
    clusterName,
    kubernetesVersion: kubernetesVersion === '1.28' ? eks.KubernetesVersion.V1_28 : 
                     kubernetesVersion === '1.27' ? eks.KubernetesVersion.V1_27 : 
                     eks.KubernetesVersion.V1_28,
    
    // EFS Configuration
    efsPerformanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
    efsThroughputMode: efs.ThroughputMode.BURSTING,
    
    // Cognito Configuration
    cognitoUserPoolName: `mcp-gateway-users-${clusterName}`,
    cognitoCallbackUrls: [
      `http://localhost:9090/callback`,
      `http://localhost/oauth2/callback/cognito`,
      `http://localhost:8888/oauth2/callback/cognito`,
      `https://${domainName}/oauth2/callback/cognito`,
    ],
    cognitoLogoutUrls: [
      `https://${domainName}/auth/logout`,
      `https://${domainName}/logout`,
    ],
    
    // Infrastructure-only mode: skip application deployment
    deployApplications: false,
    
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'MCP Gateway Registry Infrastructure Only (VPC + EKS + EFS + Certificate + Cognito)'
  });

} else if (deploymentMode === 'application-only') {
  console.log('📦 Deploying Application-Only Stack (requires existing EKS cluster)');
  
  // Validate additional required parameters for application-only mode
  if (!efsFileSystemId) {
    throw new Error('efsFileSystemId is required for application-only mode. Set via context or EFS_FILE_SYSTEM_ID environment variable.');
  }

  new McpgwMicroservicesCdkStack(app, 'McpgwMicroservicesCdkStack', {
    clusterName,
    domainName,
    efsFileSystemId,
    certificateArn,
    adminPassword,
    hostedZoneId,
    createCertificate: createCertificate || !certificateArn,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'MCP Gateway Registry Microservices (Application Only - requires existing infrastructure)'
  });

} else {
  throw new Error(`Invalid deployment mode: ${deploymentMode}. Use 'complete', 'infrastructure-only', or 'application-only'.`);
}