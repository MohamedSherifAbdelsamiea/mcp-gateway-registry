import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { KubectlV28Layer } from '@aws-cdk/lambda-layer-kubectl-v28';
import { Construct } from 'constructs';
import { AwsSolutionsChecks } from 'cdk-nag';
import { NagSuppressions } from 'cdk-nag';
import { EfsCSIDriver } from './efs-csi-driver';
import { RegistryDeployment } from './k8s-manifests/registry-deployment-updated';
import { AuthServerDeployment } from './k8s-manifests/auth-server-deployment-updated';
import { CurrentTimeServerDeployment } from './k8s-manifests/currenttime-server-deployment';
import { FinInfoServerDeployment } from './k8s-manifests/fininfo-server-deployment';
import { FakeToolsServerDeployment } from './k8s-manifests/faketools-server-deployment';
import { McpGatewayServerDeployment } from './k8s-manifests/mcpgw-server-deployment';
import { EfsPvc } from './k8s-manifests/efs-pvc';
import { AlbIngress } from './k8s-manifests/alb-ingress';

export interface McpgwCompleteInfrastructureStackProps extends cdk.StackProps {
  domainName: string;
  adminPassword: string;
  adminUser?: string;  // Added adminUser property
  hostedZoneId?: string;
  certificateArn?: string;
  createCertificate?: boolean;
  
  // VPC Configuration
  vpcCidr?: string;
  maxAzs?: number;
  
  // EKS Configuration (Fargate-based)
  clusterName?: string;
  kubernetesVersion?: eks.KubernetesVersion;
  // Note: Fargate doesn't use node instance types, min/max/desired nodes
  
  // EFS Configuration
  efsPerformanceMode?: efs.PerformanceMode;
  efsThroughputMode?: efs.ThroughputMode;
  
  // Cognito Configuration
  cognitoUserPoolName?: string;
  cognitoCallbackUrls?: string[];
  cognitoLogoutUrls?: string[];
  
  // Deployment Configuration
  deployApplications?: boolean;  // If false, only deploy infrastructure (VPC, EKS, EFS, Cognito)
}

export class McpgwCompleteInfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: eks.FargateCluster;
  public readonly efsFileSystem: efs.FileSystem;
  public readonly certificate: acm.ICertificate;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly m2mClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly resourceServer: cognito.UserPoolResourceServer;

  constructor(scope: Construct, id: string, props: McpgwCompleteInfrastructureStackProps) {
    super(scope, id, props);

    // Apply CDK Nag for security best practices (temporarily disabled for deployment)
    // cdk.Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));

    // Set stack description based on deployment mode
    this.templateOptions.description = props.deployApplications !== false 
      ? 'Complete MCP Gateway Registry Infrastructure (VPC + EKS + EFS + Certificate + Cognito + Application)'
      : 'MCP Gateway Registry Infrastructure Only (VPC + EKS + EFS + Certificate + Cognito)';

    // Create VPC
    this.vpc = this.createVpc(props);
    
    // Create EFS File System
    this.efsFileSystem = this.createEfsFileSystem(props);
    
    // Create EKS Cluster
    this.cluster = this.createEksCluster(props);
    
    // Create SSL Certificate
    this.certificate = this.createCertificate(props);
    
    // Create Cognito User Pool and related resources
    const cognitoResources = this.createCognitoUserPool(props);
    this.userPool = cognitoResources.userPool;
    this.userPoolClient = cognitoResources.userPoolClient;
    this.m2mClient = cognitoResources.m2mClient;
    this.userPoolDomain = cognitoResources.userPoolDomain;
    this.resourceServer = cognitoResources.resourceServer;
    
    // Install essential EKS addons (core infrastructure only)
    this.installCoreEksAddons();
    
    // Install AWS Load Balancer Controller
    this.installAwsLoadBalancerController();
    
    // Install EFS CSI Driver
    this.installEfsCsiDriver();
    
    // Deploy monitoring and application components (only if deployApplications is true)
    if (props.deployApplications !== false) {
      // Create required namespaces first
      this.createRequiredNamespaces();
      
      // Add application-specific Fargate profiles
      this.addApplicationFargateProfiles(this.cluster);
      
      // Enable monitoring components
      this.enableContainerInsights();
      
      // Deploy MCP Gateway microservices
      this.deployMcpGatewayMicroservices(props);
    }
    
    // Create outputs
    this.createOutputs(props);
  }

  /**
   * Generate a unique service account name to avoid conflicts
   * @param baseName The base name for the service account
   * @returns A unique service account name with stack identifier
   */
  private generateUniqueServiceAccountName(baseName: string): string {
    return `${baseName}-${this.stackName.toLowerCase()}`;
  }

  private createVpc(props: McpgwCompleteInfrastructureStackProps): ec2.Vpc {
    const vpc = new ec2.Vpc(this, 'McpVpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.vpcCidr || '10.0.0.0/16'),
      maxAzs: props.maxAzs || 3,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
      natGateways: 1, // Cost optimization - use 1 NAT gateway
    });

    // Add VPC Flow Logs for security monitoring
    new ec2.FlowLog(this, 'McpVpcFlowLog', {
      resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
    });

    return vpc;
  }

  private createEfsFileSystem(props: McpgwCompleteInfrastructureStackProps): efs.FileSystem {
    const fileSystem = new efs.FileSystem(this, 'McpEfs', {
      vpc: this.vpc,
      performanceMode: props.efsPerformanceMode || efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: props.efsThroughputMode || efs.ThroughputMode.BURSTING,
      encrypted: true,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
    });

    // Create access point for MCP Gateway
    new efs.AccessPoint(this, 'McpEfsAccessPoint', {
      fileSystem,
      path: '/mcp-gateway',
      createAcl: {
        ownerUid: '1000',
        ownerGid: '1000',
        permissions: '755',
      },
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
    });

    return fileSystem;
  }

  private createEksCluster(props: McpgwCompleteInfrastructureStackProps): eks.FargateCluster {
    // Create EKS cluster with Fargate
    const cluster = new eks.FargateCluster(this, 'McpCluster', {
      version: props.kubernetesVersion || eks.KubernetesVersion.V1_28,
      clusterName: props.clusterName || 'mcp-gateway-registry',
      vpc: this.vpc,
      kubectlLayer: new KubectlV28Layer(this, 'KubectlLayer'),
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
      // Default Fargate profile for kube-system namespace
      defaultProfile: {
        fargateProfileName: 'default-fargate-profile',
        selectors: [
          { namespace: 'default' },
          { namespace: 'kube-system' }
        ],
        subnetSelection: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      },
    });

    // Add core Fargate profiles (only for essential namespaces)
    this.addCoreFargateProfiles(cluster);

    // Allow EFS access from Fargate pods
    this.efsFileSystem.connections.allowDefaultPortFrom(cluster);

    return cluster;
  }

  private addCoreFargateProfiles(cluster: eks.FargateCluster) {
    // Only create core Fargate profiles needed for infrastructure
    // Application-specific profiles are created later if deployApplications is true
  }

  private addApplicationFargateProfiles(cluster: eks.FargateCluster) {
    // Fargate profile for monitoring components
    cluster.addFargateProfile('MonitoringProfile', {
      selectors: [
        { 
          namespace: 'amazon-cloudwatch'
        }
      ],
      fargateProfileName: 'monitoring-profile',
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Fargate profile for MCP Gateway application
    cluster.addFargateProfile('ApplicationProfile', {
      selectors: [
        { 
          namespace: 'kubeflow-user-example-com'
        }
      ],
      fargateProfileName: 'application-profile',
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });
  }

  private createCertificate(props: McpgwCompleteInfrastructureStackProps): acm.ICertificate {
    // If certificate ARN is provided, use existing certificate
    if (props.certificateArn) {
      return acm.Certificate.fromCertificateArn(this, 'ExistingCertificate', props.certificateArn);
    }

    // Create new certificate with DNS validation
    if (props.hostedZoneId) {
      // Use Route53 hosted zone for DNS validation
      const hostedZone = route53.HostedZone.fromHostedZoneId(this, 'HostedZone', props.hostedZoneId);
      
      return new acm.Certificate(this, 'McpGatewayCertificate', {
        domainName: props.domainName,
        subjectAlternativeNames: [`*.${props.domainName}`],
        validation: acm.CertificateValidation.fromDns(hostedZone),
        certificateName: `mcp-gateway-${props.domainName}`,
      });
    } else {
      // Create certificate with DNS validation (manual)
      const certificate = new acm.Certificate(this, 'McpGatewayCertificate', {
        domainName: props.domainName,
        subjectAlternativeNames: [`*.${props.domainName}`],
        validation: acm.CertificateValidation.fromDns(),
        certificateName: `mcp-gateway-${props.domainName}`,
      });

      // Output DNS validation records for manual setup
      new cdk.CfnOutput(this, 'CertificateDnsValidationRecords', {
        value: `Check AWS Console ACM for DNS validation records for ${props.domainName}`,
        description: 'DNS validation records for SSL certificate',
      });

      return certificate;
    }
  }

  private createCognitoUserPool(props: McpgwCompleteInfrastructureStackProps): {
    userPool: cognito.UserPool;
    userPoolClient: cognito.UserPoolClient;
    m2mClient: cognito.UserPoolClient;
    userPoolDomain: cognito.UserPoolDomain;
    resourceServer: cognito.UserPoolResourceServer;
  } {
    // Create Cognito User Pool
    const userPool = new cognito.UserPool(this, 'McpUserPool', {
      userPoolName: props.cognitoUserPoolName || `mcp-gateway-users-${props.clusterName}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development
    });

    // Create User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'McpUserPoolClient', {
      userPool,
      userPoolClientName: 'mcp-gateway-client',
      generateSecret: true,
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.custom('aws.cognito.signin.user.admin'),
        ],
        callbackUrls: props.cognitoCallbackUrls || [
          `http://localhost:9090/callback`,
          `http://localhost/oauth2/callback/cognito`,
          `http://localhost:8888/oauth2/callback/cognito`,
          `https://${props.domainName}/oauth2/callback/cognito`,
        ],
        logoutUrls: props.cognitoLogoutUrls || [
          `https://${props.domainName}/auth/logout`,
          `https://${props.domainName}/logout`,
        ],
      },
    });

    // Create admin user group
    const adminGroup = new cognito.CfnUserPoolGroup(this, 'McpAdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'mcp-registry-admin',
      description: 'Admin group for MCP Registry users',
    });

    // Create regular user group
    const userGroup = new cognito.CfnUserPoolGroup(this, 'McpUserGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'mcp-registry-user',
      description: 'Regular user group for MCP Registry',
    });

    // Create Resource Server for M2M authentication
    const readScope = new cognito.ResourceServerScope({
      scopeName: 'read',
      scopeDescription: 'Read access to all MCP servers',
    });
    
    const executeScope = new cognito.ResourceServerScope({
      scopeName: 'execute', 
      scopeDescription: 'Execute access to all MCP servers',
    });

    const resourceServer = new cognito.UserPoolResourceServer(this, 'McpResourceServer', {
      userPool,
      identifier: 'mcp-servers-unrestricted',
      userPoolResourceServerName: 'MCP Servers Unrestricted',
      scopes: [readScope, executeScope],
    });

    // Create M2M App Client for agents
    const m2mClient = new cognito.UserPoolClient(this, 'McpM2MClient', {
      userPool,
      userPoolClientName: 'mcp-agent-client',
      generateSecret: true,
      authFlows: {
        userSrp: false,
        userPassword: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: false,
          implicitCodeGrant: false,
          clientCredentials: true, // Enable M2M flow
        },
        scopes: [
          cognito.OAuthScope.resourceServer(resourceServer, readScope),
          cognito.OAuthScope.resourceServer(resourceServer, executeScope),
        ],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Create User Pool Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'McpUserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `mcp-gateway-${props.clusterName}`,
      },
    });

    // Create admin user
    const adminUser = new cognito.CfnUserPoolUser(this, 'McpAdminUser', {
      userPoolId: userPool.userPoolId,
      username: 'admin',
      messageAction: 'SUPPRESS',
      userAttributes: [
        {
          name: 'email',
          value: `admin@${props.domainName}`,
        },
        {
          name: 'email_verified',
          value: 'true',
        },
      ],
    });

    // Add admin user to admin group
    new cognito.CfnUserPoolUserToGroupAttachment(this, 'AdminUserGroupAttachment', {
      userPoolId: userPool.userPoolId,
      username: adminUser.username!,
      groupName: adminGroup.groupName!,
    });

    return {
      userPool,
      userPoolClient,
      m2mClient,
      userPoolDomain,
      resourceServer,
    };
  }

  private installCoreEksAddons() {
    // Install Core EKS Managed Addons (essential for cluster operation)
    this.installManagedAddons();
    
    // Install Metrics Server (essential for HPA and resource monitoring)
    this.installMetricsServer();
    
    // Install External DNS (essential for ingress)
    this.installExternalDns();
  }

  private installManagedAddons() {
    // Core DNS - Essential for service discovery
    // Use specific version compatible with EKS 1.28 and Fargate
    new eks.CfnAddon(this, 'CoreDnsAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'coredns',
      addonVersion: 'v1.10.1-eksbuild.4', // Default version for EKS 1.28
      resolveConflicts: 'OVERWRITE',
    });

    // Note: kube-proxy and VPC CNI are automatically managed by Fargate
    // No need to install them separately for Fargate clusters

    // Amazon EKS Pod Identity Agent - Still useful for Fargate
    new eks.CfnAddon(this, 'PodIdentityAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'eks-pod-identity-agent',
      resolveConflicts: 'OVERWRITE',
    });

    // EBS CSI Driver - NOT COMPATIBLE WITH FARGATE-ONLY CLUSTERS
    // Commented out because EBS CSI driver requires EC2 nodes to run controller pods
    // Fargate clusters use EFS for persistent storage instead of EBS volumes
    // 
    // const ebsCsiServiceAccount = this.cluster.addServiceAccount('EbsCsiController', {
    //   name: this.generateUniqueServiceAccountName('ebs-csi-controller-sa'),
    //   namespace: 'kube-system',
    // });
    //
    // ebsCsiServiceAccount.role.addManagedPolicy(
    //   iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy')
    // );
    //
    // new eks.CfnAddon(this, 'EbsCsiAddon', {
    //   clusterName: this.cluster.clusterName,
    //   addonName: 'aws-ebs-csi-driver',
    //   resolveConflicts: 'OVERWRITE',
    //   serviceAccountRoleArn: ebsCsiServiceAccount.role.roleArn,
    // });
  }

  private installMetricsServer() {
    this.cluster.addHelmChart('MetricsServer', {
      chart: 'metrics-server',
      repository: 'https://kubernetes-sigs.github.io/metrics-server/',
      namespace: 'kube-system',
      release: 'metrics-server',
      version: '3.12.1',
    });
  }

  private installExternalDns() {
    // Use unique service account name to avoid conflicts
    const uniqueServiceAccountName = this.generateUniqueServiceAccountName('external-dns');
    const externalDnsServiceAccount = this.cluster.addServiceAccount('ExternalDns', {
      name: uniqueServiceAccountName,
      namespace: 'kube-system',
    });

    // Add Route53 permissions for External DNS
    const externalDnsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'route53:ChangeResourceRecordSets',
        'route53:ListHostedZones',
        'route53:ListResourceRecordSets',
      ],
      resources: ['*'],
    });

    externalDnsServiceAccount.addToPrincipalPolicy(externalDnsPolicy);

    this.cluster.addHelmChart('ExternalDns', {
      chart: 'external-dns',
      repository: 'https://kubernetes-sigs.github.io/external-dns/',
      namespace: 'kube-system',
      release: 'external-dns',
      version: '1.14.3',
      values: {
        provider: 'aws',
        serviceAccount: {
          create: false,
          name: uniqueServiceAccountName,
        },
      },
    });
  }

  private createRequiredNamespaces() {
    // Create CloudWatch namespace first (before any resources that depend on it)
    this.cluster.addManifest('CloudWatchNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'amazon-cloudwatch',
        labels: {
          name: 'amazon-cloudwatch'
        }
      }
    });

    // Create application namespace
    this.cluster.addManifest('ApplicationNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'kubeflow-user-example-com',
        labels: {
          name: 'kubeflow-user-example-com'
        }
      }
    });
  }

  private enableContainerInsights() {
    // Note: amazon-cloudwatch namespace is created in createRequiredNamespaces()
    
    // For Fargate, Container Insights is enabled differently
    // We use Fluent Bit as a sidecar or via FireLens
    // Use unique service account names to avoid conflicts
    const cloudWatchServiceAccount = this.cluster.addServiceAccount('CloudWatchAgent', {
      name: this.generateUniqueServiceAccountName('cloudwatch-agent'),
      namespace: 'amazon-cloudwatch',
    });

    cloudWatchServiceAccount.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
    );

    // Install Fluent Bit for Fargate logging
    const fluentBitServiceAccount = this.cluster.addServiceAccount('FluentBit', {
      name: this.generateUniqueServiceAccountName('fluent-bit'),
      namespace: 'amazon-cloudwatch',
    });

    fluentBitServiceAccount.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess')
    );

    // Deploy Fluent Bit as a deployment (not DaemonSet for Fargate)
    this.cluster.addManifest('FluentBitDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'fluent-bit',
        namespace: 'amazon-cloudwatch',
        labels: {
          app: 'fluent-bit'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'fluent-bit'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'fluent-bit'
            }
          },
          spec: {
            serviceAccountName: this.generateUniqueServiceAccountName('fluent-bit'),
            containers: [{
              name: 'fluent-bit',
              image: 'public.ecr.aws/aws-observability/aws-for-fluent-bit:stable',
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '100Mi'
                },
                limits: {
                  cpu: '200m',
                  memory: '200Mi'
                }
              },
              env: [
                {
                  name: 'AWS_REGION',
                  value: this.region
                },
                {
                  name: 'CLUSTER_NAME',
                  value: this.cluster.clusterName
                }
              ]
            }]
          }
        }
      }
    });
  }

  private installAwsLoadBalancerController() {
    // Use unique service account name to avoid conflicts
    const uniqueServiceAccountName = this.generateUniqueServiceAccountName('aws-load-balancer-controller');
    const albServiceAccount = this.cluster.addServiceAccount('AWSLoadBalancerController', {
      name: uniqueServiceAccountName,
      namespace: 'kube-system',
    });

    albServiceAccount.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('ElasticLoadBalancingFullAccess')
    );

    this.cluster.addHelmChart('AWSLoadBalancerController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      release: 'aws-load-balancer-controller',
      values: {
        clusterName: this.cluster.clusterName,
        serviceAccount: {
          create: false,
          name: uniqueServiceAccountName,
        },
      },
    });
  }

  private installEfsCsiDriver() {
    // Use unique service account name to avoid conflicts
    const efsCsiServiceAccount = this.cluster.addServiceAccount('EfsCsiController', {
      name: this.generateUniqueServiceAccountName('efs-csi-controller-sa'),
      namespace: 'kube-system',
    });

    efsCsiServiceAccount.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientFullAccess')
    );

    // Install EFS CSI Driver using Helm
    this.cluster.addHelmChart('AwsEfsCsiDriver', {
      chart: 'aws-efs-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/aws-efs-csi-driver/',
      namespace: 'kube-system',
      release: 'aws-efs-csi-driver',
      values: {
        controller: {
          serviceAccount: {
            create: false,
            name: efsCsiServiceAccount.serviceAccountName,
          },
        },
        node: {
          serviceAccount: {
            create: false,
            name: efsCsiServiceAccount.serviceAccountName,
          },
        },
      },
    });

    // Add EFS Storage Class for Fargate
    this.cluster.addManifest('EfsStorageClass', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: 'efs-sc',
      },
      provisioner: 'efs.csi.aws.com',
      parameters: {
        provisioningMode: 'efs-ap',
        fileSystemId: this.efsFileSystem.fileSystemId,
        directoryPerms: '755',
      },
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'Immediate',
    });

    // Create PersistentVolume for EFS
    const pv = this.cluster.addManifest('EfsPersistentVolume', {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: {
        name: 'efs-pv',
      },
      spec: {
        capacity: {
          storage: '5Gi',
        },
        volumeMode: 'Filesystem',
        accessModes: ['ReadWriteMany'],
        persistentVolumeReclaimPolicy: 'Retain',
        storageClassName: 'efs-sc',
        csi: {
          driver: 'efs.csi.aws.com',
          volumeHandle: this.efsFileSystem.fileSystemId,
          volumeAttributes: {
            path: '/mcp-gateway',
          },
        },
      },
    });
  }

  private deployMcpGatewayMicroservices(props: McpgwCompleteInfrastructureStackProps) {
    const namespace = 'mcp-registry';
    
    // Create namespace
    this.cluster.addManifest('McpRegistryNamespace', {
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

    // Create Fargate profile for MCP Registry
    const fargateProfile = new eks.FargateProfile(this, 'McpRegistryFargateProfile', {
      cluster: this.cluster,
      selectors: [
        { namespace: namespace }
      ],
      podExecutionRole: new iam.Role(this, 'McpClusterFargateProfile', {
        assumedBy: new iam.ServicePrincipal('eks-fargate-pods.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSFargatePodExecutionRolePolicy'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonElasticFileSystemClientFullAccess')
        ]
      })
    });

    // Create EFS PVC for shared storage
    new EfsPvc(this, 'EfsPvc', {
      cluster: this.cluster,
      namespace,
      efsFileSystemId: this.efsFileSystem.fileSystemId
    });

    // Create ConfigMap with all required configuration
    const secretKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    this.cluster.addManifest('McpGatewayConfigMap', {
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
        ADMIN_USER: props.adminUser || 'admin',
        SECRET_KEY: `auto-generated-secret-key-cdk-${Date.now()}`,
        AWS_REGION: this.region,
        AUTH_SERVER_URL: 'http://auth-server:8888',
        REGISTRY_URL: 'http://registry:7860',
        MCPGW_SERVER_URL: 'http://mcpgw-server:8003',
        CURRENTTIME_SERVER_URL: 'http://currenttime-server:8000',
        FININFO_SERVER_URL: 'http://fininfo-server:8001',
        FAKETOOLS_SERVER_URL: 'http://faketools-server:8002',
        DOMAIN_NAME: props.domainName,
        EFS_FILE_SYSTEM_ID: this.efsFileSystem.fileSystemId,
        CLUSTER_NAME: this.cluster.clusterName
      }
    });

    // Create Secret with sensitive data
    this.cluster.addManifest('McpGatewaySecret', {
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
      cluster: this.cluster,
      namespace,
      adminUser: props.adminUser || 'admin',
      adminPassword: props.adminPassword,
      secretKey,
      registryUrl: 'http://registry:7860',
      authServerExternalUrl: `https://${props.domainName}`,
      cognitoClientId: this.userPoolClient.userPoolClientId,
      cognitoClientSecret: this.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      cognitoUserPoolId: this.userPool.userPoolId,
      awsRegion: this.region
    });

    // Deploy Registry Service
    new RegistryDeployment(this, 'RegistryDeployment', {
      cluster: this.cluster,
      namespace,
      adminUser: props.adminUser || 'admin',
      adminPassword: props.adminPassword,
      secretKey,
      domainName: props.domainName,
      authServerUrl: 'http://auth-server:8888',
      registryUrl: 'http://registry:7860',
      efsFileSystemId: this.efsFileSystem.fileSystemId,
      authServerExternalUrl: `https://${props.domainName}`,
      cognitoClientId: this.userPoolClient.userPoolClientId,
      cognitoClientSecret: this.userPoolClient.userPoolClientSecret.unsafeUnwrap(),
      cognitoUserPoolId: this.userPool.userPoolId,
      awsRegion: this.region
    });

    // Deploy MCP Tool Servers
    new CurrentTimeServerDeployment(this, 'CurrentTimeServerDeployment', {
      cluster: this.cluster,
      namespace,
      efsFileSystemId: this.efsFileSystem.fileSystemId
    });

    new FinInfoServerDeployment(this, 'FinInfoServerDeployment', {
      cluster: this.cluster,
      namespace,
      efsFileSystemId: this.efsFileSystem.fileSystemId
    });

    new FakeToolsServerDeployment(this, 'FakeToolsServerDeployment', {
      cluster: this.cluster,
      namespace,
      efsFileSystemId: this.efsFileSystem.fileSystemId
    });

    // Deploy MCP Gateway Server
    new McpGatewayServerDeployment(this, 'McpGatewayServerDeployment', {
      cluster: this.cluster,
      namespace,
      efsFileSystemId: this.efsFileSystem.fileSystemId
    });

    // Deploy ALB Ingress
    new AlbIngress(this, 'AlbIngress', {
      cluster: this.cluster,
      namespace,
      domainName: props.domainName,
      certificateArn: this.certificate.certificateArn
    });
  }

  private createOutputs(props: McpgwCompleteInfrastructureStackProps) {
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
    });

    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster Endpoint',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemId', {
      value: this.efsFileSystem.fileSystemId,
      description: 'EFS File System ID',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'SSL Certificate ARN',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID (for user authentication)',
    });

    new cdk.CfnOutput(this, 'M2MClientId', {
      value: this.m2mClient.userPoolClientId,
      description: 'Cognito M2M Client ID (for agent authentication)',
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain',
    });

    new cdk.CfnOutput(this, 'ResourceServerIdentifier', {
      value: this.resourceServer.userPoolResourceServerId,
      description: 'Cognito Resource Server Identifier',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: props.domainName,
      description: 'Domain Name',
    });
  }
}
