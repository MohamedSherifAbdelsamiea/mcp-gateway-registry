#!/bin/bash

# MCP Gateway Registry CDK Deployment Script
# Usage: ./deploy.sh [synth|deploy|destroy|diff|status] [--profile PROFILE_NAME]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
AWS_PROFILE=""
CDK_PROFILE_ARG=""

# Parse command line arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            AWS_PROFILE="$2"
            CDK_PROFILE_ARG="--profile $2"
            export AWS_PROFILE="$2"
            shift 2
            ;;
        synth|deploy|destroy|diff|status|monitor|logs|help)
            COMMAND="$1"
            shift
            ;;
        *)
            if [ -z "$COMMAND" ]; then
                COMMAND="$1"
            fi
            shift
            ;;
    esac
done

# Set default command if none provided
if [ -z "$COMMAND" ]; then
    COMMAND="help"
fi

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show current AWS profile
show_aws_profile() {
    if [ -n "$AWS_PROFILE" ]; then
        print_status "Using AWS Profile: $AWS_PROFILE"
        
        # Show current AWS identity
        if command -v aws &> /dev/null; then
            local identity=$(aws sts get-caller-identity --output text --query 'Account' 2>/dev/null || echo "Unable to get identity")
            print_status "AWS Account: $identity"
        fi
    else
        print_warning "Using default AWS profile"
        print_warning "Consider using --profile flag for specific deployments"
    fi
}

# Check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    # Check CDK CLI
    if ! command -v cdk &> /dev/null; then
        print_error "AWS CDK CLI is not installed. Install with: npm install -g aws-cdk"
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI first."
        exit 1
    fi
    
    print_success "All prerequisites are installed"
}

# Load environment variables
load_config() {
    if [ -f .env ]; then
        print_status "Loading configuration from .env file..."
        export $(cat .env | grep -v '^#' | xargs)
    else
        print_warning ".env file not found. Using environment variables or CDK context."
    fi
    
    # Show deployment mode
    local mode=${DEPLOYMENT_MODE:-complete}
    if [ "$mode" = "complete" ]; then
        print_status "🚀 Deployment Mode: COMPLETE INFRASTRUCTURE"
        print_status "   Will create: VPC + EKS + EFS + Certificate + Cognito + Application"
    elif [ "$mode" = "application-only" ]; then
        print_status "📦 Deployment Mode: APPLICATION ONLY"
        print_status "   Requires: Existing EKS cluster and EFS file system"
    else
        print_error "Invalid DEPLOYMENT_MODE: $mode. Use 'complete' or 'application-only'"
        exit 1
    fi
}

# Validate required configuration
validate_config() {
    print_status "Validating configuration..."
    
    local missing_vars=()
    local mode=${DEPLOYMENT_MODE:-complete}
    
    # Check for required variables (both modes)
    if [ -z "$DOMAIN_NAME" ] && [ -z "$(cat cdk.context.json 2>/dev/null | jq -r '.domainName // empty')" ]; then
        missing_vars+=("DOMAIN_NAME")
    fi
    
    if [ -z "$ADMIN_PASSWORD" ] && [ -z "$(cat cdk.context.json 2>/dev/null | jq -r '.adminPassword // empty')" ]; then
        missing_vars+=("ADMIN_PASSWORD")
    fi
    
    # Mode-specific validation
    if [ "$mode" = "application-only" ]; then
        if [ -z "$EFS_FILE_SYSTEM_ID" ] && [ -z "$(cat cdk.context.json 2>/dev/null | jq -r '.efsFileSystemId // empty')" ]; then
            missing_vars+=("EFS_FILE_SYSTEM_ID (required for application-only mode)")
        fi
    fi
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required configuration:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Set these in .env file or cdk.context.json"
        exit 1
    fi
    
    # Check certificate configuration
    local has_cert_arn=false
    local has_create_cert=false
    
    if [ -n "$CERTIFICATE_ARN" ] || [ -n "$(cat cdk.context.json 2>/dev/null | jq -r '.certificateArn // empty')" ]; then
        has_cert_arn=true
    fi
    
    if [ "$CREATE_CERTIFICATE" = "true" ] || [ "$(cat cdk.context.json 2>/dev/null | jq -r '.createCertificate // empty')" = "true" ]; then
        has_create_cert=true
    fi
    
    if [ "$has_cert_arn" = false ] && [ "$has_create_cert" = false ]; then
        if [ "$mode" = "complete" ]; then
            print_status "No certificate configuration found. Will create new certificate with DNS validation."
        else
            print_warning "No certificate configuration found. Will create new certificate with DNS validation."
            print_warning "To use existing certificate, set CERTIFICATE_ARN"
            print_warning "To disable certificate creation, set CREATE_CERTIFICATE=false"
        fi
    fi
    
    print_success "Configuration is valid"
}

# Install npm dependencies
install_dependencies() {
    print_status "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Synthesize CDK stack
synth_stack() {
    print_status "Synthesizing CDK stack..."
    show_aws_profile
    cdk synth $CDK_PROFILE_ARG
    print_success "CDK synthesis completed"
}

# Deploy CDK stack
deploy_stack() {
    print_status "Deploying CDK stack..."
    show_aws_profile
    cdk deploy --require-approval never $CDK_PROFILE_ARG
    print_success "CDK deployment completed"
}

# Show diff
show_diff() {
    print_status "Showing CDK diff..."
    show_aws_profile
    cdk diff $CDK_PROFILE_ARG
}

# Destroy stack
destroy_stack() {
    print_warning "This will destroy all resources. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        print_status "Destroying CDK stack..."
        show_aws_profile
        cdk destroy --force $CDK_PROFILE_ARG
        print_success "CDK stack destroyed"
    else
        print_status "Destroy cancelled"
    fi
}

# Check deployment status
check_status() {
    print_status "Checking deployment status..."
    
    # Check if namespace exists
    if kubectl get namespace kubeflow-user-example-com &> /dev/null; then
        print_success "Namespace exists"
        
        # Check pods
        echo ""
        print_status "Pod status:"
        kubectl get pods -n kubeflow-user-example-com
        
        # Check services
        echo ""
        print_status "Service status:"
        kubectl get services -n kubeflow-user-example-com
        
        # Check ingress
        echo ""
        print_status "Ingress status:"
        kubectl get ingress -n kubeflow-user-example-com
        
        # Check if registry is ready
        if kubectl get pods -n kubeflow-user-example-com -l app=registry -o jsonpath='{.items[0].status.phase}' 2>/dev/null | grep -q "Running"; then
            print_success "Registry service is running"
            
            # Get external URL
            DOMAIN=$(kubectl get ingress registry-ingress -n kubeflow-user-example-com -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "Not available")
            if [ "$DOMAIN" != "Not available" ]; then
                print_success "External URL: https://$DOMAIN"
            fi
        else
            print_warning "Registry service is not ready yet"
        fi
    else
        print_error "Namespace not found. Stack may not be deployed."
    fi
}

# Monitor deployment
monitor_deployment() {
    print_status "Monitoring deployment progress..."
    print_status "Press Ctrl+C to stop monitoring"
    
    while true; do
        clear
        echo "=== MCP Gateway Registry Deployment Status ==="
        echo "$(date)"
        echo ""
        
        # Check pods
        echo "Pods:"
        kubectl get pods -n kubeflow-user-example-com 2>/dev/null || echo "Namespace not found"
        
        echo ""
        echo "Services:"
        kubectl get services -n kubeflow-user-example-com 2>/dev/null || echo "No services found"
        
        echo ""
        echo "Ingress:"
        kubectl get ingress -n kubeflow-user-example-com 2>/dev/null || echo "No ingress found"
        
        sleep 10
    done
}

# Show logs
show_logs() {
    local service=${2:-registry}
    print_status "Showing logs for $service service..."
    kubectl logs -f deployment/$service -n kubeflow-user-example-com
}

# Main script logic
main() {
    local command=${1:-help}
    
    case $command in
        "synth")
            check_prerequisites
            load_config
            validate_config
            install_dependencies
            synth_stack
            ;;
        "deploy")
            check_prerequisites
            load_config
            validate_config
            install_dependencies
            synth_stack
            deploy_stack
            print_success "Deployment completed!"
            print_status "Run './deploy.sh status' to check deployment status"
            print_status "Run './deploy.sh monitor' to monitor progress"
            ;;
        "destroy")
            check_prerequisites
            destroy_stack
            ;;
        "diff")
            check_prerequisites
            load_config
            validate_config
            install_dependencies
            show_diff
            ;;
        "status")
            check_status
            ;;
        "monitor")
            monitor_deployment
            ;;
        "logs")
            show_logs $@
            ;;
        "help"|*)
            echo "MCP Gateway Registry CDK Deployment Script"
            echo ""
            echo "Usage: $0 [command] [--profile PROFILE_NAME]"
            echo ""
            echo "Commands:"
            echo "  synth    - Synthesize CDK stack (validate without deploying)"
            echo "  deploy   - Deploy the CDK stack"
            echo "  destroy  - Destroy the CDK stack"
            echo "  diff     - Show differences between deployed and current state"
            echo "  status   - Check deployment status"
            echo "  monitor  - Monitor deployment progress (live updates)"
            echo "  logs     - Show logs for a service (default: registry)"
            echo "  help     - Show this help message"
            echo ""
            echo "Options:"
            echo "  --profile PROFILE_NAME    Use specific AWS profile"
            echo ""
            echo "Examples:"
            echo "  $0 deploy                           # Deploy with default profile"
            echo "  $0 deploy --profile mcp-deployment  # Deploy with specific profile"
            echo "  $0 synth --profile staging          # Validate with staging profile"
            echo "  $0 status                           # Check status"
            echo "  $0 logs registry --profile prod     # Show registry logs"
            echo ""
            echo "AWS Profile Examples:"
            echo "  --profile default                   # Use default AWS profile"
            echo "  --profile mcp-deployment           # Use named profile"
            echo "  --profile mcp-staging              # Use staging profile"
            echo "  --profile mcp-production           # Use production profile"
            echo ""
            echo "Configuration:"
            echo "  Set configuration in .env file or cdk.context.json"
            echo "  Required: DOMAIN_NAME, EFS_FILE_SYSTEM_ID, ADMIN_PASSWORD"
            echo "  Certificate: CERTIFICATE_ARN (existing) OR CREATE_CERTIFICATE=true (new)"
            echo ""
            echo "AWS Profile Setup:"
            echo "  aws configure --profile mcp-deployment"
            echo "  export AWS_PROFILE=mcp-deployment"
            ;;
    esac
}

# Run main function with all arguments
main "$@"
