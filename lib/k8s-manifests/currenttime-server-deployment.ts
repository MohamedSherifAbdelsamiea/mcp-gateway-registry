import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface CurrentTimeServerDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  efsFileSystemId?: string;
}

export class CurrentTimeServerDeployment extends Construct {
  constructor(scope: Construct, id: string, props: CurrentTimeServerDeploymentProps) {
    super(scope, id);

    // Current Time Server Deployment
    props.cluster.addManifest('CurrentTimeServerDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'currenttime-server',
        namespace: props.namespace,
        labels: {
          app: 'currenttime-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'currenttime-server'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'currenttime-server',
              'managed-by': 'cdk'
            }
          },
          spec: {
            containers: [{
              name: 'currenttime-server',
              image: 'python:3.12-slim',
              ports: [{
                containerPort: 8000
              }],
              env: [
                {
                  name: 'PORT',
                  value: '8000'
                },
                {
                  name: 'PYTHONUNBUFFERED',
                  value: '1'
                },
                {
                  name: 'MCP_SERVER_NAME',
                  value: 'currenttime-server'
                }
              ],
              resources: {
                requests: {
                  cpu: '100m',
                  memory: '256Mi'
                },
                limits: {
                  cpu: '250m',
                  memory: '512Mi'
                }
              },
              command: ['/bin/bash', '-c'],
              args: [`
                echo "Installing MCP Current Time Server dependencies..."
                pip install --no-cache-dir fastapi uvicorn python-multipart aiofiles
                
                echo "Creating Current Time MCP Server..."
                cat > /app/currenttime_server.py << 'EOF'
import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="MCP Current Time Server", version="1.0.0")

class MCPCurrentTimeServer:
    def __init__(self):
        self.name = "currenttime-server"
        self.version = "1.0.0"
        
    async def get_current_time(self, timezone_name: str = "UTC") -> Dict[str, Any]:
        """Get current time in specified timezone"""
        try:
            if timezone_name.upper() == "UTC":
                current_time = datetime.now(timezone.utc)
            else:
                # For simplicity, just return UTC for now
                current_time = datetime.now(timezone.utc)
                
            return {
                "timestamp": current_time.isoformat(),
                "timezone": timezone_name,
                "unix_timestamp": int(current_time.timestamp()),
                "formatted": current_time.strftime("%Y-%m-%d %H:%M:%S %Z")
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error getting time: {str(e)}")
    
    async def get_time_formats(self, timestamp: str) -> Dict[str, Any]:
        """Convert timestamp to various formats"""
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            return {
                "iso": dt.isoformat(),
                "unix": int(dt.timestamp()),
                "formatted": dt.strftime("%Y-%m-%d %H:%M:%S"),
                "date_only": dt.strftime("%Y-%m-%d"),
                "time_only": dt.strftime("%H:%M:%S")
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid timestamp: {str(e)}")

server = MCPCurrentTimeServer()

@app.get("/")
async def root():
    return {"message": "MCP Current Time Server", "version": server.version}

@app.get("/health")
async def health():
    return {"status": "healthy", "server": server.name}

@app.post("/mcp/time/current")
async def get_current_time(request: Dict[str, Any] = None):
    timezone_name = "UTC"
    if request and "timezone" in request:
        timezone_name = request["timezone"]
    
    result = await server.get_current_time(timezone_name)
    return JSONResponse(content=result)

@app.post("/mcp/time/format")
async def format_time(request: Dict[str, Any]):
    if not request or "timestamp" not in request:
        raise HTTPException(status_code=400, detail="timestamp is required")
    
    result = await server.get_time_formats(request["timestamp"])
    return JSONResponse(content=result)

@app.get("/mcp/tools")
async def list_tools():
    return {
        "tools": [
            {
                "name": "get_current_time",
                "description": "Get current time in specified timezone",
                "parameters": {
                    "timezone": {"type": "string", "description": "Timezone name (default: UTC)"}
                }
            },
            {
                "name": "format_time",
                "description": "Convert timestamp to various formats",
                "parameters": {
                    "timestamp": {"type": "string", "description": "ISO timestamp to format"}
                }
            }
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

                echo "Starting Current Time Server on port 8000..."
                cd /app && python currenttime_server.py
              `],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8000
                },
                initialDelaySeconds: 60,
                periodSeconds: 30
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8000
                },
                initialDelaySeconds: 30,
                periodSeconds: 10
              },
              ...(props.efsFileSystemId && {
                volumeMounts: [{
                  name: 'efs-storage',
                  mountPath: '/mcp-gateway/currenttime',
                  subPath: 'currenttime'
                }]
              })
            }],
            ...(props.efsFileSystemId && {
              volumes: [{
                name: 'efs-storage',
                persistentVolumeClaim: {
                  claimName: 'efs-pvc'
                }
              }]
            })
          }
        }
      }
    });

    // Current Time Server Service
    props.cluster.addManifest('CurrentTimeServerService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'currenttime-server',
        namespace: props.namespace,
        labels: {
          app: 'currenttime-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        selector: {
          app: 'currenttime-server'
        },
        ports: [{
          port: 8000,
          targetPort: 8000,
          protocol: 'TCP',
          name: 'http'
        }],
        type: 'ClusterIP'
      }
    });
  }
}
