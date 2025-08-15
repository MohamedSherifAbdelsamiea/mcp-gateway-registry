import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EfsCSIDriverProps {
  cluster: eks.ICluster;
}

export class EfsCSIDriver extends Construct {
  constructor(scope: Construct, id: string, props: EfsCSIDriverProps) {
    super(scope, id);

    // Create IAM role for the EFS CSI driver
    const efsCSIDriverRole = new iam.Role(this, 'EfsCSIDriverRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy')
      ]
    });

    // Add the EFS CSI driver add-on to the cluster
    const efsCSIDriver = new eks.CfnAddon(this, 'EfsCSIDriver', {
      addonName: 'aws-efs-csi-driver',
      clusterName: props.cluster.clusterName,
      serviceAccountRoleArn: efsCSIDriverRole.roleArn,
      resolveConflicts: 'OVERWRITE'
    });

    // Create a storage class for EFS
    const efsStorageClass = props.cluster.addManifest('EfsStorageClass', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: 'efs-sc'
      },
      provisioner: 'efs.csi.aws.com',
      parameters: {
        provisioningMode: 'efs-ap',
        fileSystemId: cdk.Fn.importValue('EfsFileSystemId'),
        directoryPerms: '700'
      }
    });

    // Ensure the storage class is created after the EFS CSI driver is installed
    efsStorageClass.node.addDependency(efsCSIDriver);
  }
}
