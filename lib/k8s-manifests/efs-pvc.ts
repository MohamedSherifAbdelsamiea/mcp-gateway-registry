import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface EfsPvcProps {
  cluster: eks.ICluster;
  namespace: string;
  efsFileSystemId: string;
}

export class EfsPvc extends Construct {
  constructor(scope: Construct, id: string, props: EfsPvcProps) {
    super(scope, id);

    // EFS Storage Class
    props.cluster.addManifest('EfsStorageClass', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: 'efs-sc',
        labels: {
          'managed-by': 'cdk'
        }
      },
      provisioner: 'efs.csi.aws.com',
      parameters: {
        provisioningMode: 'efs-ap',
        fileSystemId: props.efsFileSystemId,
        directoryPerms: '755',
        gidRangeStart: '1000',
        gidRangeEnd: '2000',
        basePath: '/mcp-gateway'
      },
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'Immediate'
    });

    // EFS Persistent Volume Claim
    props.cluster.addManifest('EfsPvc', {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: 'efs-pvc',
        namespace: props.namespace,
        labels: {
          'managed-by': 'cdk'
        }
      },
      spec: {
        accessModes: ['ReadWriteMany'],
        storageClassName: 'efs-sc',
        resources: {
          requests: {
            storage: '100Gi'
          }
        }
      }
    });
  }
}
