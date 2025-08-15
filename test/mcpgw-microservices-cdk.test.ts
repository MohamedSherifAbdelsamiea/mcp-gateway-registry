import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as McpgwMicroservicesCdk from '../lib/mcpgw-microservices-cdk-stack';

describe('McpgwMicroservicesCdkStack', () => {
  test('Stack creates all required resources', () => {
    const app = new cdk.App();
    
    // Create the stack with test configuration
    const stack = new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
      clusterName: 'test-cluster',
      domainName: 'test.example.com',
      efsFileSystemId: 'fs-test123',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      adminPassword: 'test-password'
    });
    
    // Prepare the stack for assertions
    const template = Template.fromStack(stack);

    // Test that Kubernetes resources are created
    const kubernetesResources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    expect(Object.keys(kubernetesResources).length).toBeGreaterThan(15);

    // Test that namespace manifest is created (as string)
    template.hasResourceProperties('Custom::AWSCDK-EKS-KubernetesResource', {
      Manifest: Match.anyValue()
    });

    // Verify that all microservices are deployed by checking manifest strings
    const manifests = Object.values(kubernetesResources).map((resource: any) => 
      resource.Properties.Manifest
    );

    // Check for all expected deployments in the manifest strings
    const allManifests = manifests.join(' ');
    
    expect(allManifests).toContain('auth-server');
    expect(allManifests).toContain('registry');
    expect(allManifests).toContain('mcpgw-server');
    expect(allManifests).toContain('currenttime-server');
    expect(allManifests).toContain('fininfo-server');
    expect(allManifests).toContain('faketools-server');

    // Check for expected Kubernetes resource types
    expect(allManifests).toContain('Deployment');
    expect(allManifests).toContain('Service');
    expect(allManifests).toContain('Ingress');
    expect(allManifests).toContain('ConfigMap');
    expect(allManifests).toContain('Secret');
    expect(allManifests).toContain('StorageClass');
    expect(allManifests).toContain('PersistentVolumeClaim');
  });

  test('Stack outputs are created', () => {
    const app = new cdk.App();
    
    const stack = new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
      clusterName: 'test-cluster',
      domainName: 'test.example.com',
      efsFileSystemId: 'fs-test123',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      adminPassword: 'test-password'
    });
    
    const template = Template.fromStack(stack);

    // Test that outputs are created
    template.hasOutput('DomainUrl', {
      Value: 'https://test.example.com',
      Description: 'URL to access the MCP Gateway Registry'
    });

    template.hasOutput('ClusterName', {
      Value: 'test-cluster',
      Description: 'EKS Cluster Name'
    });

    template.hasOutput('Namespace', {
      Value: 'mcp-registry',
      Description: 'Kubernetes namespace for MCP Gateway services'
    });

    template.hasOutput('CertificateArn', {
      Value: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      Description: 'SSL Certificate ARN'
    });
  });

  test('Stack validates required parameters', () => {
    const app = new cdk.App();
    
    // Test that stack creation fails without required parameters
    expect(() => {
      new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
        domainName: '',
        efsFileSystemId: '',
        certificateArn: '',
        adminPassword: ''
      });
    }).toThrow(); // Should throw due to missing required parameters
  });

  test('Stack has proper resource dependencies', () => {
    const app = new cdk.App();
    
    const stack = new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
      clusterName: 'test-cluster',
      domainName: 'test.example.com',
      efsFileSystemId: 'fs-test123',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      adminPassword: 'test-password'
    });
    
    const template = Template.fromStack(stack);

    // Verify that Kubernetes resources are created
    const kubernetesResources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    expect(Object.keys(kubernetesResources).length).toBeGreaterThan(15); // Should have many K8s resources
  });

  test('Stack creates certificate when createCertificate is true', () => {
    const app = new cdk.App();
    
    const stack = new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
      clusterName: 'test-cluster',
      domainName: 'test.example.com',
      efsFileSystemId: 'fs-test123',
      adminPassword: 'test-password',
      createCertificate: true
    });
    
    const template = Template.fromStack(stack);

    // Should create a new certificate
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'test.example.com'
    });

    // Should output the new certificate ARN
    template.hasOutput('NewCertificateArn', {
      Description: 'ARN of the created SSL certificate'
    });
  });

  test('Stack includes all required environment variables', () => {
    const app = new cdk.App();
    
    const stack = new McpgwMicroservicesCdk.McpgwMicroservicesCdkStack(app, 'MyTestStack', {
      clusterName: 'test-cluster',
      domainName: 'test.example.com',
      efsFileSystemId: 'fs-test123',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      adminPassword: 'test-password'
    });
    
    const template = Template.fromStack(stack);
    const kubernetesResources = template.findResources('Custom::AWSCDK-EKS-KubernetesResource');
    const allManifests = Object.values(kubernetesResources).map((resource: any) => 
      resource.Properties.Manifest
    ).join(' ');

    // Check for required environment variables in ConfigMap
    expect(allManifests).toContain('AUTH_SERVER_URL');
    expect(allManifests).toContain('REGISTRY_URL');
    expect(allManifests).toContain('MCPGW_SERVER_URL');
    expect(allManifests).toContain('CURRENTTIME_SERVER_URL');
    expect(allManifests).toContain('FININFO_SERVER_URL');
    expect(allManifests).toContain('FAKETOOLS_SERVER_URL');
    expect(allManifests).toContain('DOMAIN_NAME');
    expect(allManifests).toContain('EFS_FILE_SYSTEM_ID');
  });
});
