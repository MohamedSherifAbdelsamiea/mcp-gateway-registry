import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';

export interface FinInfoServerDeploymentProps {
  cluster: eks.ICluster;
  namespace: string;
  efsFileSystemId?: string;
}

export class FinInfoServerDeployment extends Construct {
  constructor(scope: Construct, id: string, props: FinInfoServerDeploymentProps) {
    super(scope, id);

    // Financial Info Server Deployment
    props.cluster.addManifest('FinInfoServerDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'fininfo-server',
        namespace: props.namespace,
        labels: {
          app: 'fininfo-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: {
            app: 'fininfo-server'
          }
        },
        template: {
          metadata: {
            labels: {
              app: 'fininfo-server',
              'managed-by': 'cdk'
            }
          },
          spec: {
            containers: [{
              name: 'fininfo-server',
              image: 'python:3.12-slim',
              ports: [{
                containerPort: 8001
              }],
              env: [
                {
                  name: 'PORT',
                  value: '8001'
                },
                {
                  name: 'PYTHONUNBUFFERED',
                  value: '1'
                },
                {
                  name: 'MCP_SERVER_NAME',
                  value: 'fininfo-server'
                },
                {
                  name: 'POLYGON_API_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'mcp-gateway-secrets',
                      key: 'polygon-api-key',
                      optional: true
                    }
                  }
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
                echo "Installing MCP Financial Info Server dependencies..."
                pip install --no-cache-dir fastapi uvicorn python-multipart aiofiles requests
                
                echo "Creating Financial Info MCP Server..."
                cat > /app/fininfo_server.py << 'EOF'
import asyncio
import json
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
import uvicorn
import requests

app = FastAPI(title="MCP Financial Info Server", version="1.0.0")

class MCPFinancialInfoServer:
    def __init__(self):
        self.name = "fininfo-server"
        self.version = "1.0.0"
        self.polygon_api_key = os.getenv('POLYGON_API_KEY', '')
        
    async def get_stock_quote(self, symbol: str) -> Dict[str, Any]:
        """Get stock quote for a symbol"""
        try:
            # Mock data for demonstration - replace with real API call
            mock_data = {
                "symbol": symbol.upper(),
                "price": 150.25,
                "change": 2.50,
                "change_percent": 1.69,
                "volume": 1000000,
                "market_cap": "2.5T",
                "pe_ratio": 25.5,
                "timestamp": "2024-01-01T10:00:00Z",
                "source": "mock_data"
            }
            
            if self.polygon_api_key:
                # If API key is available, you could make real API calls here
                # url = f"https://api.polygon.io/v2/aggs/ticker/{symbol}/prev"
                # headers = {"Authorization": f"Bearer {self.polygon_api_key}"}
                # response = requests.get(url, headers=headers)
                # if response.status_code == 200:
                #     return response.json()
                pass
                
            return mock_data
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error getting stock quote: {str(e)}")
    
    async def get_market_summary(self) -> Dict[str, Any]:
        """Get market summary"""
        try:
            return {
                "indices": {
                    "SPY": {"price": 450.25, "change": 5.50, "change_percent": 1.24},
                    "QQQ": {"price": 375.80, "change": -2.30, "change_percent": -0.61},
                    "DIA": {"price": 340.15, "change": 1.85, "change_percent": 0.55}
                },
                "market_status": "open",
                "last_updated": "2024-01-01T10:00:00Z",
                "source": "mock_data"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error getting market summary: {str(e)}")
    
    async def get_crypto_price(self, symbol: str) -> Dict[str, Any]:
        """Get cryptocurrency price"""
        try:
            # Mock crypto data
            crypto_prices = {
                "BTC": 45000.00,
                "ETH": 3200.00,
                "ADA": 0.85,
                "SOL": 95.50
            }
            
            price = crypto_prices.get(symbol.upper(), 100.00)
            return {
                "symbol": symbol.upper(),
                "price": price,
                "change_24h": price * 0.02,  # Mock 2% change
                "change_percent_24h": 2.0,
                "volume_24h": 1000000000,
                "market_cap": price * 19000000,  # Mock market cap
                "timestamp": "2024-01-01T10:00:00Z",
                "source": "mock_data"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error getting crypto price: {str(e)}")

server = MCPFinancialInfoServer()

@app.get("/")
async def root():
    return {"message": "MCP Financial Info Server", "version": server.version}

@app.get("/health")
async def health():
    return {"status": "healthy", "server": server.name}

@app.post("/mcp/finance/stock")
async def get_stock_quote(request: Dict[str, Any]):
    if not request or "symbol" not in request:
        raise HTTPException(status_code=400, detail="symbol is required")
    
    result = await server.get_stock_quote(request["symbol"])
    return JSONResponse(content=result)

@app.post("/mcp/finance/market")
async def get_market_summary():
    result = await server.get_market_summary()
    return JSONResponse(content=result)

@app.post("/mcp/finance/crypto")
async def get_crypto_price(request: Dict[str, Any]):
    if not request or "symbol" not in request:
        raise HTTPException(status_code=400, detail="symbol is required")
    
    result = await server.get_crypto_price(request["symbol"])
    return JSONResponse(content=result)

@app.get("/mcp/tools")
async def list_tools():
    return {
        "tools": [
            {
                "name": "get_stock_quote",
                "description": "Get stock quote for a symbol",
                "parameters": {
                    "symbol": {"type": "string", "description": "Stock symbol (e.g., AAPL)"}
                }
            },
            {
                "name": "get_market_summary",
                "description": "Get overall market summary",
                "parameters": {}
            },
            {
                "name": "get_crypto_price",
                "description": "Get cryptocurrency price",
                "parameters": {
                    "symbol": {"type": "string", "description": "Crypto symbol (e.g., BTC)"}
                }
            }
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
EOF

                echo "Starting Financial Info Server on port 8001..."
                cd /app && python fininfo_server.py
              `],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8001
                },
                initialDelaySeconds: 60,
                periodSeconds: 30
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 8001
                },
                initialDelaySeconds: 30,
                periodSeconds: 10
              },
              ...(props.efsFileSystemId && {
                volumeMounts: [{
                  name: 'efs-storage',
                  mountPath: '/mcp-gateway/fininfo',
                  subPath: 'fininfo'
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

    // Financial Info Server Service
    props.cluster.addManifest('FinInfoServerService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'fininfo-server',
        namespace: props.namespace,
        labels: {
          app: 'fininfo-server',
          'managed-by': 'cdk'
        }
      },
      spec: {
        selector: {
          app: 'fininfo-server'
        },
        ports: [{
          port: 8001,
          targetPort: 8001,
          protocol: 'TCP',
          name: 'http'
        }],
        type: 'ClusterIP'
      }
    });
  }
}
