# MCP Gateway Registry Network Configuration

This directory contains configuration files for the MCP Gateway Registry networking setup.

## Files

- `network.yaml`: Main network configuration file that defines all network-related settings for the MCP Gateway Registry

## Usage

The `network.yaml` file contains comprehensive network settings for:

- Main application host/port configuration
- Nginx proxy settings for HTTP/HTTPS
- AWS infrastructure details (EKS, ALB, security groups)
- Kubernetes deployment network configuration
- DNS settings
- API endpoint paths
- External service integrations
- Security settings (CORS, rate limiting)

## Implementation

To use this configuration in your application:

1. Load the YAML file in your application code
2. Reference the appropriate sections for network-related settings
3. Use the configuration values when setting up:
   - Web server bindings
   - Proxy configurations
   - Kubernetes deployments
   - API endpoint routing

## Example

```python
import yaml

# Load network configuration
with open('config/network.yaml', 'r') as file:
    network_config = yaml.safe_load(file)

# Access configuration values
app_port = network_config['app']['port']
base_url = network_config['app']['base_url']
```

## Notes

- The ALB configuration includes health check settings that have been optimized based on previous troubleshooting
- Security group IDs and ARNs are specific to the current AWS environment
- SSL certificate configuration is included for HTTPS support